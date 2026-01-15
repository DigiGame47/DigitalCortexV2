/* ===========================
   ventas.js - MÓDULO DE VENTAS
   
   Firestore collections:
   - "VENTAS": registro de ventas
   - "productos": inventario (para cargar productos disponibles)
   
   Funcionalidad:
   - Crear, editar, eliminar ventas
   - Seleccionar producto del inventario
   - Calcular automáticamente ganancia
   - Descuenta stock en transacción (NEW mode)
   =========================== */

import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc,
  serverTimestamp, query, orderBy, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ===========================
   HELPERS & CONSTANTS
   ========================= */
const $ = (q) => document.querySelector(q);

/* ===========================
   ESTADO GLOBAL DEL MÓDULO
   ========================= */
const ventasState = {
  ventas: [],
  filtered: [],
  inventario: [],
  selectedId: null,
  mode: "details", // details | new | edit
  filters: {}, // filtros de columnas activos
  _styleObserver: null, // referencia al MutationObserver para cleanup
  // PAGINACIÓN
  pageSize: 50,
  currentPage: 1,
};

// Constantes para selects
const V_ESTADO_VENTA = ["Pedido programado","Venta finalizada","Cancelado por cliente","Devolucion"];
const V_PROV_ENVIO   = ["FLASH BOX","LOS 44 EXPRESS","OTRO","RETIRO EN LOCAL"];
const V_LIQ          = ["SI","NO"];
const V_RECAUDO      = ["EFECTIVO","PAYPAL","TRANSFERENCIA","CHIVO WALLET","WOMPY TC","OTRO"];

// Funciones utilitarias
function n(v){ return Number(v || 0); }
function money(v){ return n(v).toFixed(2); }
function norm(s){ return (s||"").toString().trim().toUpperCase(); }
function normalize(s){ return (s||"").toString().trim().toUpperCase(); }
function normalizeEstadoVenta(estado) {
  const estadoNorm = (estado || "").trim().toLowerCase();
  const mapeo = {
    "pedido programado": "Pedido programado",
    "venta finalizada": "Venta finalizada",
    "cancelado por cliente": "Cancelado por cliente",
    "devolucion": "Devolucion"
  };
  return mapeo[estadoNorm] || estado;
}
function todayISO(){
  const d = new Date();
  const pad = (x)=> String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// Conversión de fecha Excel a ISO
function excelDateToISO(excelDate) {
  if (!excelDate) return "";
  // Evitar procesar strings literales "undefined"
  if (excelDate === "undefined" || excelDate.toString().toLowerCase() === "undefined") return "";
  const num = Number(excelDate);
  if (isNaN(num)) {
    // Si ya es un string con formato de fecha, devolverlo
    const str = (excelDate + "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str; // YYYY-MM-DD
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      // DD/MM/YYYY → YYYY-MM-DD
      const [d, m, y] = str.split("/");
      return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    // No coincide con formato conocido
    return "";
  }
  // Excel date serial (días desde 1900-01-01, con bug del 1900)
  // día 1 = 1900-01-01, día 60 = 1900-02-29 (año bisiesto falso)
  const excelEpoch = new Date(1900, 0, 1);
  const date = new Date(excelEpoch.getTime() + (num - 1) * 24 * 60 * 60 * 1000);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Formatear fecha para mostrar: YYYY-MM-DD → DD/MM/YYYY
function formatFechaDisplay(fecha) {
  if (!fecha) return "";
  // Evitar procesar strings literales "undefined"
  if (fecha === "undefined" || fecha.toString().toLowerCase() === "undefined") return "";
  const isoDate = excelDateToISO(fecha);
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  // Validar que tenemos exactamente 3 partes (YYYY-MM-DD)
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return "";
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function showToast(msg, type="info"){
  // Toast simple: puede mejorarse con animaciones o librería
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 16px;
    background: ${type==="error" ? "rgba(239,68,68,.9)" : type==="success" ? "rgba(34,197,94,.9)" : "rgba(99,102,241,.9)"};
    color: white;
    border-radius: 8px;
    font-size: 12px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,.3);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(()=> toast.remove(), 3000);
}

/* ===========================
   TEMPLATE
   ========================= */
function ventasTemplate(){
  return `
  <div class="inv-grid">
    <div class="card" style="padding:14px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input id="vSearch" placeholder="Buscar (cliente, producto, teléfono, estado)..." style="min-width:280px;" class="dc-input"/>
          <select id="vEstadoVenta" class="dc-input">
            <option value="">ESTADO DE VENTA (TODOS)</option>
            ${V_ESTADO_VENTA.map(x=>`<option value="${x}">${x}</option>`).join("")}
          </select>
          <select id="vLiquidacion" class="dc-input">
            <option value="">LIQUIDACIÓN (TODOS)</option>
            ${V_LIQ.map(x=>`<option value="${x}">${x}</option>`).join("")}
          </select>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="vBtnNuevo" class="dc-btn">+ Nueva venta</button>
          <button id="vBtnDescargarCsv" class="dc-btn dc-btn-ghost" title="Descargar plantilla CSV">⬇ Plantilla</button>
          <button id="vBtnCargarCsv" class="dc-btn dc-btn-ghost" title="Cargar CSV">⬆ Cargar CSV</button>
          <button id="vBtnRefrescar" class="dc-btn dc-btn-ghost">Refrescar</button>
          <button id="vBtnToggleDrawer" class="dc-btn dc-btn-ghost" title="Minimizar/Expandir panel de detalles">▼ Detalles</button>
        </div>
      </div>

      <div style="margin-top:12px;" class="dc-table-wrap">
        <div id="cellSumIndicator" class="cell-sum-indicator" style="display:none;"></div>
        <table class="dc-table ventas-table-sticky">
          <thead>
            <tr>
              <th style="position: sticky; left: 0; z-index: 10; background: inherit;" class="th-filterable" data-col="cliente">
                CLIENTE
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th style="position: sticky; left: 200px; z-index: 10; background: inherit;" class="th-filterable" data-col="estado">
                ESTADO
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="fecha">
                FECHA
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="telefono">
                CELULAR
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th style="text-align:right;" class="th-filterable" data-col="liquidacion">
                LIQ.
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th style="text-align:right;">ENVÍO</th>
              <th style="text-align:right;">COSTO</th>
              <th class="th-filterable" data-col="producto">
                PRODUCTO
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th style="text-align:right;">PRECIO</th>
              <th style="text-align:right;">GANANCIA</th>
              <th style="text-align:right;">TOTAL</th>
              <th>Foto</th>
            </tr>
          </thead>
          <tbody id="vTbody"></tbody>
        </table>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;align-items:center;justify-content:center;" id="vPaginationDiv">
        <button id="vBtnPrevPage" class="dc-btn dc-btn-ghost" style="padding:6px 12px;font-size:12px;">← Anterior</button>
        <span id="vPageInfo" style="min-width:120px;text-align:center;font-size:12px;color:var(--muted);">Página 1</span>
        <button id="vBtnNextPage" class="dc-btn dc-btn-ghost" style="padding:6px 12px;font-size:12px;">Siguiente →</button>
      </div>
    </div>

    <div class="drawer-resizer" id="drawerResizer" title="Ajustar ancho del panel" aria-hidden="true"></div>

    <aside class="inv-drawer" id="vDrawer">
      <div id="vDrawerInner"></div>
    </aside>
  </div>
  `;
}

/* ===========================
   RESIZER
   =========================== */
function initResizer(container){
  const resizer = container.querySelector('#drawerResizer');
  const drawer = container.querySelector('#vDrawer');
  if (!resizer || !drawer) return;

  if (container.dataset.resizerBound === "1") return;
  container.dataset.resizerBound = "1";

  const saved = localStorage.getItem('dc_drawer_w');
  if (saved) document.documentElement.style.setProperty('--drawerW', saved + 'px');

  const MIN = 420, MAX = 920, BREAK = 1100;
  let dragging = false;
  let startX = 0;
  let startW = 0;

  resizer.addEventListener('pointerdown', (ev) => {
    if (window.innerWidth <= BREAK) return;
    dragging = true;
    startX = ev.clientX;
    startW = drawer.getBoundingClientRect().width;
    resizer.setPointerCapture(ev.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  function onMove(ev){
    if (!dragging) return;
    const dx = ev.clientX - startX;
    let newW = Math.round(startW + dx);
    newW = Math.max(MIN, Math.min(MAX, newW));
    document.documentElement.style.setProperty('--drawerW', newW + 'px');
  }

  function stop(ev){
    if (!dragging) return;
    dragging = false;
    try{ resizer.releasePointerCapture(ev.pointerId); } catch(e){}
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const cur = getComputedStyle(document.documentElement).getPropertyValue('--drawerW')?.trim();
    if (cur) localStorage.setItem('dc_drawer_w', cur.replace('px',''));
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', stop);
}

/* ===========================
   RENDER: TABLE
   =========================== */
function rowHTML(v){
  const img = v.imagen_url ? `<img src="${v.imagen_url}" style="width:34px;height:34px;border-radius:10px;object-fit:cover;border:1px solid rgba(15,23,42,.10)" />` : `—`;
  const fechaDisplay = formatFechaDisplay(v.fecha);
  
  // Clase condicional para el estado
  let estadoClass = "estado-otro";
  const estadoNorm = (v.estado_venta || "").toLowerCase();
  if (estadoNorm === "venta finalizada") {
    estadoClass = "estado-finalizada";
  } else if (estadoNorm === "pedido programado") {
    estadoClass = "estado-pendiente";
  }
  
  return `
    <tr class="dc-row" data-id="${v.id}">
      <td class="cell-text cell-sticky-left" style="position: sticky; left: 0; z-index: 1;" data-row="${v.id}" data-col="cliente">${v.cliente || ""}</td>
      <td class="cell-text cell-sticky-mid" style="position: sticky; left: 200px; z-index: 1;" data-row="${v.id}" data-col="estado"><span class="${estadoClass}">${v.estado_venta || ""}</span></td>
      <td class="cell-text" data-row="${v.id}" data-col="fecha" title="${v.fecha || ""}">${fechaDisplay}</td>
      <td class="cell-text" data-row="${v.id}" data-col="telefono">${v.telefono || ""}</td>
      <td class="cell-num" data-row="${v.id}" data-col="liquidacion" style="text-align:right;">${v.estado_liquidacion || ""}</td>
      <td class="cell-num" data-row="${v.id}" data-col="envio" data-value="${v.precio_envio}" style="text-align:right;">$${money(v.precio_envio)}</td>
      <td class="cell-num" data-row="${v.id}" data-col="costo" data-value="${v.costo_producto}" style="text-align:right;">$${money(v.costo_producto)}</td>
      <td class="cell-text" data-row="${v.id}" data-col="producto" title="${v.producto_key || ""}">${v.producto_key || ""}</td>
      <td class="cell-num" data-row="${v.id}" data-col="precio" data-value="${v.precio_producto}" style="text-align:right;">$${money(v.precio_producto)}</td>
      <td class="cell-num" data-row="${v.id}" data-col="ganancia" data-value="${v.ganancia}" style="text-align:right;">$${money(v.ganancia)}</td>
      <td class="cell-num" data-row="${v.id}" data-col="total" data-value="${v.total_pago_cliente}" style="text-align:right;">$${money(v.total_pago_cliente)}</td>
      <td class="cell-no-select">${img}</td>
    </tr>
  `;
}

/* ===========================
   CELL SELECTION & SUM
   =========================== */
const cellSelection = {
  selected: new Set(),
  lastSelected: null,
  
  init(tbody) {
    // Eventos de selección
    tbody.querySelectorAll(".cell-num, .cell-text").forEach(cell => {
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleCellClick(cell, e);
      });
      cell.style.cursor = "cell";
    });
  },
  
  handleCellClick(cell, e) {
    const rowId = cell.dataset.row;
    
    if (e.ctrlKey || e.metaKey) {
      // Toggle selección individual
      const key = this.getCellKey(cell);
      if (this.selected.has(key)) {
        this.selected.delete(key);
        cell.classList.remove("cell-selected");
      } else {
        this.selected.add(key);
        cell.classList.add("cell-selected");
      }
    } else if (e.shiftKey && this.lastSelected) {
      // Seleccionar rango
      this.selectRange(this.lastSelected, cell);
    } else {
      // Selección simple + mostrar detalle
      this.clearSelection();
      const key = this.getCellKey(cell);
      this.selected.add(key);
      cell.classList.add("cell-selected");
      this.lastSelected = cell;
      // Abrir detalle de la fila
      if (rowId) {
        openDetails(rowId);
      }
    }
    this.updateSum();
  },
  
  getCellKey(cell) {
    return `${cell.dataset.row}|${cell.dataset.col}`;
  },
  
  selectRange(from, to) {
    const tbody = document.querySelector(".vTbody") || document.querySelector("tbody#vTbody");
    if (!tbody) return;
    
    const fromRow = Array.from(tbody.querySelectorAll(".dc-row")).findIndex(r => r.dataset.id === from.dataset.row);
    const toRow = Array.from(tbody.querySelectorAll(".dc-row")).findIndex(r => r.dataset.id === to.dataset.row);
    
    const startRow = Math.min(fromRow, toRow);
    const endRow = Math.max(fromRow, toRow);
    
    this.clearSelection();
    
    const rows = Array.from(tbody.querySelectorAll(".dc-row"));
    for (let i = startRow; i <= endRow; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll(".cell-num, .cell-text");
      cells.forEach(cell => {
        const key = this.getCellKey(cell);
        this.selected.add(key);
        cell.classList.add("cell-selected");
      });
    }
  },
  
  clearSelection() {
    document.querySelectorAll(".cell-selected").forEach(cell => {
      cell.classList.remove("cell-selected");
    });
    this.selected.clear();
  },
  
  updateSum() {
    const tbody = document.querySelector("tbody#vTbody");
    if (!tbody) return;
    
    let total = 0;
    let count = 0;
    
    this.selected.forEach(key => {
      const [rowId, col] = key.split("|");
      const cell = tbody.querySelector(`[data-row="${rowId}"][data-col="${col}"]`);
      if (cell && cell.classList.contains("cell-num")) {
        const value = parseFloat(cell.dataset.value) || 0;
        total += value;
        count++;
      }
    });
    
    const indicator = document.getElementById("cellSumIndicator");
    if (indicator) {
      if (count > 0) {
        indicator.innerHTML = `<strong>Suma: $${total.toFixed(2)}</strong> (${count} celdas)`;
        indicator.style.display = "block";
      } else {
        indicator.style.display = "none";
      }
    }
  }
};

/* ===========================
   COLUMN FILTERS
   =========================== */
function getColumnValues(col) {
  // Obtiene valores únicos de una columna desde TODOS los datos
  const values = new Set();
  ventasState.ventas.forEach(v => {
    let val = "";
    switch(col) {
      case "fecha": 
        // Normalizar la fecha a formato YYYY/MM/DD
        let fechaRaw = v.fecha || "";
        if (fechaRaw && fechaRaw !== "undefined" && fechaRaw.toString().toLowerCase() !== "undefined") {
          // Intentar convertir de varios formatos a YYYY-MM-DD primero
          let fechaISO = excelDateToISO(fechaRaw);
          if (fechaISO && fechaISO.length > 0 && fechaISO !== "undefined") {
            const parts = fechaISO.split("-");
            if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
              val = `${parts[0]}/${parts[1]}/${parts[2]}`;
            }
          }
        }
        break;
      case "producto": val = v.producto_key || ""; break;
      case "cliente": val = v.cliente || ""; break;
      case "telefono": val = v.telefono || ""; break;
      case "estado": val = v.estado_venta || ""; break;
      case "liquidacion": val = v.estado_liquidacion || ""; break;
    }
    if (val) values.add(val);
  });
  
  // Para fecha, ordenar descendente (fechas más recientes primero)
  if (col === "fecha") {
    return Array.from(values).sort((a, b) => {
      const [ay, am, ad] = a.split("/");
      const [by, bm, bd] = b.split("/");
      // Validar que tenemos números válidos antes de comparar
      if (!ay || !am || !ad || !by || !bm || !bd) return 0;
      return new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad);
    });
  }
  
  return Array.from(values).sort();
}

function applyColumnFilter(col, value) {
  // Aplica filtro en una columna específica - soporta múltiples valores (array)
  if (value === "") {
    delete ventasState.filters[col];
  } else {
    // Para columnas de fecha, almacenar como array para permitir múltiples selecciones
    if (col === "fecha") {
      if (!ventasState.filters[col]) {
        ventasState.filters[col] = [];
      }
      // Toggle: si ya existe, remover; si no, agregar
      const idx = ventasState.filters[col].indexOf(value);
      if (idx > -1) {
        ventasState.filters[col].splice(idx, 1);
      } else {
        ventasState.filters[col].push(value);
      }
      // Si está vacío, eliminar el filtro
      if (ventasState.filters[col].length === 0) {
        delete ventasState.filters[col];
      }
    } else {
      ventasState.filters[col] = value;
    }
  }
  
  applyFilters();
}

function applyFilters() {
  // Combina búsqueda + filtros de columnas
  const search = ($("#vSearch")?.value || "").toLowerCase();
  const estadoVenta = ($("#vEstadoVenta")?.value || "").trim();
  const liquidacion = ($("#vLiquidacion")?.value || "").trim();
  const columnFilters = ventasState.filters || {};
  
  // Obtener mes actual por defecto
  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  
  ventasState.filtered = ventasState.ventas.filter(v => {
    // Búsqueda general
    if (search) {
      const str = `${v.cliente} ${v.producto_key} ${v.telefono} ${v.estado_venta}`.toLowerCase();
      if (!str.includes(search)) return false;
    }
    
    // Filtro estado venta (exact match, respetando mayúsculas)
    if (estadoVenta && (v.estado_venta || "").trim() !== estadoVenta) return false;
    
    // Filtro liquidación (exact match, respetando mayúsculas)
    if (liquidacion && (v.estado_liquidacion || "").trim() !== liquidacion) return false;
    
    // Filtros de columnas
    for (const [col, val] of Object.entries(columnFilters)) {
      // Si es un array (múltiples fechas), hacer búsqueda dentro del array
      if (Array.isArray(val)) {
        let cellVal = "";
        switch(col) {
          case "fecha": 
            // Convertir formato a YYYY/MM/DD para comparar
            let fechaRaw = v.fecha || "";
            if (fechaRaw && fechaRaw !== "undefined" && fechaRaw.toString().toLowerCase() !== "undefined") {
              let fechaISO = excelDateToISO(fechaRaw);
              if (fechaISO) {
                const parts = fechaISO.split("-");
                if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                  const [year, month, day] = parts;
                  cellVal = `${year}/${month}/${day}`;
                }
              }
            }
            break;
        }
        // Verificar si cellVal está en el array de valores seleccionados O si el mes completo está seleccionado
        const encontrado = val.some(v => {
          // Búsqueda exacta por día
          if (v === cellVal) return true;
          // Búsqueda por mes (YYYY/MM/*)
          const [year, month] = cellVal.split("/");
          const [vYear, vMonth] = v.split("/");
          if (vYear === year && vMonth === month && !v.includes("/0") && !v.includes("/1") && !v.includes("/2") && !v.includes("/3")) {
            // Es un selector de mes (formato YYYY/MM sin día específico)
            return true;
          }
          return false;
        });
        if (!encontrado) return false;
      } else {
        // Para valores string simple (no array)
        let cellVal = "";
        switch(col) {
          case "fecha": 
            // Convertir formato a YYYY/MM/DD para comparar
            let fechaRaw = v.fecha || "";
            if (fechaRaw && fechaRaw !== "undefined" && fechaRaw.toString().toLowerCase() !== "undefined") {
              let fechaISO = excelDateToISO(fechaRaw);
              if (fechaISO) {
                const parts = fechaISO.split("-");
                if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                  const [year, month, day] = parts;
                  cellVal = `${year}/${month}/${day}`;
                }
              }
            }
            break;
          case "producto": cellVal = v.producto_key || ""; break;
          case "cliente": cellVal = v.cliente || ""; break;
          case "telefono": cellVal = v.telefono || ""; break;
          case "estado": cellVal = v.estado_venta || ""; break;
          case "liquidacion": cellVal = v.estado_liquidacion || ""; break;
        }
        if (cellVal.trim() !== val.trim()) return false;
      }
    }
    
    // Por defecto, mostrar solo mes actual (si no hay filtro de fecha aplicado)
    if (!columnFilters.fecha) {
      let fechaRaw = v.fecha || "";
      if (fechaRaw && fechaRaw !== "undefined" && fechaRaw.toString().toLowerCase() !== "undefined") {
        let fechaISO = excelDateToISO(fechaRaw);
        if (fechaISO) {
          const parts = fechaISO.split("-");
          if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
            const [year, month, day] = parts;
            const fechaFormato = `${year}/${month}`;
            if (fechaFormato !== mesActual) return false;
          }
        }
      }
    }
    
    return true;
  });
  
  // Resetear a primera página cuando se aplican filtros
  ventasState.currentPage = 1;
  renderTable();
}

function renderTable(){
  const tbody = $("#vTbody");
  if(!tbody) return;
  
  // Paginación: calcular índices
  const total = ventasState.filtered.length;
  const totalPages = Math.ceil(total / ventasState.pageSize);
  
  // Validar página actual
  if (ventasState.currentPage < 1) ventasState.currentPage = 1;
  if (ventasState.currentPage > totalPages) ventasState.currentPage = totalPages || 1;
  
  const startIdx = (ventasState.currentPage - 1) * ventasState.pageSize;
  const endIdx = startIdx + ventasState.pageSize;
  const pageData = ventasState.filtered.slice(startIdx, endIdx);
  
  // Renderizar filas de la página actual
  tbody.innerHTML = pageData.map(rowHTML).join("");

  // Inicializar selección de celdas
  cellSelection.init(tbody);
  
  // Actualizar controles de paginación
  const btnPrev = $("#vBtnPrevPage");
  const btnNext = $("#vBtnNextPage");
  const pageInfo = $("#vPageInfo");
  
  if (btnPrev) btnPrev.disabled = ventasState.currentPage <= 1;
  if (btnNext) btnNext.disabled = ventasState.currentPage >= totalPages;
  if (pageInfo) pageInfo.textContent = `Página ${ventasState.currentPage} de ${totalPages || 1} (${total} registros)`;
  
  // Renderizar filtros de columnas
  bindColumnFilters();

  // click row -> detalle
  tbody.querySelectorAll(".dc-row").forEach(tr=>{
    tr.addEventListener("click", (e)=>{
      // evitar cuando se da click en botones
      if(e.target.closest("button")) return;
      const id = tr.dataset.id;
      openDetails(id);
    });
  });

  // botones
  // Doble-click para edición inline
  tbody.querySelectorAll(".cell-text").forEach(cell => {
    cell.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      enableInlineEdit(cell);
    });
  });
}

function bindColumnFilters() {
  // Binding de filtros en headers
  setTimeout(() => {
    const filterHeaders = document.querySelectorAll(".th-filterable");
    
    filterHeaders.forEach(th => {
      const col = th.dataset.col;
      const icon = th.querySelector(".filter-icon");
      const dropdown = th.querySelector(".filter-dropdown");
      
      if (!icon || !dropdown) return;
      
      // Remover eventos anteriores (si existen) para evitar duplicados
      const newIcon = icon.cloneNode(true);
      icon.parentNode.replaceChild(newIcon, icon);
      
      // Agregar evento de click
      newIcon.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Cerrar todos los otros dropdowns
        document.querySelectorAll(".filter-dropdown").forEach(d => {
          if (d !== dropdown) d.style.display = "none";
        });
        
        const isOpen = dropdown.style.display !== "none" && dropdown.style.display !== "";
        
        if (!isOpen) {
          // Renderizar opciones
          const values = getColumnValues(col);
          const currentArray = Array.isArray(ventasState.filters?.[col]) ? ventasState.filters[col] : [];
          
          // Si es filtro de fecha, agrupar jerárquicamente con multi-select
          if (col === "fecha") {
            const grouped = {};
            values.forEach(v => {
              const parts = v.split("/");
              if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                const [year, month, day] = parts;
                if (!grouped[year]) grouped[year] = {};
                if (!grouped[year][month]) grouped[year][month] = [];
                grouped[year][month].push({value: v, day});
              }
            });
            
            const yearsSorted = Object.keys(grouped).sort().reverse();
            const selectedCount = currentArray.length;
            let html = `<div style="padding:8px; max-height:400px; overflow-y:auto;">
              <div class="filter-option ${selectedCount === 0 ? "active" : ""}" data-value="" style="font-weight:bold; margin-bottom:8px; cursor:pointer;">
                ${selectedCount === 0 ? "✓" : "○"} Todos ${selectedCount > 0 ? `(${selectedCount} seleccionados)` : ""}
              </div>`;
            
            yearsSorted.forEach(year => {
              const monthsSorted = Object.keys(grouped[year]).sort().reverse();
              html += `
                <div style="margin-left:0; margin-bottom:8px;">
                  <div class="filter-group-header" style="cursor:pointer; font-weight:bold; padding:4px; background:#f0f0f0; border-radius:3px; user-select:none;" data-year="${year}">
                    ▼ ${year}
                  </div>
                  <div class="filter-group-content" style="margin-left:12px; display:block;">`;
              
              monthsSorted.forEach(month => {
                const monthNames = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                                   "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                const monthName = monthNames[parseInt(month)] || month;
                const monthKey = `${year}/${month}`;
                const daysInMonth = grouped[year][month].length;
                const selectedInMonth = grouped[year][month].filter(item => currentArray.includes(item.value)).length;
                
                html += `
                  <div style="margin-bottom:6px;">
                    <div class="filter-group-header" style="cursor:pointer; font-weight:500; padding:3px; background:#f5f5f5; border-radius:3px; margin-left:8px; user-select:none;" data-month="${monthKey}">
                      ▼ ${monthName} ${selectedInMonth > 0 ? `(${selectedInMonth}/${daysInMonth})` : ""}
                    </div>
                    <div class="filter-group-content" style="margin-left:20px; display:block;">`;
                
                grouped[year][month].forEach(item => {
                  const isSelected = currentArray.includes(item.value);
                  html += `
                    <div class="filter-option" data-value="${item.value}" style="padding:2px 4px; cursor:pointer;">
                      ${isSelected ? "✓" : "○"} Día ${item.day}
                    </div>`;
                });
                
                html += `</div></div>`;
              });
              
              html += `</div></div>`;
            });
            
            html += `</div>`;
            dropdown.innerHTML = html;
            
            // Agregar funcionalidad de expand/collapse y seleccionar mes
            dropdown.querySelectorAll(".filter-group-header").forEach(header => {
              // Toggle expand/collapse
              header.addEventListener("click", (e) => {
                e.stopPropagation();
                const content = header.nextElementSibling;
                if (content && content.classList.contains("filter-group-content")) {
                  const isVisible = content.style.display !== "none";
                  content.style.display = isVisible ? "none" : "block";
                  header.textContent = header.textContent.replace(/^[▼▶]/, isVisible ? "▶" : "▼");
                }
              });
              
              // Doble-click para seleccionar mes completo
              header.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                const monthKey = header.dataset.month;
                if (monthKey) {
                  // Es un header de mes: seleccionar/deseleccionar todos los días del mes
                  const [year, month] = monthKey.split("/");
                  if (grouped[year] && grouped[year][month]) {
                    const daysInMonth = grouped[year][month];
                    const allSelected = daysInMonth.every(item => currentArray.includes(item.value));
                    
                    daysInMonth.forEach(item => {
                      if (allSelected) {
                        const idx = currentArray.indexOf(item.value);
                        if (idx > -1) currentArray.splice(idx, 1);
                      } else {
                        if (!currentArray.includes(item.value)) currentArray.push(item.value);
                      }
                    });
                  }
                }
              });
            });
            
            // Eventos de selección en opciones individuales
            dropdown.querySelectorAll(".filter-option").forEach(opt => {
              opt.addEventListener("click", (e) => {
                e.stopPropagation();
                const value = opt.dataset.value;
                if (value === "") {
                  // Limpiar todo
                  ventasState.filters[col] = [];
                  delete ventasState.filters[col];
                  applyFilters();
                  dropdown.style.display = "none";
                } else {
                  applyColumnFilter(col, value);
                  // Mantener dropdown abierto para multi-select
                  setTimeout(() => bindColumnFilters(), 0);
                }
              });
            });
          } else {
            // Para otras columnas, mostrar lista simple
            dropdown.innerHTML = `
              <div style="padding:8px;">
                <div class="filter-option ${currentArray === "" ? "active" : ""}" data-value="">
                  ✓ Todos
                </div>
                ${values.map(v => `
                <div class="filter-option ${currentArray === v ? "active" : ""}" data-value="${v}">
                  ✓ ${v}
                </div>
              `).join("")}
              </div>
            `;
            
            // Eventos de selección en opciones
            dropdown.querySelectorAll(".filter-option").forEach(opt => {
              opt.addEventListener("click", (e) => {
                e.stopPropagation();
                const value = opt.dataset.value;
                applyColumnFilter(col, value);
                dropdown.style.display = "none";
              });
            });
          }
          
          dropdown.style.display = "block";
        } else {
          dropdown.style.display = "none";
        }
      });
    });
    
    // Cerrar dropdowns al hacer click fuera
    document.addEventListener("click", (e) => {
      // Si el click no está dentro de un encabezado filtrable, cerrar todos los dropdowns
      if (!e.target.closest(".th-filterable")) {
        document.querySelectorAll(".filter-dropdown").forEach(d => {
          d.style.display = "none";
        });
      }
    });
    
  }, 0);
}

/* ===========================
   INLINE EDITING
   =========================== */
const editableFields = ["cliente", "telefono", "fecha"];

function enableInlineEdit(cell) {
  // Doble-click para editar
  const col = cell.dataset.col;
  const rowId = cell.dataset.row;
  
  if (!editableFields.includes(col)) return;
  
  const currentValue = cell.textContent;
  
  // Crear input de edición
  const input = document.createElement("input");
  input.className = "dc-input";
  input.type = col === "fecha" ? "date" : "text";
  input.value = currentValue;
  input.style.padding = "4px 6px";
  input.style.fontSize = "13px";
  
  // Reemplazar contenido de la celda
  cell.innerHTML = "";
  cell.appendChild(input);
  cell.classList.add("editing");
  input.focus();
  input.select();
  
  // Función para guardar
  const saveEdit = async () => {
    const newValue = input.value.trim();
    
    if (newValue === currentValue) {
      // Sin cambios
      cell.classList.remove("editing");
      cell.textContent = currentValue;
      return;
    }
    
    try {
      // Mostrar estado "guardando"
      cell.innerHTML = `<span style="opacity:0.6;">Guardando...</span>`;
      
      // Obtener el documento para actualizar
      const venta = ventasState.ventas.find(v => v.id === rowId);
      if (!venta) throw new Error("Venta no encontrada");
      
      // Preparar actualización
      const updateData = {};
      updateData[col] = newValue;
      
      // Guardar en Firebase
      const docRef = db.collection("ventas").doc(rowId);
      await docRef.update(updateData);
      
      // Actualizar estado local
      venta[col] = newValue;
      
      // Actualizar vista
      cell.classList.remove("editing");
      cell.textContent = newValue;
      
    } catch (error) {
      console.error("Error guardando cambio:", error);
      cell.classList.remove("editing");
      cell.textContent = currentValue;
      alert("Error al guardar: " + error.message);
    }
  };
  
  // Guardar con Enter o Blur
  input.addEventListener("blur", saveEdit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      saveEdit();
    } else if (e.key === "Escape") {
      cell.classList.remove("editing");
      cell.textContent = currentValue;
    }
  });
}

/* ===========================
   DRAWER HTML
=========================== */
function drawerHTML(data = {}){
  const isDetails = ventasState.mode === "details";
  const dis = isDetails ? "disabled" : "";

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div>
        <div class="drawer-title">${ventasState.mode==="new" ? "Nueva venta" : ventasState.mode==="edit" ? "Editar venta" : "Detalle de venta"}</div>
        <div class="drawer-sub">${data.producto_key || ""}</div>
      </div>
      <div style="display:flex;gap:10px;">
        ${isDetails ? `<button id="vBtnImprimir" class="dc-btn" style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);">🖨️ Imprimir</button>` : ""}
        <button id="vFormNuevo" class="dc-btn dc-btn-ghost">Nueva</button>
        <button id="vFormEditar" class="dc-btn">Editar</button>
      </div>
    </div>

    <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div style="grid-column:1/-1;">
        <label class="dc-label">PRODUCTO (NOMBRE / CONDICIÓN)</label>
        <div class="producto-autocomplete-wrapper">
          <input id="vProductoInput" type="text" class="dc-input" placeholder="Buscar y seleccionar producto..." ${dis}/>
          <input id="vProducto" type="hidden" value="${data.producto_id || ""}"/>
          <div id="vProductoSuggestions" class="producto-suggestions"></div>
        </div>
      </div>

      <div>
        <label class="dc-label">CLIENTE</label>
        <input id="vCliente" class="dc-input" value="${data.cliente||""}" ${dis}/>
      </div>
      <div>
        <label class="dc-label">TELÉFONO</label>
        <input id="vTelefono" class="dc-input" value="${data.telefono||""}" ${dis}/>
      </div>

      <div style="grid-column:1/-1;">
        <label class="dc-label">DIRECCIÓN</label>
        <input id="vDireccion" class="dc-input" value="${data.direccion||""}" ${dis}/>
      </div>

      <div>
        <label class="dc-label">ESTADO DE VENTA</label>
        <select id="vEstado" class="dc-input" ${dis}>
          ${V_ESTADO_VENTA.map(x=>`<option ${data.estado_venta===x?"selected":""}>${x}</option>`).join("")}
        </select>
      </div>

      <div>
        <label class="dc-label">ESTADO DE LIQUIDACIÓN</label>
        <select id="vEstadoLiq" class="dc-input" ${dis}>
          ${V_LIQ.map(x=>`<option ${data.estado_liquidacion===x?"selected":""}>${x}</option>`).join("")}
        </select>
      </div>

      <div>
        <label class="dc-label">TIPO RECAUDO</label>
        <select id="vRecaudo" class="dc-input" ${dis}>
          ${V_RECAUDO.map(x=>`<option ${data.tipo_recaudo===x?"selected":""}>${x}</option>`).join("")}
        </select>
      </div>

      <div>
        <label class="dc-label">PROVEEDOR ENVÍO</label>
        <select id="vProvEnvio" class="dc-input" ${dis}>
          ${V_PROV_ENVIO.map(x=>`<option ${data.proveedor_envio===x?"selected":""}>${x}</option>`).join("")}
        </select>
      </div>

      <div>
        <label class="dc-label">TOTAL PAGO DE CLIENTE</label>
        <input id="vTotalPago" type="text" class="dc-input" value="${data.total_pago_cliente ? '$' + money(data.total_pago_cliente) : ""}" ${dis}/>
      </div>

      <div>
        <label class="dc-label">PRECIO ENVÍO</label>
        <div class="dc-suggest-wrap" id="vPrecioEnvioWrap" style="position: relative;">
          <input id="vPrecioEnvio" type="text" class="dc-input" value="${data.precio_envio ? '$' + money(data.precio_envio) : ""}" ${dis} style="width: 100%;"/>
          <div id="vPrecioEnvioSuggestions" class="suggestions" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 1000; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto;"></div>
        </div>
      </div>

      <div>
        <label class="dc-label">PRECIO PRODUCTO (CALCULADO)</label>
        <input id="vPrecioProducto" type="text" class="dc-input" value="$0.00" disabled/>
      </div>

      <div>
        <label class="dc-label">COSTO PRODUCTO (costo_prom)</label>
        <input id="vCostoProducto" type="text" class="dc-input" value="$0.00" disabled/>
      </div>

      <div>
        <label class="dc-label">GANANCIA (CALCULADO)</label>
        <input id="vGanancia" type="text" class="dc-input" value="$0.00" disabled/>
      </div>

      <div>
        <label class="dc-label">FECHA</label>
        <input id="vFecha" type="date" class="dc-input" value="${data.fecha || ""}" ${dis}/>
      </div>

      <div>
        <label class="dc-label">HORA DE ENTREGA</label>
        <input id="vHoraEntrega" class="dc-input" value="${data.hora_entrega||""}" placeholder="Ej: 2:30 PM" ${dis}/>
      </div>

      <div>
        <label class="dc-label">ORIGEN DE VENTA</label>
        <input id="vOrigen" class="dc-input" value="${data.origen_venta||""}" placeholder="Marketplace, Instagram..." ${dis}/>
      </div>

      <div>
        <label class="dc-label">NOMBRE DE CAMPAÑA</label>
        <input id="vCampana" class="dc-input" value="${data.nombre_campana||""}" ${dis}/>
      </div>

      <div>
        <label class="dc-label">GASTO PUBLICIDAD</label>
        <input id="vGastoPub" type="text" class="dc-input" value="${data.gasto_publicidad ? '$' + money(data.gasto_publicidad) : ""}" ${dis}/>
      </div>

      <div style="grid-column:1/-1;">
        <label class="dc-label">IMAGEN (URL)</label>
        <input id="vImagenUrl" class="dc-input" value="${data.imagen_url || ""}" placeholder="https://..." ${dis}/>
      </div>

      <div style="grid-column:1/-1;margin-top:8px;padding:10px;background:rgba(2,132,199,0.08);border-radius:8px;border-left:3px solid #0284c7;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;font-weight:600;color:var(--text);">
          <input id="vCuadrado" type="checkbox" ${data.cuadrado ? "checked" : ""} ${dis} style="cursor:pointer;width:18px;height:18px;"/>
          <span>Marcar para cuadre de caja</span>
        </label>
        <div style="font-size:0.85em;color:var(--muted);margin-top:4px;">Esta venta está lista para incluir en el cuadre de finanzas</div>
      </div>
    </div>

    <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end;align-items:center;">
      ${isDetails ? `<div id="vCuadradoDisplay" style="display:${data.cuadrado ? "block" : "none"};color:#10b981;font-weight:600;font-size:0.9em;">✓ Marcada para cuadre</div>` : ""}
      ${isDetails ? "" : `<button id="vGuardar" class="dc-btn">Guardar</button>`}
      ${isDetails ? "" : `<button id="vCancelar" class="dc-btn dc-btn-ghost">Cancelar</button>`}
    </div>
  `;
}

function renderDrawer(data){
  const inner = $("#vDrawerInner");
  if(!inner) return;
  
  // Clonar el nodo para remover listeners anteriores
  const newInner = inner.cloneNode(false);
  newInner.innerHTML = drawerHTML(data || {});
  inner.parentNode.replaceChild(newInner, inner);
  
  // Actualizar referencia para los setTimeout siguientes
  const updatedInner = $("#vDrawerInner");
  
  // Estilos controlados por CSS en app.css; no forzamos inline.
  
  bindDrawerEvents();
  recalcVentaFields();
}

/* ===========================
   EVENTS: HEADER FILTERS
=========================== */
function bindHeaderEvents(){
  $("#vSearch")?.addEventListener("input", applyFilters);
  $("#vEstadoVenta")?.addEventListener("change", applyFilters);
  $("#vLiquidacion")?.addEventListener("change", applyFilters);

  $("#vBtnNuevo")?.addEventListener("click", ()=>{
    ventasState.mode = "new";
    ventasState.selectedId = null;
    renderDrawer({
      fecha: todayISO(),
      estado_venta: "Pedido programado",
      estado_liquidacion: "NO",
      tipo_recaudo: "EFECTIVO",
      proveedor_envio: "FLASH BOX",
      precio_envio: 0,
      total_pago_cliente: 0,
      gasto_publicidad: 0
    });
  });

  // CSV handlers
  $("#vBtnDescargarCsv")?.addEventListener("click", descargarPlantillaVentas);
  
  $("#vBtnCargarCsv")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const csvText = evt.target?.result;
          if (typeof csvText === "string") {
            const parsed = parseCSVVentas(csvText);
            console.log("Parsed CSV Ventas:", parsed);
            if (parsed.rows.length > 0) {
              mostrarVistaPreviaVentas(parsed);
            } else {
              const lines = csvText.trim().split("\n");
              const headers = lines[0];
              alert(`No se encontraron ventas en el CSV.\n\nCabecera detectada:\n${headers}\n\nAsegúrate de que:\n1. La primera fila sea la cabecera\n2. Haya al menos una fila de datos\n3. El campo "cliente" esté presente`);
            }
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  });

  $("#vBtnRefrescar")?.addEventListener("click", async ()=>{
    await ventasLoadAll();
  });

  // Toggle drawer (minimizar/expandir panel de detalles)
  $("#vBtnToggleDrawer")?.addEventListener("click", ()=>{
    const container = document.querySelector('.page-ventas .inv-grid');
    const btn = document.getElementById('vBtnToggleDrawer');
    if (container && btn) {
      const isMinimized = container.classList.toggle('drawer-minimized');
      btn.textContent = isMinimized ? '▶ Detalles' : '▼ Detalles';
      localStorage.setItem('dc_ventas_drawer_minimized', isMinimized ? '1' : '0');
    }
  });

  // Paginación
  $("#vBtnPrevPage")?.addEventListener("click", () => {
    if (ventasState.currentPage > 1) {
      ventasState.currentPage--;
      renderTable();
    }
  });

  $("#vBtnNextPage")?.addEventListener("click", () => {
    const totalPages = Math.ceil(ventasState.filtered.length / ventasState.pageSize);
    if (ventasState.currentPage < totalPages) {
      ventasState.currentPage++;
      renderTable();
    }
  });
}

/* ===========================
   EVENTS: DRAWER
=========================== */
function bindDrawerEvents(){
  $("#vFormNuevo")?.addEventListener("click", ()=>{
    ventasState.mode = "new";
    ventasState.selectedId = null;
    renderDrawer({
      fecha: todayISO(),
      estado_venta: "Pedido programado",
      estado_liquidacion: "NO",
      tipo_recaudo: "EFECTIVO",
      proveedor_envio: "FLASH BOX",
      precio_envio: 0,
      total_pago_cliente: 0,
      gasto_publicidad: 0
    });
  });

  $("#vFormEditar")?.addEventListener("click", ()=>{
    if(!ventasState.selectedId) return;
    ventasState.mode = "edit";
    const v = ventasState.ventas.find(x=>x.id===ventasState.selectedId);
    renderDrawer(v || {});
  });

  // Botón Imprimir Ticket (solo en modo details)
  $("#vBtnImprimir")?.addEventListener("click", ()=>{
    if(!ventasState.selectedId) {
      alert("No hay venta seleccionada para imprimir.");
      return;
    }
    abrirVistaPrevia(ventasState.selectedId);
  });

  // Función para formatear input de moneda mientras se digita
  const formatMoneyInput = (input) => {
    if (!input) return;
    input.addEventListener("keypress", (e) => {
      // Solo permitir números y punto
      const char = e.key;
      if (!/[0-9.]/.test(char)) {
        e.preventDefault();
      }
    });
    
    input.addEventListener("blur", (e) => {
      // Formatear con $ solo al salir del campo
      let val = e.target.value.replace(/[^0-9.]/g, "");
      if (val) {
        const num = parseFloat(val) || 0;
        e.target.value = "$" + money(num);
      }
    });
    
    input.addEventListener("focus", (e) => {
      // Remover $ al entrar para permitir edición
      e.target.value = e.target.value.replace(/[^0-9.]/g, "");
    });
  };

  formatMoneyInput($("#vTotalPago"));
  formatMoneyInput($("#vPrecioEnvio"));
  formatMoneyInput($("#vGastoPub"));

  // Autocomplete para Producto
  const productoInput = $("#vProductoInput");
  const productoField = $("#vProducto");
  const productoSuggestions = $("#vProductoSuggestions");

  if(productoInput && productoField && productoSuggestions){
    // Restaurar el valor del input si ya hay un producto seleccionado
    const currentProdId = productoField.value;
    if(currentProdId){
      const prod = ventasState.inventario.find(p=>p.id === currentProdId);
      if(prod) productoInput.value = prod.producto_key;
    }

    const showSuggestions = (query) => {
      const filtered = ventasState.inventario.filter(p=>{
        return norm(p.producto_key).includes(query) || query === "";
      });
      
      if(filtered.length === 0){
        productoSuggestions.innerHTML = `<div class="producto-suggestion-item">No hay coincidencias</div>`;
        productoSuggestions.classList.add("visible");
      } else {
        productoSuggestions.innerHTML = filtered
          .map(p=>`<div class="producto-suggestion-item" data-id="${p.id}" data-key="${p.producto_key}">${p.producto_key}</div>`)
          .join("");
        productoSuggestions.classList.add("visible");
        
        // Bind click events a cada sugerencia
        productoSuggestions.querySelectorAll(".producto-suggestion-item").forEach(item=>{
          item.addEventListener("click", ()=>{
            const id = item.dataset.id;
            const key = item.dataset.key;
            productoField.value = id;
            productoInput.value = key;
            productoSuggestions.classList.remove("visible");
            recalcVentaFields();
          });
        });
      }
    };

    productoInput.addEventListener("input", (e)=>{
      const query = norm(e.target.value);
      if(query === "") {
        productoSuggestions.classList.remove("visible");
      } else {
        showSuggestions(query);
      }
    });

    productoInput.addEventListener("focus", (e)=>{
      const query = norm(e.target.value);
      if(query !== "") {
        showSuggestions(query);
      }
    });

    productoInput.addEventListener("blur", ()=>{
      // Pequeño delay para permitir que el click en sugerencia se procese
      setTimeout(()=>{
        productoSuggestions.classList.remove("visible");
        // Validar que si hay texto, exista un producto seleccionado
        if(productoInput.value && !productoField.value){
          productoInput.value = "";
        }
      }, 200);
    });
  }

  // recalcular cuando cambian totales/envío o producto
  $("#vTotalPago")?.addEventListener("input", recalcVentaFields);
  
  // Sugerencias de precio de envío
  const vPrecioEnvioInput = $("#vPrecioEnvio");
  const vPrecioEnvioSuggestions = $("#vPrecioEnvioSuggestions");
  
  if (vPrecioEnvioInput && vPrecioEnvioSuggestions) {
    vPrecioEnvioInput.addEventListener("focus", () => {
      const totalCliente = n($("#vTotalPago")?.value || 0);
      const calculado = Math.round((4 + (totalCliente * 0.02)) * 100) / 100;
      
      const sugerencias = [
        { valor: 0, label: "$0" },
        { valor: 3, label: "$3" },
        { valor: 3.50, label: "$3.50" },
        { valor: calculado, label: `$${money(calculado)} (4 + 2% del total)` }
      ];
      
      let html = sugerencias.map(s => `
        <div class="suggestion-item" data-value="${s.valor}" style="padding: 10px 12px; cursor: pointer; color: #1a1a1a; font-size: 13px; border-bottom: 1px solid #e0e0e0; transition: background 0.2s ease;">
          ${s.label}
        </div>
      `).join("");
      
      vPrecioEnvioSuggestions.innerHTML = html;
      vPrecioEnvioSuggestions.style.display = "block";
      
      // Agregar eventos a las sugerencias
      vPrecioEnvioSuggestions.querySelectorAll(".suggestion-item").forEach(item => {
        item.addEventListener("click", (e) => {
          const valor = n(e.target.dataset.value);
          vPrecioEnvioInput.value = "$" + money(valor);
          vPrecioEnvioSuggestions.style.display = "none";
          recalcVentaFields();
        });
        
        item.addEventListener("mouseenter", () => {
          item.style.backgroundColor = "#f5f5f5";
        });
        
        item.addEventListener("mouseleave", () => {
          item.style.backgroundColor = "transparent";
        });
      });
    });
    
    vPrecioEnvioInput.addEventListener("blur", () => {
      setTimeout(() => {
        vPrecioEnvioSuggestions.style.display = "none";
      }, 200);
    });
    
    vPrecioEnvioInput.addEventListener("input", recalcVentaFields);
  }

  $("#vGuardar")?.addEventListener("click", saveVenta);
  $("#vCancelar")?.addEventListener("click", ()=>{
    ventasState.mode = "details";
    const v = ventasState.selectedId ? ventasState.ventas.find(x=>x.id===ventasState.selectedId) : null;
    renderDrawer(v || {});
  });

  // Toggle cuadrado en modo details
  const vCuadradoCheckbox = $("#vCuadrado");
  if(vCuadradoCheckbox && ventasState.mode === "details" && ventasState.selectedId){
    vCuadradoCheckbox.addEventListener("change", async (e) => {
      const valor = e.target.checked;
      try {
        await updateDoc(doc(db, "VENTAS", ventasState.selectedId), {
          cuadrado: valor,
          updated_at: serverTimestamp(),
        });
        const displayEl = $("#vCuadradoDisplay");
        if(displayEl) {
          displayEl.style.display = valor ? "block" : "none";
        }
        showToast(valor ? "Venta marcada para cuadre" : "Venta desmarcada del cuadre", "success");
        await ventasLoadAll();
      } catch(err) {
        showToast("Error al actualizar: " + err.message, "error");
        e.target.checked = !valor; // revertir
      }
    });
  }
}

function recalcVentaFields(){
  // Función para extraer número de string con $
  const parseMoneyInput = (val) => {
    const cleaned = String(val || "").replace(/[^0-9.]/g, "");
    return n(cleaned || "0");
  };

  const productoId = $("#vProducto")?.value || "";
  const totalPago = parseMoneyInput($("#vTotalPago")?.value);
  const precioEnvio = parseMoneyInput($("#vPrecioEnvio")?.value);

  const precioProducto = totalPago - precioEnvio;
  $("#vPrecioProducto").value = "$" + money(precioProducto);

  let costo = 0;
  let prodKey = "";
  let img = "";

  if(productoId){
    const p = ventasState.inventario.find(x=>x.id===productoId);
    if(p){
      costo = n(p.costo_prom);
      prodKey = p.producto_key;
      img = p.imagen_url || "";
    }
  }
  $("#vCostoProducto").value = "$" + money(costo);

  const gan = precioProducto - costo;
  $("#vGanancia").value = "$" + money(gan);

  // Auto completar imagen si no hay
  const imgInput = $("#vImagenUrl");
  if(imgInput && !imgInput.value && img) imgInput.value = img;
}

/* ===========================
   CRUD
=========================== */
async function ventasLoadAll(){
  try {
    // Cargar PRODUCTOS del inventario
    const invSnap = await getDocs(query(collection(db,"productos"), orderBy("nombre","asc")));
    ventasState.inventario = invSnap.docs.map(d=>{
      const x = d.data();
      const nombre = x.nombre || x.NOMBRE || "";
      const condicion = x.condicion || x.CONDICION || "";
      const key = condicion ? `${norm(nombre)} / ${norm(condicion)}` : norm(nombre);

      return {
        id: d.id,
        nombre: norm(nombre),
        condicion: norm(condicion),
        producto_key: key,
        stock: n(x.stock ?? 0),
        costo_prom: n(x.costo_prom ?? 0),
        imagen_url: x.imagen_url || x.foto_url || ""
      };
    });

    // Cargar VENTAS
    const vSnap = await getDocs(query(collection(db,"VENTAS"), orderBy("created_at","desc")));
    ventasState.ventas = vSnap.docs.map(d=>({ id: d.id, ...d.data() }));
    ventasState.filtered = [...ventasState.ventas];
    
    // Resetear paginación al cargar datos
    ventasState.currentPage = 1;

    renderTable();

    // Mostrar drawer vacío o detalle
    if(!ventasState.selectedId){
      ventasState.mode = "details";
      renderDrawer({
        fecha: todayISO(),
        estado_venta: "Pedido programado",
        estado_liquidacion: "NO",
        tipo_recaudo: "EFECTIVO",
        proveedor_envio: "FLASH BOX"
      });
    } else {
      const v = ventasState.ventas.find(x=>x.id===ventasState.selectedId);
      ventasState.mode = "details";
      renderDrawer(v || {});
    }

    applyFilters();
  } catch (e) {
    console.error("Error cargando ventas:", e);
    showToast("Error al cargar datos: " + e.message, "error");
  }
}

function openDetails(id){
  ventasState.selectedId = id;
  ventasState.mode = "details";
  const v = ventasState.ventas.find(x=>x.id===id);
  renderDrawer(v || {});
}

function openEdit(id){
  ventasState.selectedId = id;
  ventasState.mode = "edit";
  const v = ventasState.ventas.find(x=>x.id===id);
  renderDrawer(v || {});
}

function getFormData(){
  // Función para extraer número de string con $
  const parseMoneyInput = (val) => {
    const cleaned = String(val || "").replace(/[^0-9.]/g, "");
    return n(cleaned || "0");
  };

  const producto_id = $("#vProducto")?.value || "";
  const p = ventasState.inventario.find(x=>x.id===producto_id);

  const total_pago_cliente = parseMoneyInput($("#vTotalPago")?.value);
  const precio_envio = parseMoneyInput($("#vPrecioEnvio")?.value);
  const precio_producto = parseMoneyInput($("#vPrecioProducto")?.value);
  const costo_producto = parseMoneyInput($("#vCostoProducto")?.value);
  const ganancia = parseMoneyInput($("#vGanancia")?.value);

  return {
    producto_id,
    producto_key: p?.producto_key || "",
    nombre_producto: p?.nombre || "",
    cliente: ($("#vCliente")?.value || "").trim(),
    direccion: ($("#vDireccion")?.value || "").trim(),
    proveedor_envio: $("#vProvEnvio")?.value || "",
    precio_envio,
    precio_producto,
    tipo_recaudo: $("#vRecaudo")?.value || "",
    estado_liquidacion: $("#vEstadoLiq")?.value || "",
    costo_producto,
    ganancia,
    fecha: $("#vFecha")?.value || "",
    estado_venta: $("#vEstado")?.value || "",
    total_pago_cliente,
    imagen_url: ($("#vImagenUrl")?.value || "").trim(),
    hora_entrega: ($("#vHoraEntrega")?.value || "").trim(),
    telefono: ($("#vTelefono")?.value || "").trim(),
    origen_venta: ($("#vOrigen")?.value || "").trim(),
    nombre_campana: ($("#vCampana")?.value || "").trim(),
    gasto_publicidad: parseMoneyInput($("#vGastoPub")?.value),
    cuadrado: $("#vCuadrado")?.checked || false,
  };
}

function validateVenta(data){
  if(!data.producto_id) return "Selecciona un producto del inventario.";
  if(!data.cliente) return "Cliente es obligatorio.";
  if(!data.fecha) return "Fecha es obligatoria.";
  if(n(data.total_pago_cliente) <= 0) return "Total pago cliente debe ser mayor a 0.";
  if(n(data.precio_envio) < 0) return "Precio envío no puede ser negativo.";
  if(n(data.precio_producto) < 0) return "Precio producto no puede ser negativo (revisa total - envío).";
  return "";
}

async function saveVenta(){
  const data = getFormData();
  // recalculo final por seguridad:
  const precio_producto = n(data.total_pago_cliente) - n(data.precio_envio);
  data.precio_producto = precio_producto;
  data.ganancia = precio_producto - n(data.costo_producto);

  $("#vPrecioProducto").value = "$" + money(data.precio_producto);
  $("#vGanancia").value = "$" + money(data.ganancia);

  const err = validateVenta(data);
  if(err){ showToast(err, "error"); return; }

  // Validar stock >= 1
  const p = ventasState.inventario.find(x=>x.id===data.producto_id);
  if(!p){ showToast("Producto no encontrado en inventario.", "error"); return; }

  // En edición no vamos a tocar inventario para evitar líos (óptimo y seguro).
  // En alta (new) sí descontamos 1.
  if(ventasState.mode === "edit" && ventasState.selectedId){
    await updateDoc(doc(db,"VENTAS", ventasState.selectedId), {
      ...data,
      updated_at: serverTimestamp(),
    });
    await ventasLoadAll();
    openDetails(ventasState.selectedId);
    return;
  }

  // NEW: transacción -> descuenta stock 1 + crea venta
  const invRef = doc(db,"productos", data.producto_id);

  try{
    await runTransaction(db, async (tx)=>{
      const invSnap = await tx.get(invRef);
      if(!invSnap.exists()) throw new Error("Producto no existe en inventario.");

      const invData = invSnap.data();
      const stock = n(invData.stock ?? 0);
      if(stock < 1) throw new Error("Stock insuficiente para vender (mínimo 1 unidad disponible).");

      // descontar 1 del stock
      tx.update(invRef, { stock: stock - 1 });

      // crear venta
      const vRef = doc(collection(db,"VENTAS"));
      tx.set(vRef, {
        ...data,
        created_at: serverTimestamp(),
      });
    });

    await ventasLoadAll();
    ventasState.mode = "details";
    showToast("Venta guardada y stock actualizado (-1).", "success");
  }catch(e){
    showToast(e.message || "No se pudo guardar la venta.", "error");
  }
}

async function deleteVenta(id){
  if(!confirm("¿Eliminar esta venta? (No devuelve stock automáticamente)")) return;
  await deleteDoc(doc(db,"VENTAS", id));
  if(ventasState.selectedId === id) ventasState.selectedId = null;
  await ventasLoadAll();
}

/* ===========================
   CSV IMPORT / EXPORT - VENTAS
   ========================= */

const CSV_HEADERS_VENTAS = [
  "cliente",
  "direccion",
  "telefono",
  "fecha",
  "producto_id",
  "precio_producto",
  "precio_envio",
  "costo_producto",
  "ganancia",
  "tipo_recaudo",
  "estado_venta",
  "estado_liquidacion",
  "origen_venta",
  "nombre_campana",
  "gasto_publicidad",
  "hora_entrega",
  "imagen_url",
  "notas"
];

// Parsear CSV con detección de separador
function parseCSVVentas(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };

  const headerLine = lines[0];
  const separator = headerLine.includes(";") ? ";" : ",";
  const headers = parseCSVLineVentas(headerLine, separator).map(h => h.toLowerCase());
  
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const values = parseCSVLineVentas(line, separator);
    const obj = {};

    headers.forEach((h, idx) => {
      obj[h] = values[idx] || "";
    });

    if (obj.cliente && obj.cliente.trim()) {
      rows.push(obj);
    }
  }

  return { headers, rows };
}

// Helper para parsear línea CSV
function parseCSVLineVentas(line, separator = ",") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

// Descargar plantilla CSV
function descargarPlantillaVentas() {
  const header = CSV_HEADERS_VENTAS.join(";");
  
  const examples = [
    ["Juan Pérez", "Calle Principal 123", "04121234567", "2025-01-02", "IPHONE14P128GB", "1000.00", "50.00", "650.00", "350.00", "EFECTIVO", "Venta finalizada", "SI", "INSTAGRAM", "Campaña iPhone", "20.00", "14:30", "https://example.com/foto.jpg", ""],
    ["María García", "Avenida Central 456", "04149876543", "2025-01-02", "MBA-M2-256", "1500.00", "100.00", "800.00", "700.00", "TRANSFERENCIA", "Venta finalizada", "SI", "FACEBOOK", "Black Friday", "30.00", "09:15", "https://example.com/foto.jpg", ""],
  ];

  let csv = header + "\n";
  examples.forEach(ex => {
    csv += ex.map(v => {
      if (v.includes(";") || v.includes('"')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    }).join(";") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "plantilla_ventas.csv";
  link.click();
}

// Mostrar modal de vista previa
function mostrarVistaPreviaVentas(datosParseados) {
  const { headers, rows } = datosParseados;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  const content = document.createElement("div");
  content.style.cssText = `
    background: var(--bg2);
    border-radius: 12px;
    max-width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  `;

  const head = document.createElement("div");
  head.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid var(--stroke);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  head.innerHTML = `
    <h3 style="margin: 0;">Vista Previa del CSV (${rows.length} ventas)</h3>
    <button id="btnCerrarModalV" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text);">✕</button>
  `;

  const tableWrap = document.createElement("div");
  tableWrap.style.cssText = `
    flex: 1;
    overflow: auto;
    padding: 12px;
  `;

  let tableHtml = `
    <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
      <thead>
        <tr style="position: sticky; top: 0; background: var(--card);">
          <th style="padding: 8px; text-align: left; border-bottom: 1px solid var(--stroke);">#</th>
  `;

  const visibleHeaders = headers.slice(0, 8);
  visibleHeaders.forEach(h => {
    tableHtml += `<th style="padding: 8px; text-align: left; border-bottom: 1px solid var(--stroke);">${h}</th>`;
  });

  tableHtml += `
        </tr>
      </thead>
      <tbody>
  `;

  rows.slice(0, 20).forEach((row, idx) => {
    tableHtml += `<tr style="border-bottom: 1px solid var(--stroke);">
      <td style="padding: 8px; text-align: center; background: var(--card);">${idx + 1}</td>`;

    visibleHeaders.forEach(h => {
      const val = row[h] || "-";
      tableHtml += `<td style="padding: 8px;">${escapeHtml(val.substring(0, 20))}</td>`;
    });

    tableHtml += `</tr>`;
  });

  if (rows.length > 20) {
    tableHtml += `<tr><td colspan="${visibleHeaders.length + 1}" style="padding: 12px; text-align: center; color: var(--muted);">... y ${rows.length - 20} ventas más</td></tr>`;
  }

  tableHtml += `
      </tbody>
    </table>
  `;

  tableWrap.innerHTML = tableHtml;

  const footer = document.createElement("div");
  footer.style.cssText = `
    padding: 12px 16px;
    border-top: 1px solid var(--stroke);
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  `;

  footer.innerHTML = `
    <button id="btnCancelarImportV" class="dc-btn dc-btn-ghost">Cancelar</button>
    <button id="btnConfirmarImportV" class="dc-btn">Cargar ${rows.length} ventas</button>
  `;

  content.appendChild(head);
  content.appendChild(tableWrap);
  content.appendChild(footer);
  modal.appendChild(content);
  document.body.appendChild(modal);

  const btnCerrar = document.getElementById("btnCerrarModalV");
  const btnCancelar = document.getElementById("btnCancelarImportV");
  const btnConfirmar = document.getElementById("btnConfirmarImportV");

  function cerrarModal() {
    modal.remove();
  }

  btnCerrar?.addEventListener("click", cerrarModal);
  btnCancelar?.addEventListener("click", cerrarModal);

  btnConfirmar?.addEventListener("click", async () => {
    cerrarModal();
    await cargarVentasDesdeCSV(rows);
  });
}

// Cargar ventas desde CSV a Firebase
async function cargarVentasDesdeCSV(rows) {
  if (!rows.length) return;

  const progressDiv = document.createElement("div");
  progressDiv.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--bg2);
    border: 1px solid var(--stroke);
    border-radius: 8px;
    padding: 16px;
    z-index: 9999;
    min-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;

  progressDiv.innerHTML = `
    <div style="margin-bottom: 8px;">Cargando ventas...</div>
    <div style="width: 100%; height: 6px; background: var(--stroke); border-radius: 3px; overflow: hidden;">
      <div id="progressBarV" style="height: 100%; background: #4CAF50; width: 0%; transition: width 0.3s;"></div>
    </div>
    <div id="progressTextV" style="margin-top: 8px; font-size: 12px; color: var(--muted);">0 / ${rows.length}</div>
  `;

  document.body.appendChild(progressDiv);

  let cargadas = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const cliente = (row.cliente || "").trim();
      const fecha = (row.fecha || "").trim();
      const producto_id = (row.producto_id || "").trim();

      if (!cliente || !fecha || !producto_id) {
        errors.push(`Fila ${cargadas + 1}: Cliente, Fecha y Producto obligatorios`);
        cargadas++;
        continue;
      }

      const precio_producto = n(row.precio_producto);
      const precio_envio = n(row.precio_envio);
      const costo_producto = n(row.costo_producto || 0);
      const ganancia = n(row.ganancia || 0);

      const payload = {
        cliente,
        direccion: (row.direccion || "").trim(),
        telefono: (row.telefono || "").trim(),
        fecha,
        producto_id,
        producto_key: producto_id,
        nombre_producto: "",
        precio_producto,
        precio_envio,
        costo_producto,
        ganancia,
        tipo_recaudo: (row.tipo_recaudo || "").trim(),
        estado_venta: normalizeEstadoVenta(row.estado_venta || ""),
        estado_liquidacion: (row.estado_liquidacion || "NO").trim(),
        origen_venta: (row.origen_venta || "").trim(),
        nombre_campana: (row.nombre_campana || "").trim(),
        gasto_publicidad: n(row.gasto_publicidad),
        hora_entrega: (row.hora_entrega || "").trim(),
        imagen_url: (row.imagen_url || "").trim(),
        notas: (row.notas || "").trim(),
        total_pago_cliente: precio_producto + precio_envio,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      await addDoc(collection(db, "VENTAS"), payload);
      cargadas++;

    } catch (err) {
      errors.push(`Fila ${cargadas + 1}: ${err?.message || "Error desconocido"}`);
      cargadas++;
    }

    const percent = Math.round((cargadas / rows.length) * 100);
    const bar = progressDiv.querySelector("#progressBarV");
    const text = progressDiv.querySelector("#progressTextV");
    if (bar) bar.style.width = percent + "%";
    if (text) text.textContent = `${cargadas} / ${rows.length}`;
  }

  progressDiv.remove();

  await ventasLoadAll();

  let msg = `✓ Cargadas ${cargadas} ventas`;
  if (errors.length) {
    msg += `\n\n⚠ Errores (${errors.length}):\n${errors.slice(0, 5).join("\n")}`;
    if (errors.length > 5) msg += `\n... y ${errors.length - 5} más`;
  }

  alert(msg);
}

/* ===========================
   IMPRESIÓN TÉRMICA CON VISTA PREVIA
   ========================= */
function generarTicketHTML(venta) {
  const precioProducto = n(venta.precio_producto || 0);
  const precioEnvio = n(venta.precio_envio || 0);
  const total = n(venta.total_pago_cliente || 0);
  const ventaId = venta.id ? venta.id.substring(0, 8).toUpperCase() : "N/A";
  
  // Generar URL para código QR (información de la venta)
  const qrData = JSON.stringify({
    id: venta.id,
    cliente: venta.cliente,
    total: total,
    fecha: venta.fecha
  });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;

  return `
    <div class="ticket-container">
      <!-- Encabezado -->
      <div class="ticket-header">
        <div class="store-name">DIGITAL CORTEX</div>
        <div class="store-subtitle">Tienda de Auriculares</div>
      </div>

      <!-- Línea separadora -->
      <div class="separator"></div>

      <!-- Info de venta -->
      <div class="ticket-section">
        <div class="ticket-row">
          <span class="label">VENTA #:</span>
          <span class="value">${ventaId}</span>
        </div>
        <div class="ticket-row">
          <span class="label">Fecha:</span>
          <span class="value">${venta.fecha ? formatFechaDisplay(venta.fecha) : "N/A"}</span>
        </div>
        ${venta.hora_entrega ? `
        <div class="ticket-row">
          <span class="label">Hora:</span>
          <span class="value">${venta.hora_entrega}</span>
        </div>
        ` : ''}
      </div>

      <!-- Línea separadora -->
      <div class="separator"></div>

      <!-- Datos cliente -->
      <div class="ticket-section">
        <div class="section-title">CLIENTE</div>
        <div class="client-name">${venta.cliente || "Sin especificar"}</div>
        ${venta.telefono ? `<div class="ticket-row small"><span class="label">Tel:</span> <span class="value">${venta.telefono}</span></div>` : ''}
        ${venta.direccion ? `<div class="ticket-row small"><span class="label">Dirección:</span></div><div class="address">${venta.direccion}</div>` : ''}
      </div>

      <!-- Línea separadora -->
      <div class="separator"></div>

      <!-- Producto -->
      <div class="ticket-section">
        <div class="section-title">PRODUCTO</div>
        <div class="product-name">${venta.producto_key || "N/A"}</div>
      </div>

      <!-- Línea separadora -->
      <div class="separator"></div>

      <!-- Detalles financieros -->
      <div class="ticket-section">
        <div class="ticket-row">
          <span class="label">Precio:</span>
          <span class="value amount">$${money(precioProducto)}</span>
        </div>
        ${precioEnvio > 0 ? `
        <div class="ticket-row">
          <span class="label">Envío:</span>
          <span class="value amount">$${money(precioEnvio)}</span>
        </div>
        ` : ''}
        <div class="separator-thin"></div>
        <div class="ticket-row total">
          <span class="label">TOTAL:</span>
          <span class="value">$${money(total)}</span>
        </div>
      </div>

      <!-- Línea separadora -->
      <div class="separator"></div>

      <!-- Método de pago -->
      <div class="ticket-section">
        <div class="ticket-row small">
          <span class="label">Pago:</span>
          <span class="value">${venta.tipo_recaudo || "EFECTIVO"}</span>
        </div>
        ${venta.proveedor_envio ? `
        <div class="ticket-row small">
          <span class="label">Envío:</span>
          <span class="value">${venta.proveedor_envio}</span>
        </div>
        ` : ''}
      </div>

      <!-- Código QR -->
      <div class="qr-section">
        <img src="${qrUrl}" alt="QR" class="qr-code">
      </div>

      <!-- Garantía -->
      <div class="separator"></div>
      <div class="warranty-section">
        <div class="warranty-title">GARANTÍA</div>
        <div class="warranty-text">Cobertura: 30 días por defectos de fábrica. Presenta el comprobante en caso de reclamo. Sujeto a políticas del vendedor.</div>
      </div>

      <!-- Pie -->
      <div class="separator"></div>
      <div class="ticket-footer">
        <div>GRACIAS POR SU COMPRA</div>
        <div style="font-size: 11px; margin-top: 4px;">Vuelva pronto</div>
      </div>
    </div>
  `;
}

async function abrirVistaPrevia(ventaId) {
  try {
    const venta = await getDoc(doc(db, "VENTAS", ventaId));
    if (!venta.exists()) {
      alert("No se encontró la venta");
      return;
    }

    const ventaData = venta.data();
    ventaData.id = ventaId;
    const ticketHTML = generarTicketHTML(ventaData);

    const ventanaPrevia = window.open("", "_blank", "width=450,height=700");
    ventanaPrevia.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Imprimir Ticket - ${ventaData.cliente || "Venta"}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Courier New', 'Courier', monospace;
            background: white;
            padding: 20px;
            font-size: 14px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
          }

          .controls {
            position: sticky;
            top: 0;
            background: #222;
            padding: 10px 20px;
            display: flex;
            gap: 10px;
            z-index: 1000;
            border-radius: 4px;
          }

          .btn {
            padding: 10px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            transition: all 0.3s;
            color: white;
          }

          .btn-print {
            background: #4CAF50;
          }

          .btn-print:hover {
            background: #45a049;
          }

          .btn-close {
            background: #f44336;
          }

          .btn-close:hover {
            background: #da190b;
          }

          .preview-container {
            margin-top: 20px;
            display: flex;
            justify-content: center;
          }

          .ticket-container {
            width: 80mm;
            background: white;
            padding: 10px;
            margin: 8px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.25);
            overflow: hidden;
          }

          .ticket-header {
            text-align: center;
            margin-bottom: 8px;
            padding-top: 4px;
          }

          .store-name {
            font-weight: bold;
            font-size: 14px;
            letter-spacing: 1px;
          }

          .store-subtitle {
            font-size: 11px;
            color: #333;
            margin-top: 2px;
          }

          .separator {
            border-top: 1px dashed #000;
            margin: 6px 0;
          }

          .separator-thin {
            border-top: 1px solid #999;
            margin: 4px 0;
          }

          .ticket-section {
            margin-bottom: 5px;
            font-size: 12px;
          }

          .section-title {
            font-weight: bold;
            font-size: 11px;
            letter-spacing: 0.5px;
            margin-bottom: 3px;
            text-transform: uppercase;
          }

          .ticket-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
            font-size: 12px;
            line-height: 1.4;
          }

          .ticket-row.small {
            font-size: 11px;
          }

          .ticket-row.total {
            font-weight: bold;
            font-size: 13px;
            padding: 4px 0;
          }

          .label {
            font-weight: bold;
            flex: 0 0 auto;
          }

          .value {
            flex: 1;
            text-align: right;
            padding-left: 8px;
          }

          .value.amount {
            font-weight: bold;
          }

          .client-name {
            font-weight: bold;
            font-size: 13px;
            margin-bottom: 3px;
            word-wrap: break-word;
            line-height: 1.3;
          }

          .address {
            font-size: 11px;
            margin-left: 0;
            word-wrap: break-word;
            line-height: 1.3;
          }

          .product-name {
            font-weight: bold;
            font-size: 13px;
            word-wrap: break-word;
            line-height: 1.3;
          }

          .qr-section {
            text-align: center;
            margin: 8px 0;
            padding: 8px 0;
          }

          .qr-code {
            width: 90px;
            height: 90px;
            display: inline-block;
            border: 2px solid #000;
          }

          .warranty-section {
            background: white;
            border: 1px solid #000;
            padding: 8px;
            border-radius: 0;
            margin-bottom: 4px;
            font-size: 11px;
            page-break-inside: avoid;
          }

          .warranty-title {
            font-weight: bold;
            font-size: 11px;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #000;
          }

          .warranty-text {
            font-size: 11px;
            line-height: 1.5;
            color: #000;
            text-align: left;
          }

          .ticket-footer {
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            margin-top: 6px;
            padding-bottom: 4px;
            line-height: 1.4;
          }

          /* Estilos de impresión */
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              color: #000 !important;
            }

            body {
              background: white !important;
              padding: 0;
              margin: 0;
              font-size: 14px;
              color: #000 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .controls {
              display: none;
            }

            .preview-container {
              margin-top: 0;
            }

            .ticket-container {
              box-shadow: none;
              width: 80mm;
              padding: 8px;
              margin: 0;
              background: white !important;
              color: black !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              page-break-inside: avoid;
            }

            .ticket-header,
            .ticket-section,
            .separator,
            .separator-thin,
            .qr-section,
            .warranty-section,
            .ticket-footer {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color: #000 !important;
              background: white !important;
            }

            .store-name,
            .section-title,
            .label,
            .ticket-row,
            .client-name,
            .product-name,
            .warranty-title,
            .warranty-text,
            .address,
            .value {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color: #000 !important;
              font-weight: bold !important;
            }

            @page {
              size: 80mm auto;
              margin: 0;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="controls">
          <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir</button>
          <button class="btn btn-close" onclick="window.close()">❌ Cerrar</button>
        </div>
        <div class="preview-container">
          ${ticketHTML}
        </div>
      </body>
      </html>
    `);
    ventanaPrevia.document.close();

  } catch (error) {
    console.error("Error al abrir vista previa:", error);
    alert("Error al abrir vista previa: " + (error?.message || error));
  }
}

/* ===========================
   MOUNT / INIT
   ========================= */
export async function mountVentas(container){
  if(!container) throw new Error("mountVentas: container no recibido (router).");
document.body.classList.remove("page-ventas","page-compras","page-inventario");
document.body.classList.add("page-ventas");



  // ✅ FIX: reset de estilos/clases que dejan otros módulos
  // Limpia estilos inline del contenedor (muy común que otro módulo lo modifique)
  try { container.removeAttribute("style"); } catch(e){}

  // Si tu router reusa el mismo container y le agrega clases, lo reseteamos.
  // (Si el contenedor no usa clases, esto no afecta)
  try {
    // Conserva solo la clase base si existe; si no, déjalo vacío.
    // Si preferís conservar clases, comentá estas 2 líneas.
    container.className = container.classList.contains("content") ? "content" : container.className;
  } catch(e){}

  // Marca de página para “scoping” de CSS (evita que compras/inventario pisen ventas)
  document.body.classList.remove("page-ventas","page-compras","page-inventario");
  document.body.classList.add("page-ventas");

  // Cleanup: detener observadores anteriores si existen
  if(ventasState._styleObserver){
    try {
      ventasState._styleObserver.disconnect();
      ventasState._styleObserver = null;
    } catch(e){ /* ignore */ }
  }

  // Cleanup total: limpiar contenedor completamente
  container.innerHTML = "";

  // Resetear estado para nueva instancia
  ventasState.ventas = [];
  ventasState.filtered = [];
  ventasState.inventario = [];
  ventasState.selectedId = null;
  ventasState.mode = "details";

  container.innerHTML = ventasTemplate();
  initResizer(container);
  
  // Restaurar estado del drawer
  const isMinimized = localStorage.getItem('dc_ventas_drawer_minimized') === '1';
  const grid = container.querySelector('.inv-grid');
  const btn = container.querySelector('#vBtnToggleDrawer');
  if (isMinimized && grid && btn) {
    grid.classList.add('drawer-minimized');
    btn.textContent = '▶ Detalles';
  }

  // Cargar datos
  bindHeaderEvents();
  await ventasLoadAll();
}



