import { db, storage } from "./firebase.js";
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, query, where, limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const $ = (q) => document.querySelector(q);

const ESTADOS_TRANSITO = [
  "RECIBIDO",
  "EN_TRANSITO",
  "SIN_PREALERTAR",
  "ORDEN_CANCELADA",
  "PENDIENTE_DE_RETIRAR",
  "RECIBIDO_PARCIALMENTE"
];

const ESTADOS_TRANSITO_ACTIVO = new Set([
  "EN_TRANSITO",
  "SIN_PREALERTAR",
  "PENDIENTE_DE_RETIRAR",
  "RECIBIDO_PARCIALMENTE"
]);

const state = {
  rows: [],
  filtered: [],
  selectedId: null,
  mode: "details", // details | edit | new
  filters: {}, // filtros de columnas activos
  productos: [],   // cache productos inventario
  productoSelected: null, // producto seleccionado en drawer (modo new/edit)
};

function n(v){ return Number(v || 0); }
function money(v){ return n(v).toFixed(2); }
function normalize(s){ return (s||"").toString().trim().toUpperCase(); }
function todayISO(){
  const d = new Date();
  const pad = (x)=> String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function calcStockProyectado(stock, transito, reservado){
  return n(stock) + n(transito) - n(reservado);
}
function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* =========================
   TEMPLATE VISTA COMPRAS
   ========================= */
function viewTemplate(){
  return `
  <div class="inv-grid">
    <div class="card" style="padding:14px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input id="cSearch" placeholder="Buscar (rastreo, producto, tienda, usuario)..." style="min-width:280px;" class="dc-input"/>
          <select id="fEstadoTransito" class="dc-input">
            <option value="">ESTADO (TODOS)</option>
            ${ESTADOS_TRANSITO.map(x => `<option>${x}</option>`).join("")}
          </select>
          <input id="fTienda" placeholder="TIENDA (OPCIONAL)" class="dc-input" style="min-width:200px;"/>
          <input id="fUsuario" placeholder="USUARIO (OPCIONAL)" class="dc-input" style="min-width:200px;"/>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="btnNuevo" class="dc-btn">+ Nueva orden</button>
          <button id="btnRefrescar" class="dc-btn dc-btn-ghost">Refrescar</button>
          <button id="btnToggleDrawer" class="dc-btn dc-btn-ghost" title="Minimizar/Expandir panel de detalles">▼ Detalles</button>
        </div>
      </div>

      <div style="margin-top:12px;" class="dc-table-wrap">
        <div id="cellSumIndicator" class="cell-sum-indicator" style="display:none;"></div>
        <table class="dc-table">
          <thead>
            <tr>
              <th>Foto</th>
              <th class="th-filterable" data-col="rastreo">
                N RASTREO
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="estado">
                ESTADO
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="clave">
                CLAVE
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="categoria">
                CATEGORÍA
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th style="text-align:right;">CANT</th>
              <th style="text-align:right;">TOTAL</th>
              <th style="text-align:right;">C/U</th>
              <th class="th-filterable" data-col="proveedor">
                PROVEEDOR ENVIO
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="tienda">
                TIENDA
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="usuario">
                USUARIO
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th>FECHA COMPRA</th>
              <th>FECHA RECIBIDO</th>
              <th style="text-align:right;">ENVIO</th>
              <th style="text-align:right;">RECIBIDO</th>
            </tr>
          </thead>
          <tbody id="cTbody"></tbody>
        </table>
      </div>
    </div>

    <div class="drawer-resizer" id="drawerResizer" title="Ajustar ancho del panel" aria-hidden="true"></div>

    <aside class="inv-drawer" id="drawer">
      <div id="drawerInner"></div>
    </aside>
  </div>
  `;
}

/* =========================
   RESIZER
   ========================= */
function initResizer(container){
  const resizer = container.querySelector('#drawerResizer');
  const drawer = container.querySelector('#drawer');
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

/* =========================
   DATA LOAD
   ========================= */
async function loadProductosInventario(){
  const snap = await getDocs(collection(db, "productos"));
  const rows = [];
  snap.forEach(d => {
    const data = d.data();
    // Si no tiene external_key, construirlo desde nombre|condición en MAYÚSCULAS
    if (!data.external_key) {
      const nombre = normalize(data.nombre || '');
      const condicion = normalize(data.condicion || '');
      if (nombre && condicion) {
        data.external_key = nombre + '|' + condicion;
      } else if (nombre) {
        data.external_key = nombre;
      }
    }
    rows.push({ id: d.id, ...data });
  });
  state.productos = rows;
  console.log('[Compras] Productos cargados:', rows.length, rows);
}



function dateToKey(v){
  // Devuelve un string ordenable: YYYY-MM-DD (o "" si no hay)
  if (!v) return "";

  // Firestore Timestamp
  if (typeof v === "object" && typeof v.toDate === "function") {
    const d = v.toDate();
    return d.toISOString().slice(0, 10);
  }

  // Date
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }

  // String
  if (typeof v === "string") {
    // si ya viene YYYY-MM-DD, perfecto
    // si viene otra cosa, lo dejamos como string (igual ordena)
    return v.trim();
  }

  // Número (epoch)
  if (typeof v === "number") {
    try{
      return new Date(v).toISOString().slice(0, 10);
    }catch(e){
      return "";
    }
  }

  return "";
}

async function loadCompras(){
  const snap = await getDocs(collection(db, "compras"));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

  // ✅ ordenar seguro (desc)
  rows.sort((a,b)=>{
    const aa = dateToKey(a.fecha_compra);
    const bb = dateToKey(b.fecha_compra);
    return (bb || "").localeCompare(aa || "");
  });

  state.rows = rows;
  state.filtered = rows;

  if (!state.selectedId && rows.length) state.selectedId = rows[0].id;
}



/* ===========================
   CELL SELECTION & SUM
   =========================== */
const cellSelection = {
  selected: new Set(),
  lastSelected: null,
  
  init(tbody) {
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
      const key = this.getCellKey(cell);
      if (this.selected.has(key)) {
        this.selected.delete(key);
        cell.classList.remove("cell-selected");
      } else {
        this.selected.add(key);
        cell.classList.add("cell-selected");
      }
    } else if (e.shiftKey && this.lastSelected) {
      this.selectRange(this.lastSelected, cell);
    } else {
      this.clearSelection();
      const key = this.getCellKey(cell);
      this.selected.add(key);
      cell.classList.add("cell-selected");
      this.lastSelected = cell;
      if (rowId) {
        // Solo actualizar selección visual sin regenerar tabla
        document.querySelectorAll(".dc-row").forEach(row => {
          row.classList.remove("selected");
        });
        const selectedRow = document.querySelector(`[data-id="${rowId}"]`);
        if (selectedRow) {
          selectedRow.classList.add("selected");
        }
        
        state.selectedId = rowId;
        state.mode = "details";
        renderDrawer();
      }
    }
    this.updateSum();
  },
  
  getCellKey(cell) {
    return `${cell.dataset.row}|${cell.dataset.col}`;
  },
  
  selectRange(from, to) {
    const tbody = document.querySelector("tbody#cTbody");
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
    const tbody = document.querySelector("tbody#cTbody");
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
  const values = new Set();
  state.rows.forEach(r => {
    let val = "";
    switch(col) {
      case "rastreo": val = r.n_rastreo || ""; break;
      case "estado": val = r.estado_transito || ""; break;
      case "clave": val = r.external_key || ""; break;
      case "categoria": val = r.categoria || ""; break;
      case "proveedor": val = r.proveedor_envio || ""; break;
      case "tienda": val = r.tienda || ""; break;
      case "usuario": val = r.usuario || ""; break;
    }
    if (val) values.add(val);
  });
  return Array.from(values).sort();
}

function applyColumnFilter(col, value) {
  if (!state.filters) state.filters = {};
  
  if (value === "") {
    delete state.filters[col];
  } else {
    state.filters[col] = value;
  }
  
  applyFilters();
}

function bindColumnFilters() {
  setTimeout(() => {
    const filterHeaders = document.querySelectorAll(".th-filterable");
    
    filterHeaders.forEach(th => {
      const col = th.dataset.col;
      const icon = th.querySelector(".filter-icon");
      const dropdown = th.querySelector(".filter-dropdown");
      
      if (!icon || !dropdown) return;
      
      const newIcon = icon.cloneNode(true);
      icon.parentNode.replaceChild(newIcon, icon);
      
      newIcon.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        document.querySelectorAll(".filter-dropdown").forEach(d => {
          if (d !== dropdown) d.style.display = "none";
        });
        
        const isOpen = dropdown.style.display !== "none" && dropdown.style.display !== "";
        
        if (!isOpen) {
          const values = getColumnValues(col);
          const current = state.filters?.[col] || "";
          
          dropdown.innerHTML = `
            <div style="padding:8px;">
              <div class="filter-option ${current === "" ? "active" : ""}" data-value="">
                ✓ Todos
              </div>
              ${values.map(v => `
                <div class="filter-option ${current === v ? "active" : ""}" data-value="${v}">
                  ✓ ${v}
                </div>
              `).join("")}
            </div>
          `;
          
          dropdown.querySelectorAll(".filter-option").forEach(opt => {
            opt.addEventListener("click", (e) => {
              e.stopPropagation();
              const value = opt.dataset.value;
              applyColumnFilter(col, value);
              dropdown.style.display = "none";
            });
          });
          
          dropdown.style.display = "block";
        } else {
          dropdown.style.display = "none";
        }
      });
    });
    
    document.addEventListener("click", (e) => {
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
const editableFields = ["rastreo", "clave", "categoria", "tienda", "usuario"];

function enableInlineEdit(cell) {
  const col = cell.dataset.col;
  const rowId = cell.dataset.row;
  
  if (!editableFields.includes(col)) return;
  
  const currentValue = cell.textContent;
  
  const input = document.createElement("input");
  input.className = "dc-input";
  input.type = "text";
  input.value = currentValue;
  input.style.padding = "4px 6px";
  input.style.fontSize = "13px";
  
  cell.innerHTML = "";
  cell.appendChild(input);
  cell.classList.add("editing");
  input.focus();
  input.select();
  
  const saveEdit = async () => {
    const newValue = input.value.trim();
    
    if (newValue === currentValue) {
      cell.classList.remove("editing");
      cell.textContent = currentValue;
      return;
    }
    
    try {
      cell.innerHTML = `<span style="opacity:0.6;">Guardando...</span>`;
      
      const row = state.rows.find(r => r.id === rowId);
      if (!row) throw new Error("Orden no encontrada");
      
      const updateData = {};
      switch(col) {
        case "rastreo": updateData.n_rastreo = newValue; break;
        case "clave": updateData.external_key = newValue; break;
        case "categoria": updateData.categoria = newValue; break;
        case "tienda": updateData.tienda = newValue; break;
        case "usuario": updateData.usuario = newValue; break;
      }
      
      const docRef = doc(db, "compras", rowId);
      await updateDoc(docRef, updateData);
      
      row[col === "rastreo" ? "n_rastreo" : col === "clave" ? "external_key" : col] = newValue;
      
      cell.classList.remove("editing");
      cell.textContent = newValue;
      
    } catch (error) {
      console.error("Error guardando cambio:", error);
      cell.classList.remove("editing");
      cell.textContent = currentValue;
      alert("Error al guardar: " + error.message);
    }
  };
  
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

function applyFilters(){
  const q = normalize($("#cSearch").value);
  const est = normalize($("#fEstadoTransito").value);
  const tienda = normalize($("#fTienda").value);
  const usuario = normalize($("#fUsuario").value);
  const columnFilters = state.filters || {};

  state.filtered = state.rows.filter(r=>{
    const text = normalize(`${r.n_rastreo||""} ${r.external_key||""} ${r.tienda||""} ${r.usuario||""} ${r.proveedor_envio||""}`);
    if (q && !text.includes(q)) return false;
    if (est && normalize(r.estado_transito) !== est) return false;
    if (tienda && normalize(r.tienda) !== tienda) return false;
    if (usuario && normalize(r.usuario) !== usuario) return false;
    
    for (const [col, val] of Object.entries(columnFilters)) {
      let cellVal = "";
      switch(col) {
        case "rastreo": cellVal = r.n_rastreo || ""; break;
        case "estado": cellVal = r.estado_transito || ""; break;
        case "clave": cellVal = r.external_key || ""; break;
        case "categoria": cellVal = r.categoria || ""; break;
        case "proveedor": cellVal = r.proveedor_envio || ""; break;
        case "tienda": cellVal = r.tienda || ""; break;
        case "usuario": cellVal = r.usuario || ""; break;
      }
      if (cellVal.trim() !== val.trim()) return false;
    }
    
    return true;
  });

  if (state.selectedId && !state.filtered.some(x => x.id === state.selectedId)) {
    state.selectedId = state.filtered[0]?.id || null;
  }

  renderTable();
  renderDrawer();
}


/* =========================
   TABLE RENDER
   ========================= */
function renderTable(){
  const tb = $("#cTbody");
  tb.innerHTML = state.filtered.map(r=>{
    const foto = (r.foto_url && r.foto_url.trim()) ? r.foto_url : "";
    const selectedClass = r.id === state.selectedId ? "selected" : "";
    return `
      <tr class="dc-row ${selectedClass}" data-id="${r.id}" data-row="${r.id}">
        <td class="cell-no-select">${foto ? `<img class="dc-img-sm" src="${foto}"/>` : `<div class="dc-img-sm"></div>`}</td>
        <td class="cell-text" data-row="${r.id}" data-col="rastreo">${escapeHtml(r.n_rastreo || "")}</td>
        <td class="cell-text" data-row="${r.id}" data-col="estado"><span class="dc-pill">${escapeHtml(r.estado_transito || "")}</span></td>
        <td class="cell-text" data-row="${r.id}" data-col="clave">${escapeHtml(r.external_key || "")}</td>
        <td class="cell-text" data-row="${r.id}" data-col="categoria">${escapeHtml(r.categoria || "")}</td>
        <td class="cell-num" data-row="${r.id}" data-col="cantidad" data-value="${r.cantidad}" style="text-align:right;">${n(r.cantidad)}</td>
        <td class="cell-num" data-row="${r.id}" data-col="total_costo" data-value="${r.total_costo}" style="text-align:right;">$${money(r.total_costo)}</td>
        <td class="cell-num" data-row="${r.id}" data-col="costo_unitario" data-value="${r.costo_unitario}" style="text-align:right;">$${money(r.costo_unitario)}</td>
        <td class="cell-text" data-row="${r.id}" data-col="proveedor">${escapeHtml(r.proveedor_envio || "")}</td>
        <td class="cell-text" data-row="${r.id}" data-col="tienda">${escapeHtml(r.tienda || "")}</td>
        <td class="cell-text" data-row="${r.id}" data-col="usuario">${escapeHtml(r.usuario || "")}</td>
        <td class="cell-text" data-row="${r.id}" data-col="fecha_compra">${escapeHtml(r.fecha_compra || "")}</td>
        <td class="cell-text" data-row="${r.id}" data-col="fecha_recibido">${escapeHtml(r.fecha_recibido || "")}</td>
        <td class="cell-num" data-row="${r.id}" data-col="costo_envio" data-value="${r.costo_envio_total}" style="text-align:right;">$${money(r.costo_envio_total)}</td>
        <td class="cell-num" data-row="${r.id}" data-col="cant_recibido" data-value="${r.cant_recibido_total}" style="text-align:right;"><b>${n(r.cant_recibido_total)}</b></td>
      </tr>
    `;
  }).join("");

  // Inicializar selección de celdas
  cellSelection.init(tb);
  
  // Renderizar filtros de columnas
  bindColumnFilters();

  tb.querySelectorAll(".dc-row").forEach(row=>{
    row.addEventListener("click", (ev)=>{
      if (ev.target.closest("button")) return;
      state.selectedId = row.dataset.id;
      state.mode = "details";
      // Solo actualizar drawer, no regenerar tabla
      renderDrawer();
    });
  });

  // Doble-click para edición inline
  tb.querySelectorAll(".cell-text").forEach(cell => {
    cell.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      enableInlineEdit(cell);
    });
  });
}

/* =========================
   DRAWER
   ========================= */
function getSelected(){
  return state.rows.find(x=> x.id === state.selectedId) || null;
}

function drawerHeader(title, subtitle=""){
  return `
    <div class="drawer-head">
      <div>
        <h3 class="drawer-title">${title}</h3>
        ${subtitle ? `<div class="drawer-sub">${subtitle}</div>` : ``}
      </div>
      <div style="display:flex; gap:8px;">
        ${state.mode !== "new" ? `<button id="btnDrawerNew" class="dc-btn dc-btn-ghost" type="button">Nueva</button>` : ``}
        ${state.mode === "details" && state.selectedId ? `<button id="btnDrawerEdit" class="dc-btn" type="button">Editar</button>` : ``}
      </div>
    </div>
  `;
}

function productChips(p){
  if (!p) return `<div class="hint">Selecciona un producto para ver información.</div>`;
  return `
    <div class="chiprow">
      <span class="chip">STOCK: ${n(p.stock)}</span>
      <span class="chip">TRÁNSITO: ${n(p.stock_transito)}</span>
      <span class="chip">COSTO PROM: $${money(p.costo_prom)}</span>
    </div>
  `;
}

function renderDrawer(){
  const el = $("#drawerInner");
  if (!el) return;

  if (state.mode === "new") {
    el.innerHTML = drawerHeader("Nueva orden de compra", "Selecciona un producto existente del inventario") + drawerForm(null);
    wireDrawerForm(null);
    wireDrawerHeader();
    return;
  }

  const r = getSelected();
  if (!r) {
    el.innerHTML = drawerHeader("Compras", "Selecciona una orden") + `<div class="hint">No hay órdenes para mostrar.</div>`;
    wireDrawerHeader();
    return;
  }

  if (state.mode === "edit") {
    el.innerHTML = drawerHeader("Editar orden", r.external_key || "") + drawerForm(r);
    wireDrawerForm(r);
    wireDrawerHeader();
    return;
  }

  // details
  const foto = (r.foto_url && r.foto_url !== "SIN FOTO") ? r.foto_url : "";
  el.innerHTML = `
    ${drawerHeader("Detalle de orden", r.n_rastreo || r.external_key || "")}

    ${foto ? `<img class="preview-img" src="${foto}"/>` : `<div class="preview-img"></div>`}

    <div class="chiprow">
      <span class="chip">${escapeHtml(r.estado_transito || "SIN ESTADO")}</span>
      <span class="chip">CANT: ${n(r.cantidad)}</span>
      <span class="chip">RECIBIDO: ${n(r.cant_recibido_total)}</span>
    </div>

    ${kv("N RASTREO", r.n_rastreo)}
    ${kv("CLAVE", r.external_key)}
    ${kv("CATEGORÍA", r.categoria)}
    ${kv("TOTAL COSTO", "$" + money(r.total_costo))}
    ${kv("COSTO UNITARIO", "$" + money(r.costo_unitario))}
    ${kv("PROVEEDOR ENVIO", r.proveedor_envio)}
    ${kv("TIENDA", r.tienda)}
    ${kv("USUARIO", r.usuario)}
    ${kv("FECHA COMPRA", r.fecha_compra)}
    ${kv("FECHA RECIBIDO", r.fecha_recibido)}
    ${kv("COSTO ENVIO (ACUM.)", "$" + money(r.costo_envio_total))}
    ${kv("CANT RECIBIDO (ACUM.)", n(r.cant_recibido_total))}

    <div class="divider"></div>

    <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
      <button id="btnRecepcion" class="dc-btn dc-btn-warn" type="button">RECEPCIÓN DE ORDEN</button>
      <button id="btnDrawerEdit2" class="dc-btn" type="button">Editar</button>
      <button id="btnDrawerDelete" class="dc-btn dc-danger" type="button">Eliminar</button>
    </div>
  `;

  wireDrawerHeader();
  $("#btnDrawerEdit2")?.addEventListener("click", ()=> openEdit(r.id));
  $("#btnDrawerDelete")?.addEventListener("click", ()=> onDelete(r.id));

  // Recepción: abre edit pero en modo recepcion
  $("#btnRecepcion")?.addEventListener("click", ()=>{
    openEdit(r.id);
    // marcar modo recepcion en el form (se aplica en wireDrawerForm)
    window.__dc_recepcion_mode = true;
    renderDrawer();
  });
}

function kv(k,v){
  const val = (v === null || v === undefined || v === "" ? "—" : v);
  return `<div class="kv"><b>${k}</b><span>${escapeHtml(val)}</span></div>`;
}

/* =========================
   FORM
   ========================= */
function drawerForm(r){
  const extKey = escapeHtml(r?.external_key || "");
  const nRastreo = escapeHtml(r?.n_rastreo || "");
  return `
    <form id="drawerForm" class="form-grid">
      <div>
        <label class="dc-label">PRODUCTO (CLAVE)</label>
        <div class="dc-suggest-wrap">
          <input id="cProductoKey" class="dc-input" placeholder="NOMBRE | CONDICIÓN" value="${extKey}">
          <div class="producto-suggestions"></div>
        </div>
        <div id="prodChips">${productChips(r ? findProductoByKey(r.external_key) : null)}</div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">NÚMERO DE RASTREO
          <input id="cRastreo" class="dc-input" value="${nRastreo}">
        </label>
        <label class="dc-label">ESTADO EN TRÁNSITO
          <select id="cEstado" class="dc-input">
            ${ESTADOS_TRANSITO.map(x => `<option>${x}</option>`).join("")}
          </select>
        </label>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">CANTIDAD
          <input id="cCantidad" class="dc-input" type="number" min="1" step="1" value="${r ? n(r.cantidad) : 1}">
        </label>
        <label class="dc-label">TOTAL COSTO
          <input id="cTotalCosto" class="dc-input" type="number" min="0" step="0.01" value="${r ? n(r.total_costo) : 0}">
        </label>
      </div>

      <label class="dc-label">COSTO UNITARIO (CALCULADO)
        <input id="cCostoUnitario" class="dc-input" type="text" value="${r ? money(n(r.costo_unitario)) : '0.00'}" disabled>
      </label>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">PROVEEDOR ENVIO <input id="cProveedorEnvio" class="dc-input" placeholder="EJ: DHL / CARGO EXPRESO"></label>
        <label class="dc-label">TIENDA <input id="cTienda" class="dc-input" placeholder="EJ: AMAZON / EBAY"></label>
      </div>

      <label class="dc-label">USUARIO <input id="cUsuario" class="dc-input" placeholder="QUIÉN COMPRÓ"></label>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">FECHA DE COMPRA
          <input id="cFechaCompra" class="dc-input" type="date">
        </label>
        <label class="dc-label">FECHA RECIBIDO
          <input id="cFechaRecibido" class="dc-input" type="date">
        </label>
      </div>

      <div class="divider"></div>

      <div class="dc-badge" style="margin-bottom:8px;">
        RECEPCIÓN: estos campos solo se habilitan con “RECEPCIÓN DE ORDEN” (o si el estado ya está RECIBIDO / PENDIENTE_DE_RETIRAR / RECIBIDO_PARCIALMENTE).
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">COSTO ENVÍO (ADICIONAL) <input id="cCostoEnvioAdd" class="dc-input" type="number" min="0" step="0.01" value="0"></label>
        <label class="dc-label">CANT RECIBIDO (EN ESTA RECEPCIÓN) <input id="cCantRecibidoAdd" class="dc-input" type="number" min="0" step="1" value="0"></label>
      </div>

      <label class="dc-label">FOTO <input id="cFoto" class="dc-input" type="file" accept="image/*"></label>

      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:6px;">
        <button class="dc-btn dc-btn-ghost" id="btnCancelDrawer" type="button">Cancelar</button>
        <button class="dc-btn" type="submit">Guardar</button>
      </div>

      <div class="hint" style="margin-top:6px;">
        NOTA: La orden es de 1 producto. CLAVE = NOMBRE|CONDICIÓN. TODO SE GUARDA EN MAYÚSCULAS.
      </div>
    </form>
  `;
}

function wireDrawerHeader(){
  $("#btnDrawerNew")?.addEventListener("click", ()=> openNew());
  $("#btnDrawerEdit")?.addEventListener("click", ()=>{
    if (!state.selectedId) return;
    state.mode = "edit";
    window.__dc_recepcion_mode = false;
    renderDrawer();
  });
}

function findProductoByKey(external_key){
  const k = normalize(external_key);
  return state.productos.find(p => normalize(p.external_key) === k) || null;
}

function setProductoSelected(p){
  state.productoSelected = p || null;
  const chips = $("#prodChips");
  if (chips) chips.innerHTML = productChips(p);

  // Solo actualizar si los elementos existen
  const cNProducto = $("#cNProducto");
  const cCategoria = $("#cCategoria");
  const cCondicion = $("#cCondicion");
  
  if (cNProducto) cNProducto.value = p?.nombre || "";
  if (cCategoria) cCategoria.value = p?.categoria || "";
  if (cCondicion) cCondicion.value = p?.condicion || "";
}

function computeCostoUnitario(){
  const cant = n($("#cCantidad").value);
  const total = n($("#cTotalCosto").value);
  const cu = (cant > 0) ? (total / cant) : 0;
  $("#cCostoUnitario").value = money(cu);
  return cu;
}

function enableRecepcionFields(enable){
  const costoEnvio = $("#cCostoEnvioAdd");
  const cantRec = $("#cCantRecibidoAdd");
  if (!costoEnvio || !cantRec) return;

  costoEnvio.disabled = !enable;
  cantRec.disabled = !enable;

  if (!enable){
    costoEnvio.value = "0";
    cantRec.value = "0";
  }
}

function restrictEstadoForRecepcion(enable){
  const sel = $("#cEstado");
  if (!sel) return;

  if (!enable){
    // restaurar lista completa
    sel.innerHTML = ESTADOS_TRANSITO.map(x=> `<option>${x}</option>`).join("");
    return;
  }
  // solo permitir RECIBIDO o PENDIENTE_DE_RETIRAR
  sel.innerHTML = `<option>RECIBIDO</option><option>PENDIENTE_DE_RETIRAR</option>`;
}

function setupAutocompleteProducto(inputId){
  console.log('[Setup Autocomplete] Iniciando para inputId:', inputId);
  
  const input = document.getElementById(inputId);
  if (!input) {
    console.warn('[Setup Autocomplete] NO ENCONTRÓ EL ELEMENTO:', inputId);
    setTimeout(() => setupAutocompleteProducto(inputId), 100);
    return;
  }
  
  console.log('[Setup Autocomplete] Elemento encontrado. Productos cargados:', state.productos.length);

  // Crear contenedor de sugerencias si no existe
  let wrap = input.closest('.dc-suggest-wrap');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.className = 'dc-suggest-wrap';
    input.parentElement.insertBefore(wrap, input);
    wrap.appendChild(input);
  }

  let sugg = wrap.querySelector('.producto-suggestions');
  if (!sugg){
    sugg = document.createElement('div');
    sugg.className = 'producto-suggestions';
    wrap.appendChild(sugg);
  }

  const showSuggestions = (query) => {
    const filtered = state.productos.filter(p => {
      return normalize(p.external_key || '').includes(query) || query === "";
    });
    
    console.log('[Autocomplete] Búsqueda:', query, '-> Resultados:', filtered.length);
    
    if (filtered.length === 0) {
      sugg.innerHTML = `<div class="producto-suggestion-item" style="padding:12px;color:#999;font-style:italic;">No hay productos</div>`;
      sugg.classList.add("visible");
    } else {
      sugg.innerHTML = filtered
        .map(p => `
          <div class="producto-suggestion-item" data-key="${escapeHtml(p.external_key || '')}" style="padding:10px 12px;border-bottom:1px solid rgba(0,0,0,0.05);">
            <div style="font-weight:700;color:#2196f3;">${escapeHtml(p.external_key || '')}</div>
            <div style="font-size:11px;color:#666;margin-top:2px;">${escapeHtml(p.categoria || '')} · Stock ${n(p.stock || 0)} · Tránsito ${n(p.stock_transito || 0)}</div>
          </div>
        `)
        .join("");
      
      sugg.classList.add("visible");
      
      // Bind click events a cada sugerencia
      sugg.querySelectorAll(".producto-suggestion-item").forEach(item => {
        item.addEventListener("click", (e) => {
          const key = item.dataset.key;
          console.log('[Autocomplete] Seleccionado:', key);
          input.value = key;
          const p = findProductoByKey(key);
          setProductoSelected(p);
          sugg.classList.remove("visible");
        });
      });
    }
    
    // Posicionar el dropdown (position: fixed)
    const rect = input.getBoundingClientRect();
    sugg.style.top = (rect.bottom + 4) + 'px';
    sugg.style.left = rect.left + 'px';
    sugg.style.width = Math.max(rect.width, 250) + 'px';
  };

  input.addEventListener("input", (e) => {
    const query = normalize(e.target.value || '');
    if (query === "") {
      sugg.classList.remove("visible");
    } else {
      showSuggestions(query);
    }
  });

  input.addEventListener("focus", (e) => {
    const query = normalize(e.target.value || '');
    // Mostrar todas si está vacío, o filtradas si hay texto
    showSuggestions(query);
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      sugg.classList.remove("visible");
    }, 200);
  });

  console.log('[Setup Autocomplete] COMPLETADO');
}

function wireDrawerForm(r){
  console.log('[wireDrawerForm] Iniciando...');
  const recepMode = !!window.__dc_recepcion_mode;

  // Esperar a que los elementos estén disponibles
  const waitForElement = (id) => {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        const el = document.getElementById(id);
        if (el) {
          console.log('[wireDrawerForm] Elemento encontrado:', id);
          resolve(el);
        } else if (attempts < 10) {
          attempts++;
          setTimeout(check, 50);
        } else {
          console.error('[wireDrawerForm] TIMEOUT esperando elemento:', id);
          resolve(null);
        }
      };
      check();
    });
  };

  // Ejecutar en async para esperar elementos
  (async () => {
    // defaults
    const cFechaCompra = document.getElementById('cFechaCompra');
    const cFechaRecibido = document.getElementById('cFechaRecibido');
    const cProductoKey = document.getElementById('cProductoKey');
    const cRastreo = document.getElementById('cRastreo');
    const cEstado = document.getElementById('cEstado');
    const cCantidad = document.getElementById('cCantidad');
    const cTotalCosto = document.getElementById('cTotalCosto');
    const cCostoUnitario = document.getElementById('cCostoUnitario');
    const cProveedorEnvio = document.getElementById('cProveedorEnvio');
    const cTienda = document.getElementById('cTienda');
    const cUsuario = document.getElementById('cUsuario');
    const cCostoEnvioAdd = document.getElementById('cCostoEnvioAdd');
    const cCantRecibidoAdd = document.getElementById('cCantRecibidoAdd');

    if (cFechaCompra) cFechaCompra.value = todayISO();
    if (cFechaRecibido) cFechaRecibido.value = "";

    // si edita, llenar valores
    if (r){
      if (cProductoKey) cProductoKey.value = r.external_key || "";
      if (cRastreo) cRastreo.value = r.n_rastreo || "";
      if (cEstado) cEstado.value = r.estado_transito || "EN_TRANSITO";
      if (cCantidad) cCantidad.value = n(r.cantidad) || 1;
      if (cTotalCosto) cTotalCosto.value = n(r.total_costo) || 0;
      if (cCostoUnitario) cCostoUnitario.value = money(n(r.costo_unitario));
      if (cProveedorEnvio) cProveedorEnvio.value = r.proveedor_envio || "";
      if (cTienda) cTienda.value = r.tienda || "";
      if (cUsuario) cUsuario.value = r.usuario || "";
      if (cFechaCompra) cFechaCompra.value = r.fecha_compra || "";
      if (cFechaRecibido) cFechaRecibido.value = r.fecha_recibido || "";
    } else {
      if (cEstado) cEstado.value = "EN_TRANSITO";
      if (cCantidad) cCantidad.value = 1;
      if (cTotalCosto) cTotalCosto.value = 0;
      if (cCostoUnitario) cCostoUnitario.value = "0.00";
      if (cCostoEnvioAdd) cCostoEnvioAdd.value = "0";
      if (cCantRecibidoAdd) cCantRecibidoAdd.value = "0";
    }

    // producto seleccionado
    if (r){
      const p = findProductoByKey(r.external_key);
      setProductoSelected(p);
    } else {
      setProductoSelected(null);
    }

    // Autocomplete para Producto (igual a ventas.js)
    if (!r && cProductoKey) {
      const productoSuggestions = cProductoKey.closest('.dc-suggest-wrap')?.querySelector('.producto-suggestions');
      
      if (productoSuggestions) {
        console.log('[wireDrawerForm] Configurando autocomplete de productos. Total productos:', state.productos.length);

      const showSuggestions = (query) => {
        const filtered = state.productos.filter(p => {
          return normalize(p.external_key || '').includes(query) || query === "";
        });
        
        console.log('[Autocomplete] Búsqueda:', query, '-> Resultados:', filtered.length);
        
        if (filtered.length === 0) {
          productoSuggestions.innerHTML = `<div class="producto-suggestion-item">No hay coincidencias</div>`;
          productoSuggestions.classList.add("visible");
        } else {
          productoSuggestions.innerHTML = filtered
            .map(p => `<div class="producto-suggestion-item" data-key="${escapeHtml(p.external_key || '')}">${escapeHtml(p.external_key || '')} (Stock: ${n(p.stock || 0)})</div>`)
            .join("");
          productoSuggestions.classList.add("visible");
          
          // Bind click events a cada sugerencia
          productoSuggestions.querySelectorAll(".producto-suggestion-item").forEach(item => {
            item.addEventListener("click", () => {
              const key = item.dataset.key;
              console.log('[Autocomplete] Seleccionado:', key);
              cProductoKey.value = key;
              const p = findProductoByKey(key);
              setProductoSelected(p);
              productoSuggestions.classList.remove("visible");
            });
          });
        }

        // Posicionar el dropdown (position: fixed)
        const rect = cProductoKey.getBoundingClientRect();
        productoSuggestions.style.top = (rect.bottom + 4) + 'px';
        productoSuggestions.style.left = rect.left + 'px';
        productoSuggestions.style.width = Math.max(rect.width, 250) + 'px';
      };

      cProductoKey.addEventListener("input", (e) => {
        const query = normalize(e.target.value || '');
        if (query === "") {
          productoSuggestions.classList.remove("visible");
        } else {
          showSuggestions(query);
        }
      });

      cProductoKey.addEventListener("focus", (e) => {
        const query = normalize(e.target.value || '');
        if (query !== "") {
          showSuggestions(query);
        }
      });

      cProductoKey.addEventListener("blur", () => {
        setTimeout(() => {
          productoSuggestions.classList.remove("visible");
          // Validar que si hay texto, exista un producto seleccionado
          if (cProductoKey.value && !state.productoSelected) {
            cProductoKey.value = "";
          }
        }, 200);
      });
      }
    }

    // calcular costo unitario cuando cambia cantidad o total
    const recalc = ()=> computeCostoUnitario();
    if (cCantidad) cCantidad.addEventListener("input", recalc);
    if (cTotalCosto) cTotalCosto.addEventListener("input", recalc);

    // resto del wiring...
    const estadoInicial = normalize((cEstado?.value) || "");
    const isEstadoRecep = (estadoInicial === "RECIBIDO" || estadoInicial === "PENDIENTE_DE_RETIRAR" || estadoInicial === "RECIBIDO_PARCIALMENTE");
    const enableRecep = recepMode || isEstadoRecep;

    enableRecepcionFields(enableRecep);
    restrictEstadoForRecepcion(enableRecep);

    if (enableRecep){
      const cur = normalize((cEstado?.value) || "");
      if (cur !== "RECIBIDO" && cur !== "PENDIENTE_DE_RETIRAR"){
        if (cEstado) cEstado.value = "RECIBIDO";
      }
    }

    // cancelar
    const btnCancelDrawer = document.getElementById('btnCancelDrawer');
    if (btnCancelDrawer) {
      btnCancelDrawer.addEventListener("click", ()=>{
        window.__dc_recepcion_mode = false;
        state.mode = state.selectedId ? "details" : "new";
        renderDrawer();
      });
    }

    // submit
    const drawerForm = document.getElementById('drawerForm');
    if (drawerForm) {
      drawerForm.addEventListener("submit", async (ev) => {
        try {
          await onSave(ev, r);
        } catch(err) {
          console.error('[onSave] ERROR:', err);
          alert('ERROR AL GUARDAR: ' + (err?.message || err));
        }
      });
    }

    console.log('[wireDrawerForm] COMPLETADO');
  })();
}

/* =========================
   STORAGE HELPERS
   ========================= */
async function uploadFoto(file, compraId){
  if (!file) return { url: null, path: null };
  if (!file.type.startsWith("image/")) throw new Error("EL ARCHIVO NO ES UNA IMAGEN");

  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `compras/${compraId}/${Date.now()}_${safeName}`;
  const rref = ref(storage, path);

  await uploadBytes(rref, file, { contentType: file.type });
  const url = await getDownloadURL(rref);
  return { url, path };
}

async function deleteFotoIfAny(foto_path){
  if (!foto_path) return;
  try{
    await deleteObject(ref(storage, foto_path));
  } catch(err){
    console.warn("No se pudo borrar foto:", err?.message || err);
  }
}

/* =========================
   INVENTARIO UPDATES
   ========================= */
async function getProductoDocByKey(external_key){
  // buscamos por external_key (único)
  const qy = query(collection(db, "productos"), where("external_key", "==", normalize(external_key)), limit(1));
  const snap = await getDocs(qy);
  let found = null;
  snap.forEach(d=>{
    if (!found) found = { id: d.id, ...d.data() };
  });
  return found;
}

async function updateInventarioTransitOnCreateOrChange(producto, deltaTransit){
  if (!producto || !producto.id) return;
  const newTransit = Math.max(0, n(producto.stock_transito) + n(deltaTransit));
  const stock = n(producto.stock);
  const reservado = n(producto.stock_reservado);
  const proyectado = calcStockProyectado(stock, newTransit, reservado);

  await updateDoc(doc(db, "productos", producto.id), {
    stock_transito: newTransit,
    stock_proyectado: proyectado,
    updated_at: serverTimestamp()
  });
}

function weightedAverageCost(currentStock, currentCostoProm, receivedQty, receivedUnitCost){
  const cs = n(currentStock);
  const cp = n(currentCostoProm);
  const rq = n(receivedQty);
  const ru = n(receivedUnitCost);

  if (rq <= 0) return cp;
  if (cs <= 0) return ru;

  const totalValue = cs * cp + rq * ru;
  const totalQty = cs + rq;
  return totalQty > 0 ? (totalValue / totalQty) : cp;
}

async function applyRecepcionToInventario(external_key, receivedQtyDelta, shippingDelta){
  // Regla:
  // - Costo base unitario mercadería = total_costo / cantidad (lo calculamos fuera)
  // - Para recepciones parciales, el "envío adicional" se distribuye SOLO sobre lo recibido en esa recepción:
  //   unit_effective_delta = base_unit + (shippingDelta / receivedQtyDelta)
  // Luego: costo_prom nuevo ponderado y stock += delta, transit -= delta

  const prod = await getProductoDocByKey(external_key);
  if (!prod) throw new Error("NO SE ENCONTRÓ EL PRODUCTO EN INVENTARIO PARA ESA CLAVE.");

  const delta = n(receivedQtyDelta);
  if (delta <= 0) return;

  const newStock = n(prod.stock) + delta;
  const newTransit = Math.max(0, n(prod.stock_transito) - delta);

  const reservado = n(prod.stock_reservado);
  const proyectado = calcStockProyectado(newStock, newTransit, reservado);

  // unit_effective_delta lo calcula onSave y lo manda
  // aquí solo aplicamos cambios, pero necesitaremos ese unit cost
  // lo pasaremos como argumento extra en una versión interna:
}

async function applyRecepcionToInventarioWithUnit(external_key, receivedQtyDelta, unitEffectiveDelta){
  const prod = await getProductoDocByKey(external_key);
  if (!prod) throw new Error("NO SE ENCONTRÓ EL PRODUCTO EN INVENTARIO PARA ESA CLAVE.");

  const delta = n(receivedQtyDelta);
  if (delta <= 0) return;

  const newStock = n(prod.stock) + delta;
  const newTransit = Math.max(0, n(prod.stock_transito) - delta);

  const newCostoProm = weightedAverageCost(
    n(prod.stock),
    n(prod.costo_prom),
    delta,
    n(unitEffectiveDelta)
  );

  const reservado = n(prod.stock_reservado);
  const proyectado = calcStockProyectado(newStock, newTransit, reservado);

  await updateDoc(doc(db, "productos", prod.id), {
    stock: newStock,
    stock_transito: newTransit,
    stock_proyectado: proyectado,
    costo_prom: n(newCostoProm),
    updated_at: serverTimestamp()
  });
}

/* =========================
   CRUD COMPRAS
   ========================= */
async function existsRastreo(n_rastreo, excludeId=null){
  const key = normalize(n_rastreo);
  if (!key) return false;

  const qy = query(collection(db, "compras"), where("n_rastreo", "==", key), limit(3));
  const snap = await getDocs(qy);
  let found = false;
  snap.forEach(d=>{
    if (excludeId && d.id === excludeId) return;
    found = true;
  });
  return found;
}

function isRecepcionEstado(estado){
  const e = normalize(estado);
  return (e === "RECIBIDO" || e === "PENDIENTE_DE_RETIRAR" || e === "RECIBIDO_PARCIALMENTE");
}

async function onSave(ev, currentRow){
  ev.preventDefault();

  const isEdit = !!currentRow;
  const isRecepMode = !!window.__dc_recepcion_mode;

  const external_key = normalize($("#cProductoKey").value);
  const n_rastreo = normalize($("#cRastreo").value);
  let estado_transito = normalize($("#cEstado").value);

  const cantidad = Math.max(1, n($("#cCantidad").value));
  const total_costo = Math.max(0, n($("#cTotalCosto").value));

  const costo_unitario_base = (cantidad > 0) ? (total_costo / cantidad) : 0;
  $("#cCostoUnitario").value = money(costo_unitario_base);

  const proveedor_envio = normalize($("#cProveedorEnvio").value);
  const tienda = normalize($("#cTienda").value);
  const usuario = normalize($("#cUsuario").value);

  const fecha_compra = ($("#cFechaCompra").value || "").trim();
  const fecha_recibido = ($("#cFechaRecibido").value || "").trim();

  const costo_envio_add = Math.max(0, n($("#cCostoEnvioAdd").value));
  const cant_recibido_add = Math.max(0, n($("#cCantRecibidoAdd").value));

  const file = $("#cFoto").files?.[0] || null;

  if (!external_key) return alert("DEBES SELECCIONAR UN PRODUCTO EXISTENTE (CLAVE).");

  // validar producto existe
  const producto = findProductoByKey(external_key);
  if (!producto) return alert("NO SE ENCONTRÓ ESA CLAVE EN INVENTARIO. PRIMERO DEBES CREAR EL PRODUCTO EN INVENTARIO.");

  // campos autocompletados (se guardan también en compras)
  const n_producto = normalize(producto.nombre || "");
  const categoria = normalize(producto.categoria || "");
  const condicion = normalize(producto.condicion || "");

  // validación rastreo (opcional, pero si lo pone, evitar duplicado)
  if (n_rastreo) {
    const dup = await existsRastreo(n_rastreo, isEdit ? currentRow.id : null);
    if (dup) return alert("YA EXISTE UNA ORDEN CON ESE NÚMERO DE RASTREO.");
  }

  // --- Recepción logic ---
  // Si está en modo recepción, solo permitir estados RECIBIDO o PENDIENTE_DE_RETIRAR
  if (isRecepMode){
    if (estado_transito !== "RECIBIDO" && estado_transito !== "PENDIENTE_DE_RETIRAR"){
      return alert("EN RECEPCIÓN SOLO PUEDES CAMBIAR ESTADO A RECIBIDO O PENDIENTE_DE_RETIRAR.");
    }
  }

  // =========================
  // NUEVO
  // =========================
  if (!isEdit){
    // crear doc compra
    const payload = {
      n_rastreo,
      estado_transito: estado_transito || "EN_TRANSITO",

      external_key,      // CLAVE = NOMBRE|CONDICION
      n_producto,
      categoria,
      condicion,

      cantidad,
      total_costo,
      costo_unitario: n(costo_unitario_base),

      proveedor_envio,
      tienda,
      usuario,

      fecha_compra,
      fecha_recibido: "",

      // acumulados de recepción
      costo_envio_total: 0,
      cant_recibido_total: 0,

      foto_url: "SIN FOTO",
      foto_path: "",

      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    };

    const refDoc = await addDoc(collection(db, "compras"), payload);

    // si se sube foto
    if (file){
      try{
        const up = await uploadFoto(file, refDoc.id);
        if (up?.url){
          await updateDoc(doc(db, "compras", refDoc.id), {
            foto_url: up.url,
            foto_path: up.path || "",
            updated_at: serverTimestamp()
          });
        }
      } catch(err){
        console.error(err);
        alert("NO SE PUDO SUBIR LA FOTO: " + (err?.message || err));
      }
    }

    // conectar con inventario: si el estado es "activo en tránsito", sumarlo a stock_transito
    if (ESTADOS_TRANSITO_ACTIVO.has(payload.estado_transito)){
      await updateInventarioTransitOnCreateOrChange(producto, +cantidad);
    }

    state.selectedId = refDoc.id;
    state.mode = "details";
    window.__dc_recepcion_mode = false;
    await refresh();
    return;
  }

  // =========================
  // EDITAR
  // =========================
  const id = currentRow.id;
  const before = currentRow;

  // acumulados previos
  const prevRec = n(before.cant_recibido_total);
  const prevEnv = n(before.costo_envio_total);

  let newRecTotal = prevRec;
  let newEnvTotal = prevEnv;

  // Delta de recepción (si corresponde)
  let receivedDelta = 0;
  let unitEffectiveDelta = 0;

  // Si está en modo recepción O si ya está en estado de recepción, permitimos sumar parciales
  const allowRecepInput = isRecepMode || isRecepcionEstado(before.estado_transito) || isRecepcionEstado(estado_transito);

  if (allowRecepInput){
    if (cant_recibido_add > 0){
      const remaining = Math.max(0, n(before.cantidad) - prevRec);
      if (cant_recibido_add > remaining){
        return alert(`CANT RECIBIDO EXCEDE LO PENDIENTE. PENDIENTE: ${remaining}`);
      }

      receivedDelta = cant_recibido_add;
      newRecTotal = prevRec + receivedDelta;

      // Envío adicional se acumula
      newEnvTotal = prevEnv + costo_envio_add;

      // unit cost efectivo para ESTE DELTA:
      // base_unit = total_costo / cantidad
      // delta_unit = base_unit + (envio_add / receivedDelta)
      unitEffectiveDelta = n(costo_unitario_base) + (receivedDelta > 0 ? (n(costo_envio_add) / receivedDelta) : 0);
    } else {
      // si no recibió nada, no debería meter envío
      if (costo_envio_add > 0){
        return alert("SI AGREGA COSTO ENVÍO, DEBE INGRESAR TAMBIÉN CANT RECIBIDO EN ESTA RECEPCIÓN.");
      }
    }
  }

  // estado automático por recepción parcial
  const remainingAfter = Math.max(0, n(before.cantidad) - newRecTotal);

  let finalEstado = estado_transito || before.estado_transito;

  if (newRecTotal > 0 && remainingAfter > 0){
    // parcialmente recibido
    finalEstado = "RECIBIDO_PARCIALMENTE";
  }

  if (newRecTotal > 0 && remainingAfter === 0){
    // completó recepción
    if (estado_transito === "PENDIENTE_DE_RETIRAR"){
      finalEstado = "PENDIENTE_DE_RETIRAR";
    } else {
      finalEstado = "RECIBIDO";
    }
  }

  // actualizar compra (sin cambiar producto)
  const updatePayload = {
    n_rastreo,
    estado_transito: finalEstado,

    external_key,
    n_producto,
    categoria,
    condicion,

    cantidad,
    total_costo,
    costo_unitario: n(costo_unitario_base),

    proveedor_envio,
    tienda,
    usuario,

    fecha_compra,
    // si completó recepción o recibió algo, setear fecha recibido si no viene
    fecha_recibido: (newRecTotal > 0 ? (fecha_recibido || before.fecha_recibido || todayISO()) : (fecha_recibido || before.fecha_recibido || "")),

    costo_envio_total: n(newEnvTotal),
    cant_recibido_total: n(newRecTotal),

    updated_at: serverTimestamp()
  };

  // foto
  const currentFotoPath = before.foto_path || "";
  let foto_url = before.foto_url || "SIN FOTO";
  let foto_path = currentFotoPath;

  if (file){
    try{
      if (foto_path) await deleteFotoIfAny(foto_path);
      const up = await uploadFoto(file, id);
      if (up?.url){
        foto_url = up.url;
        foto_path = up.path || "";
      }
    } catch(err){
      console.error(err);
      alert("NO SE PUDO SUBIR LA FOTO: " + (err?.message || err));
    }
  }

  updatePayload.foto_url = foto_url;
  updatePayload.foto_path = foto_path;

  // ===== Conectar inventario: tránsito y recepción =====
  // 1) Ajuste tránsito por cambio de cantidad / estado
  // Calculamos el "tránsito esperado" antes y después:
  // - Si el estado está activo en tránsito: tránsito esperado = (cantidad - recibido_total)
  // - Si no está activo: tránsito esperado = 0
  const beforeActive = ESTADOS_TRANSITO_ACTIVO.has(normalize(before.estado_transito));
  const afterActive  = ESTADOS_TRANSITO_ACTIVO.has(normalize(finalEstado));

  const beforeTransitExpected = beforeActive ? Math.max(0, n(before.cantidad) - n(before.cant_recibido_total)) : 0;
  const afterTransitExpected  = afterActive  ? Math.max(0, n(cantidad) - n(newRecTotal)) : 0;

  const deltaTransit = afterTransitExpected - beforeTransitExpected;

  // 2) Aplicar delta de tránsito al producto
  if (deltaTransit !== 0){
    await updateInventarioTransitOnCreateOrChange(producto, deltaTransit);
  }

  // 3) Si hubo recepción (receivedDelta), aplicar stock + costo_prom + restar tránsito ya se cubre por deltaTransit,
  // pero por seguridad también restamos el delta recibido en stock_transito por el algoritmo de inventario:
  if (receivedDelta > 0){
    await applyRecepcionToInventarioWithUnit(external_key, receivedDelta, unitEffectiveDelta);
  }

  // Guardar compra
  await updateDoc(doc(db, "compras", id), updatePayload);

  state.mode = "details";
  window.__dc_recepcion_mode = false;
  await refresh();
}

async function onDelete(id){
  const r = state.rows.find(x=> x.id === id);
  if (!confirm(`¿ELIMINAR ORDEN "${r?.n_rastreo || r?.external_key || "ORDEN"}"?`)) return;

  // revertir tránsito pendiente si aplica
  // tránsito pendiente = si su estado era activo -> (cantidad - recibido)
  const activo = ESTADOS_TRANSITO_ACTIVO.has(normalize(r?.estado_transito));
  const pending = activo ? Math.max(0, n(r?.cantidad) - n(r?.cant_recibido_total)) : 0;

  if (pending > 0 && r?.external_key){
    const p = findProductoByKey(r.external_key);
    if (p) await updateInventarioTransitOnCreateOrChange(p, -pending);
  }

  // borrar foto
  if (r?.foto_path) await deleteFotoIfAny(r.foto_path);

  await deleteDoc(doc(db, "compras", id));

  if (state.selectedId === id){
    state.selectedId = state.filtered.find(x=> x.id !== id)?.id || null;
    state.mode = "details";
  }

  await refresh();
}

/* =========================
   MODE SWITCHERS
   ========================= */
function openNew(){
  state.mode = "new";
  window.__dc_recepcion_mode = false;
  renderDrawer();
}

function openEdit(id){
  state.selectedId = id;
  state.mode = "edit";
  renderTable();
  renderDrawer();
}

/* =========================
   REFRESH / MOUNT
   ========================= */
async function refresh(){
  await loadProductosInventario();
  await loadCompras();
  applyFilters();
}

export async function mountComprasGeneral(container){
  // Limpiar el contenedor completamente
  container.innerHTML = "";
  
  container.innerHTML = viewTemplate();

  $("#btnNuevo").addEventListener("click", openNew);
  $("#btnRefrescar").addEventListener("click", refresh);
  
  // Toggle drawer (minimizar/expandir panel de detalles)
  $("#btnToggleDrawer")?.addEventListener("click", ()=>{
    const gridContainer = container.querySelector('.inv-grid');
    const btn = document.getElementById('btnToggleDrawer');
    if (gridContainer && btn) {
      const isMinimized = gridContainer.classList.toggle('drawer-minimized');
      btn.textContent = isMinimized ? '▶ Detalles' : '▼ Detalles';
      localStorage.setItem('dc_compras_drawer_minimized', isMinimized ? '1' : '0');
    }
  });

  $("#cSearch").addEventListener("input", applyFilters);
  $("#fEstadoTransito").addEventListener("change", applyFilters);
  $("#fTienda").addEventListener("input", applyFilters);
  $("#fUsuario").addEventListener("input", applyFilters);

  await refresh();
  
  // Restaurar estado del drawer
  const isMinimized = localStorage.getItem('dc_compras_drawer_minimized') === '1';
  const grid = container.querySelector('.inv-grid');
  const btn = container.querySelector('#btnToggleDrawer');
  if (isMinimized && grid && btn) {
    grid.classList.add('drawer-minimized');
    btn.textContent = '▶ Detalles';
  }
  
  renderTable();
  renderDrawer();

  initResizer(container);
}

export async function mountComprasRecepcion(container){
  await mountComprasGeneral(container);
}

export async function mountComprasSeguimiento(container){
  await mountComprasGeneral(container);
}
