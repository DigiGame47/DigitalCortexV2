import { db, storage } from "./firebase.js";
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, query, where, limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const $ = (q) => document.querySelector(q);

const state = {
  rows: [],
  filtered: [],
  selectedId: null,     // fila seleccionada
  mode: "details",      // "details" | "edit" | "new"
  filters: {},          // filtros de columnas activos
};

function n(v){ return Number(v || 0); }
function money(v){ return n(v).toFixed(2); }
function normalize(s){
  return (s || "").toString().trim().toUpperCase();
}

/* =========================
   TEMPLATE VISTA
   ========================= */
function viewTemplate(){
  return `
  <div class="inv-grid">
    <div class="card" style="padding:14px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input id="invSearch" placeholder="Buscar (nombre, sku, marca, modelo)…" style="min-width:280px;" class="dc-input"/>
          <select id="fCategoria" class="dc-input">
            <option value="">CATEGORÍA (TODAS)</option>
          </select>
          <select id="fCondicion" class="dc-input">
            <option value="">CONDICIÓN (TODAS)</option>
            <option>NUEVO</option>
            <option>CAJA_ABIERTA</option>
            <option>USADO</option>
            <option>SIN_CAJA</option>
          </select>
          <select id="fEstado" class="dc-input">
            <option value="">ESTADO (TODOS)</option>
            <option>ACTIVO</option>
            <option>INACTIVO</option>
          </select>
        </div>

        <div style="display:flex;gap:10px;align-items:center;">
          <button id="btnNuevo" class="dc-btn">+ Nuevo</button>
          <button id="btnDescargarCsv" class="dc-btn dc-btn-ghost" title="Descargar plantilla CSV">⬇ Plantilla</button>
          <button id="btnCargarCsv" class="dc-btn dc-btn-ghost" title="Cargar CSV">⬆ Cargar CSV</button>
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
              <th class="th-filterable" data-col="sku">
                SKU
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="nombre">
                Producto
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="clave">
                CLAVE
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="categoria">
                Categoría
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="condicion">
                Condición
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th class="th-filterable" data-col="estado">
                Estado
                <span class="filter-icon" title="Filtrar">⊙</span>
                <div class="filter-dropdown" style="display:none;"></div>
              </th>
              <th style="text-align:right;">Stock</th>
              <th style="text-align:right;">Tránsito</th>
              <th style="text-align:right;">Reservado</th>
              <th style="text-align:right;">Proyectado</th>
              <th style="text-align:right;">Costo Prom</th>
              <th style="text-align:right;">Precio</th>
            </tr>
          </thead>
          <tbody id="invTbody"></tbody>
        </table>
      </div>
    </div>

    <div class="drawer-resizer" id="drawerResizer" title="Ajustar ancho del panel" aria-hidden="true"></div>

    <!-- RIGHT PANEL -->
    <aside class="inv-drawer" id="drawer">
      <div id="drawerInner"></div>
    </aside>
  </div>
  `;
}

/* =========================
   DATA
   ========================= */
async function loadProductos(){
  // Cargar TODOS los productos
  const snap = await getDocs(collection(db, "productos"));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

  // Cargar TODAS las ventas para calcular reservas
  const ventasSnap = await getDocs(collection(db, "VENTAS"));
  const ventasPorProducto = {};
  
  ventasSnap.forEach(doc => {
    const venta = doc.data();
    // Contar solo ventas pendientes (PEDIDO PROGRAMADO)
    if (venta.estado_venta === "PEDIDO PROGRAMADO") {
      const prodId = venta.producto_id;
      if (!ventasPorProducto[prodId]) {
        ventasPorProducto[prodId] = 0;
      }
      ventasPorProducto[prodId]++;
    }
  });

  // Actualizar cada producto con las ventas pendientes
  rows.forEach(row => {
    const ventasPendientes = ventasPorProducto[row.id] || 0;
    // Stock reservado = reservado manual + ventas pendientes
    row.stock_reservado = n(row.stock_reservado || 0) + ventasPendientes;
    // Stock proyectado = stock - transito - reservado
    row.stock_proyectado = n(row.stock || 0) - n(row.stock_transito || 0) - n(row.stock_reservado || 0);
  });

  state.rows = rows;
  state.filtered = rows;

  if (!state.selectedId && rows.length) state.selectedId = rows[0].id;
}

function distinct(arr, key){
  const s = new Set(arr.map(x => normalize(x[key]||"")).filter(Boolean));
  return Array.from(s).sort();
}

function renderFilters(){
  const cats = distinct(state.rows, "categoria");
  $("#fCategoria").innerHTML =
    `<option value="">CATEGORÍA (TODAS)</option>` +
    cats.map(c => `<option>${c}</option>`).join("");
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
    const tbody = document.querySelector("tbody#invTbody");
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
    const tbody = document.querySelector("tbody#invTbody");
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
      case "sku": val = r.sku || ""; break;
      case "nombre": val = r.nombre || ""; break;
      case "clave": val = r.external_key || ""; break;
      case "categoria": val = r.categoria || ""; break;
      case "condicion": val = r.condicion || ""; break;
      case "estado": val = r.estado || ""; break;
    }
    if (val) values.add(val);
  });
  return Array.from(values).sort();
}

function applyColumnFilter(col, value) {
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
const editableFields = ["sku", "nombre", "categoria", "condicion", "estado"];

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
      if (!row) throw new Error("Producto no encontrado");
      
      const updateData = {};
      updateData[col] = newValue;
      
      const docRef = doc(db, "productos", rowId);
      await updateDoc(docRef, updateData);
      
      row[col] = newValue;
      
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
  const q = normalize($("#invSearch").value);
  const cat = normalize($("#fCategoria").value);
  const cond = normalize($("#fCondicion").value);
  const est = normalize($("#fEstado").value);
  const columnFilters = state.filters || {};

  state.filtered = state.rows.filter(r => {
    const text = normalize(`${r.nombre||""} ${r.sku||""} ${r.marca||""} ${r.modelo||""}`);
    if (q && !text.includes(q)) return false;
    if (cat && normalize(r.categoria) !== cat) return false;
    if (cond && normalize(r.condicion) !== cond) return false;
    if (est && normalize(r.estado) !== est) return false;
    
    // Filtros de columnas
    for (const [col, val] of Object.entries(columnFilters)) {
      let cellVal = "";
      switch(col) {
        case "sku": cellVal = r.sku || ""; break;
        case "nombre": cellVal = r.nombre || ""; break;
        case "clave": cellVal = r.external_key || ""; break;
        case "categoria": cellVal = r.categoria || ""; break;
        case "condicion": cellVal = r.condicion || ""; break;
        case "estado": cellVal = r.estado || ""; break;
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
   TABLE
   ========================= */
function renderTable(){
  const tb = $("#invTbody");
  tb.innerHTML = state.filtered.map(r => {
    const foto = r.foto_url && r.foto_url.trim() ? r.foto_url : "";
    const selectedClass = r.id === state.selectedId ? "selected" : "";
    return `
      <tr class="dc-row ${selectedClass}" data-id="${r.id}" data-row="${r.id}">
        <td class="cell-no-select">${foto ? `<img class="dc-img-sm" src="${foto}" />` : `<div class="dc-img-sm"></div>`}</td>
        <td class="cell-text" data-row="${r.id}" data-col="sku">${r.sku || ""}</td>
        <td class="cell-text" data-row="${r.id}" data-col="nombre"><span class="dc-pill">${r.nombre || ""}</span></td>
        <td class="cell-text" data-row="${r.id}" data-col="clave">${escapeHtml(r.external_key || (r.nombre || "") + '|' + (r.condicion || ''))}</td>
        <td class="cell-text" data-row="${r.id}" data-col="categoria">${r.categoria || ""}</td>
        <td class="cell-text" data-row="${r.id}" data-col="condicion">${r.condicion || ""}</td>
        <td class="cell-text" data-row="${r.id}" data-col="estado">${r.estado || ""}</td>
        <td class="cell-num" data-row="${r.id}" data-col="stock" data-value="${r.stock}" style="text-align:right;">${n(r.stock)}</td>
        <td class="cell-num" data-row="${r.id}" data-col="transito" data-value="${r.stock_transito}" style="text-align:right;">${n(r.stock_transito)}</td>
        <td class="cell-num" data-row="${r.id}" data-col="reservado" data-value="${r.stock_reservado}" style="text-align:right;">${n(r.stock_reservado)}</td>
        <td class="cell-num" data-row="${r.id}" data-col="proyectado" data-value="${r.stock_proyectado}" style="text-align:right;"><b>${n(r.stock_proyectado)}</b></td>
        <td class="cell-num" data-row="${r.id}" data-col="costo_prom" data-value="${r.costo_prom}" style="text-align:right;">$${money(r.costo_prom)}</td>
        <td class="cell-num" data-row="${r.id}" data-col="precio" data-value="${r.precio}" style="text-align:right;">$${money(r.precio)}</td>
      </tr>
    `;
  }).join("");

  // Inicializar selección de celdas
  cellSelection.init(tb);
  
  // Renderizar filtros de columnas
  bindColumnFilters();

  tb.querySelectorAll(".dc-row").forEach(row => {
    row.addEventListener("click", (ev) => {
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
   DRAWER (RIGHT PANEL)
   ========================= */
function getSelected(){
  return state.rows.find(x => x.id === state.selectedId) || null;
}

function drawerHeader(title, subtitle = ""){
  return `
    <div class="drawer-head">
      <div>
        <h3 class="drawer-title">${title}</h3>
        ${subtitle ? `<div class="drawer-sub">${subtitle}</div>` : ``}
      </div>
      <div style="display:flex; gap:8px;">
        ${state.mode !== "new" ? `<button id="btnDrawerNew" class="dc-btn dc-btn-ghost" type="button">Nuevo</button>` : ``}
        ${state.mode === "details" && state.selectedId ? `<button id="btnDrawerEdit" class="dc-btn" type="button">Editar</button>` : ``}
      </div>
    </div>
  `;
}

function renderDrawer(){
  const el = $("#drawerInner");
  if (!el) return;

  if (state.mode === "new") {
    el.innerHTML = drawerHeader("Nuevo producto", "Crear un producto en inventario") + drawerForm(null);
    wireDrawerForm(null);
    wireDrawerHeader();
    return;
  }

  const r = getSelected();
  if (!r) {
    el.innerHTML = drawerHeader("Inventario", "Selecciona un producto") + `<div class="hint">No hay productos para mostrar.</div>`;
    wireDrawerHeader();
    return;
  }

  if (state.mode === "edit") {
    el.innerHTML = drawerHeader("Editar producto", r.nombre || "") + drawerForm(r);
    wireDrawerForm(r);
    wireDrawerHeader();
    return;
  }

  const foto = (r.foto_url && r.foto_url !== "SIN FOTO") ? r.foto_url : "";
  el.innerHTML = `
    ${drawerHeader("Detalle del producto", r.sku || r.categoria || "")}

    ${foto ? `<img class="preview-img has-image" src="${foto}" />` : `<div class="preview-img">📦</div>`}

    <div class="chiprow" style="margin-bottom:10px;">
      <span class="chip">${r.estado || "SIN ESTADO"}</span>
      <span class="chip">${r.condicion || "SIN CONDICIÓN"}</span>
      <span class="chip">PROYECTADO: ${n(r.stock_proyectado)}</span>
    </div>

    ${kv("Nombre", r.nombre)}
    ${kv("Categoría", r.categoria)}
    ${kv("SKU", r.sku)}
    ${kv("Marca", r.marca)}
    ${kv("Modelo", r.modelo)}
    ${kv("Stock", n(r.stock))}
    ${kv("Tránsito", n(r.stock_transito))}
    ${kv("Reservado", n(r.stock_reservado))}
    ${kv("Proyectado", n(r.stock_proyectado))}
    ${kv("Costo prom", "$" + money(r.costo_prom))}
    ${kv("Precio", "$" + money(r.precio))}
    ${kv("Garantía", (n(r.garantia_meses)||0) + " meses")}
    ${kv("Ubicación", r.ubicacion)}
    ${kv("Notas", r.notas)}

    <div class="divider"></div>

    <div style="display:flex; gap:10px; justify-content:flex-end;">
      <button id="btnDrawerEdit2" class="dc-btn" type="button">Editar</button>
      <button id="btnDrawerDelete" class="dc-btn dc-danger" type="button">Eliminar</button>
    </div>
  `;

  wireDrawerHeader();

  $("#btnDrawerEdit2")?.addEventListener("click", () => openEdit(r.id));
  $("#btnDrawerDelete")?.addEventListener("click", () => onDelete(r.id));
}

function kv(k, v){
  return `<div class="kv"><b>${k||""}</b><span>${v||""}</span></div>`;
}

function drawerForm(r){
  return `
    <form id="drawerForm" class="form-grid">
      <label class="dc-label">Nombre
        <div class="dc-suggest-wrap">
          <input id="pNombre" class="dc-input" placeholder="NOMBRE DEL PRODUCTO" value="${escapeHtml(r?.nombre || "")}">
          <div class="suggestions"></div>
        </div>
      </label>

      <label class="dc-label">Categoría
        <div class="dc-suggest-wrap">
          <input id="pCategoria" class="dc-input" placeholder="CATEGORÍA" value="${escapeHtml(r?.categoria || "")}">
          <div class="suggestions"></div>
        </div>
      </label>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">SKU
          <input id="pSku" class="dc-input" placeholder="SKU" value="${escapeHtml(r?.sku || "")}">
        </label>
        <label class="dc-label">Condición
          <select id="pCondicion" class="dc-input">
            <option>NUEVO</option>
            <option>CAJA_ABIERTA</option>
            <option>USADO</option>
            <option>SIN_CAJA</option>
          </select>
        </label>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">Marca
          <div class="dc-suggest-wrap">
            <input id="pMarca" class="dc-input" placeholder="MARCA" value="${escapeHtml(r?.marca || "")}">
            <div class="suggestions"></div>
          </div>
        </label>
        <label class="dc-label">Modelo
          <div class="dc-suggest-wrap">
            <input id="pModelo" class="dc-input" placeholder="MODELO" value="${escapeHtml(r?.modelo || "")}">
            <div class="suggestions"></div>
          </div>
        </label>
      </div>

      <label class="dc-label">Estado
        <select id="pEstado" class="dc-input">
          <option>ACTIVO</option>
          <option>INACTIVO</option>
        </select>
      </label>

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
        <label class="dc-label">Stock
          <input id="pStock" class="dc-input" type="number" min="0" step="1" value="${r ? n(r.stock) : 0}">
        </label>
        <label class="dc-label">Tránsito
          <input id="pTransito" class="dc-input" type="number" min="0" step="1" value="${r ? n(r.stock_transito) : 0}">
        </label>
        <label class="dc-label">Reservado
          <input id="pReservado" class="dc-input" type="number" min="0" step="1" value="${r ? n(r.stock_reservado) : 0}">
        </label>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
        <label class="dc-label">Costo Prom
          <input id="pCosto" class="dc-input" type="number" min="0" step="0.01" value="${r ? n(r.costo_prom) : 0}">
        </label>
        <label class="dc-label">Precio
          <input id="pPrecio" class="dc-input" type="number" min="0" step="0.01" value="${r ? n(r.precio) : 0}">
        </label>
        <label class="dc-label">Garantía (meses)
          <input id="pGarantia" class="dc-input" type="number" min="0" step="1" value="${r ? n(r.garantia_meses) : 0}">
        </label>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">Ubicación
          <input id="pUbicacion" class="dc-input" placeholder="BODEGA / ESTANTE / ..." value="${escapeHtml(r?.ubicacion || "")}">
        </label>
        <label class="dc-label">Notas
          <input id="pNotas" class="dc-input" placeholder="Ej: FALTAN ALMOHADILLAS" value="${escapeHtml(r?.notas || "")}">
        </label>
      </div>

      <label class="dc-label">Foto
        <input id="pFoto" class="dc-input" type="file" accept="image/*">
      </label>

      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:6px;">
        <button class="dc-btn dc-btn-ghost" id="btnCancelDrawer" type="button">Cancelar</button>
        <button class="dc-btn" type="submit">Guardar</button>
      </div>
    </form>
  `;
}

function wireDrawerHeader(){
  $("#btnDrawerNew")?.addEventListener("click", () => openNew());
  $("#btnDrawerEdit")?.addEventListener("click", () => {
    if (!state.selectedId) return;
    state.mode = "edit";
    renderDrawer();
  });
}

function wireDrawerForm(r){
  if (r) {
    $("#pNombre").value = r.nombre || "";
    $("#pCategoria").value = r.categoria || "";
    $("#pSku").value = r.sku || "";
    $("#pMarca").value = r.marca || "";
    $("#pModelo").value = r.modelo || "";
    $("#pCondicion").value = r.condicion || "NUEVO";
    $("#pEstado").value = r.estado || "ACTIVO";
    $("#pStock").value = n(r.stock);
    $("#pTransito").value = n(r.stock_transito);
    $("#pReservado").value = n(r.stock_reservado);
    $("#pCosto").value = n(r.costo_prom);
    $("#pPrecio").value = n(r.precio);
    $("#pGarantia").value = n(r.garantia_meses);
    $("#pUbicacion").value = r.ubicacion || "";
    $("#pNotas").value = r.notas || "";
  }

  $("#btnCancelDrawer")?.addEventListener("click", () => {
    state.mode = state.selectedId ? "details" : "new";
    renderDrawer();
  });

  $("#drawerForm")?.addEventListener("submit", (ev) => onSave(ev, r));

  setupAutocompleteFor("pNombre", "nombre");
  setupAutocompleteFor("pCategoria", "categoria");
  setupAutocompleteFor("pMarca", "marca");
  setupAutocompleteFor("pModelo", "modelo");
}

/* =========================
   AUTOCOMPLETE HELPERS
   ========================= */
function distinctOriginal(arr, key){
  const map = new Map();
  for (const x of arr){
    const raw = (x[key] || "").toString();
    const k = normalize(raw);
    if (k && !map.has(k)) map.set(k, raw);
  }
  return Array.from(map.values()).sort((a,b)=> a.localeCompare(b));
}

function setupAutocompleteFor(inputId, key){
  const input = document.getElementById(inputId);
  if (!input) return;

  let wrap = input.closest('.dc-suggest-wrap');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.className = 'dc-suggest-wrap';
    input.parentElement.insertBefore(wrap, input);
    wrap.appendChild(input);
  }

  let sugg = wrap.querySelector('.suggestions');
  if (!sugg){
    sugg = document.createElement('div');
    sugg.className = 'suggestions';
    sugg.style.display = 'none';
    wrap.appendChild(sugg);
  }

  let activeIdx = -1;
  let items = [];

  function hide(){ sugg.style.display = 'none'; activeIdx = -1; items = []; }
  function showList(list){
    items = list.slice(0, 12);
    if (!items.length){ hide(); return; }
    sugg.innerHTML = items.map((v, i) => `<div class="suggestion-item" data-idx="${i}" data-val="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('');
    sugg.querySelectorAll('.suggestion-item').forEach(it => it.addEventListener('mousedown', (ev)=>{
      ev.preventDefault();
      const val = it.dataset.val;
      input.value = val;
      input.dispatchEvent(new Event('input'));
      hide();
    }));
    sugg.style.display = 'block';
    activeIdx = -1;
  }

  function onInput(){
    const q = normalize(input.value || '');
    if (!q) { hide(); return; }
    const all = distinctOriginal(state.rows, key);
    const filtered = all.filter(v => normalize(v).includes(q));
    showList(filtered);
  }

  function onKey(ev){
    if (sugg.style.display === 'none') return;
    const nodes = sugg.querySelectorAll('.suggestion-item');
    if (!nodes.length) return;
    if (ev.key === 'ArrowDown'){
      ev.preventDefault(); activeIdx = Math.min(activeIdx + 1, nodes.length - 1); updateActive();
    } else if (ev.key === 'ArrowUp'){
      ev.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); updateActive();
    } else if (ev.key === 'Enter'){
      if (activeIdx >= 0 && nodes[activeIdx]){
        ev.preventDefault(); nodes[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
      }
    } else if (ev.key === 'Escape'){
      hide();
    }
  }

  function updateActive(){
    const nodes = sugg.querySelectorAll('.suggestion-item');
    nodes.forEach((n, i)=> n.classList.toggle('active', i === activeIdx));
    if (activeIdx >= 0 && nodes[activeIdx]) nodes[activeIdx].scrollIntoView({ block:'nearest' });
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKey);
  input.addEventListener('blur', ()=> setTimeout(hide, 180));
}

function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* =========================
   RESIZER
   ========================= */
function initResizer(container){
  const resizer = container.querySelector('#drawerResizer');
  const drawer = container.querySelector('#drawer');
  if (!resizer || !drawer) return;

  // Evitar listeners duplicados si esta vista se monta varias veces
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
   DUPLICADOS
   ========================= */
async function existsExternalKey(external_key, excludeId = null){
  // ✅ Previene duplicados por external_key (en MAYÚSCULAS)
  const qy = query(
    collection(db, "productos"),
    where("external_key", "==", external_key),
    limit(3)
  );

  const snap = await getDocs(qy);
  let found = false;

  snap.forEach(d => {
    if (excludeId && d.id === excludeId) return;
    found = true;
  });

  return found;
}

/* =========================
   CRUD
   ========================= */
async function uploadFoto(file, productoId){
  if (!file) return { url: null, path: null };

  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen");

  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `productos/${productoId}/${Date.now()}_${safeName}`;
  const rref = ref(storage, path);

  await uploadBytes(rref, file, { contentType: file.type });
  const url = await getDownloadURL(rref);

  return { url, path };
}

async function deleteFotoIfAny(foto_path){
  if (!foto_path) return;
  try {
    const rref = ref(storage, foto_path);
    await deleteObject(rref);
  } catch (err) {
    // si ya no existe, no reventar
    console.warn("No se pudo borrar foto:", err?.message || err);
  }
}

async function onSave(ev, currentRow){
  ev.preventDefault();

  // ✅ TODO EN MAYÚSCULAS
  const nombre = normalize($("#pNombre").value);
  const categoria = normalize($("#pCategoria").value);
  const sku = normalize($("#pSku").value);
  const marca = normalize($("#pMarca").value);
  const modelo = normalize($("#pModelo").value);
  const condicion = normalize($("#pCondicion").value);
  const estado = normalize($("#pEstado").value);

  const stock = n($("#pStock").value);
  const stock_transito = n($("#pTransito").value);
  const stock_reservado = n($("#pReservado").value);
  const stock_proyectado = calcStockProyectado(stock, stock_transito, stock_reservado);

  const costo_prom = n($("#pCosto").value);
  const precio = n($("#pPrecio").value);

  const garantia_meses = n($("#pGarantia").value);
  const ubicacion = normalize($("#pUbicacion").value);
  const notas = normalize($("#pNotas").value);

  const file = $("#pFoto").files?.[0] || null;

  if (!nombre || !categoria) return alert("NOMBRE Y CATEGORÍA SON OBLIGATORIOS.");

  // ✅ external_key normalizado y consistente
  const external_key = `${nombre}|${condicion}`;

  const payload = {
    nombre,
    categoria,
    sku,
    marca,
    modelo,
    condicion,
    estado,
    stock,
    stock_transito,
    stock_reservado,
    stock_proyectado,
    costo_prom,
    precio,
    garantia_meses,
    ubicacion,
    notas,
    external_key,
    updated_at: serverTimestamp(),
  };

  // NUEVO
  if (state.mode === "new") {
    const dup = await existsExternalKey(external_key);
    if (dup) {
      return alert(`YA EXISTE UN PRODUCTO CON LA MISMA CLAVE:\n${external_key}\n\nCAMBIA EL NOMBRE O LA CONDICIÓN.`);
    }

    payload.created_at = serverTimestamp();
    payload.foto_url = "";
    payload.foto_path = ""; // ✅ nuevo campo

    const refDoc = await addDoc(collection(db, "productos"), payload);

    if (file) {
      try {
        const up = await uploadFoto(file, refDoc.id);
        if (up?.url) {
          await updateDoc(doc(db, "productos", refDoc.id), {
            foto_url: up.url,
            foto_path: up.path || "",
            updated_at: serverTimestamp()
          });
        }
      } catch (err) {
        console.error(err);
        alert("NO SE PUDO SUBIR LA FOTO: " + (err?.message || err));
      }
    }

    state.selectedId = refDoc.id;
    state.mode = "details";
    await refresh();
    return;
  }

  // EDITAR
  const id = currentRow?.id || state.selectedId;
  if (!id) return;

  const dup = await existsExternalKey(external_key, id);
  if (dup) {
    return alert(`YA EXISTE OTRO PRODUCTO CON LA MISMA CLAVE:\n${external_key}\n\nCAMBIA EL NOMBRE O LA CONDICIÓN.`);
  }

  const current = state.rows.find(x => x.id === id);
  const update = {
    ...payload,
    foto_url: current?.foto_url || "",
    foto_path: current?.foto_path || "",
  };

  if (file) {
    try {
      // borrar foto anterior si existía
      if (update.foto_path) await deleteFotoIfAny(update.foto_path);

      const up = await uploadFoto(file, id);
      if (up?.url) {
        update.foto_url = up.url;
        update.foto_path = up.path || "";
      }
    } catch (err) {
      console.error(err);
      alert("NO SE PUDO SUBIR LA FOTO: " + (err?.message || err));
    }
  }

  await updateDoc(doc(db, "productos", id), update);

  state.mode = "details";
  await refresh();
}

async function onDelete(id){
  const r = state.rows.find(x => x.id === id);
  if (!confirm(`¿ELIMINAR "${r?.nombre || "PRODUCTO"}"?`)) return;

  // ✅ borrar foto storage si existe
  if (r?.foto_path) {
    await deleteFotoIfAny(r.foto_path);
  }

  await deleteDoc(doc(db, "productos", id));

  if (state.selectedId === id) {
    state.selectedId = state.filtered.find(x => x.id !== id)?.id || null;
    state.mode = "details";
  }

  await refresh();
}

/* =========================
   MODE SWITCHERS
   ========================= */
function openNew(){
  state.mode = "new";
  renderDrawer();
}

function openEdit(id){
  state.selectedId = id;
  state.mode = "edit";
  renderTable();
  renderDrawer();
}

/* =========================
   REFRESH
   ========================= */
async function refresh(){
  await loadProductos();
  renderFilters();
  applyFilters();
}

/* =========================
   CSV IMPORT / EXPORT
   ========================= */

// Campos esperados en el CSV (para descargar plantilla)
const CSV_HEADERS = [
  "nombre",
  "categoria",
  "sku",
  "marca",
  "modelo",
  "condicion",
  "estado",
  "stock",
  "stock_transito",
  "stock_reservado",
  "costo_prom",
  "precio",
  "garantia_meses",
  "ubicacion",
  "notas"
];

// Parsear CSV simple con soporte para comillas y diferentes separadores
function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };

  // Detectar separador (coma o punto y coma)
  const headerLine = lines[0];
  const separator = headerLine.includes(";") ? ";" : ",";
  
  // Parse header
  const headers = parseCSVLine(headerLine, separator).map(h => h.toLowerCase());
  
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const values = parseCSVLine(line, separator);
    const obj = {};

    headers.forEach((h, idx) => {
      obj[h] = values[idx] || "";
    });

    // Solo agregar si tiene al menos nombre
    if (obj.nombre && obj.nombre.trim()) {
      rows.push(obj);
    }
  }

  return { headers, rows };
}

// Helper para parsear línea CSV respetando comillas y separador
function parseCSVLine(line, separator = ",") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip next quote
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
function descargarPlantilla() {
  const header = CSV_HEADERS.join(",");
  
  // Algunos ejemplos
  const examples = [
    ["iPhone 14 Pro", "CELULARES", "IPHONE14P128GB", "APPLE", "iPhone 14 Pro", "NUEVO", "ACTIVO", "5", "2", "1", "800.00", "1200.00", "12", "ESTANTE A1", "Sin accesorios"],
    ["MacBook Air M2", "LAPTOPS", "MBA-M2-256", "APPLE", "MacBook Air", "NUEVO", "ACTIVO", "3", "1", "0", "1200.00", "1800.00", "12", "ESTANTE B2", "Incluye cargador"],
    ["AirPods Pro", "ACCESORIOS", "AIRPODS-PRO", "APPLE", "AirPods Pro", "NUEVO", "ACTIVO", "10", "0", "2", "200.00", "350.00", "12", "ESTANTE C1", ""],
  ];

  let csv = header + "\n";
  examples.forEach(ex => {
    csv += ex.map(v => {
      // Escapar comillas si el valor las contiene
      if (v.includes(",") || v.includes('"')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    }).join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "plantilla_inventario.csv";
  link.click();
}

// Mostrar modal de vista previa
function mostrarVistaPrevia(datosParseados) {
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

  // Header
  const head = document.createElement("div");
  head.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid var(--stroke);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  head.innerHTML = `
    <h3 style="margin: 0;">Vista Previa del CSV (${rows.length} productos)</h3>
    <button id="btnCerrarModal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text);">✕</button>
  `;

  // Tabla preview
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

  const visibleHeaders = headers.slice(0, 8); // Mostrar solo los primeros 8 campos
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
    tableHtml += `<tr><td colspan="${visibleHeaders.length + 1}" style="padding: 12px; text-align: center; color: var(--muted);">... y ${rows.length - 20} productos más</td></tr>`;
  }

  tableHtml += `
      </tbody>
    </table>
  `;

  tableWrap.innerHTML = tableHtml;

  // Footer
  const footer = document.createElement("div");
  footer.style.cssText = `
    padding: 12px 16px;
    border-top: 1px solid var(--stroke);
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  `;

  footer.innerHTML = `
    <button id="btnCancelarImport" class="dc-btn dc-btn-ghost">Cancelar</button>
    <button id="btnConfirmarImport" class="dc-btn">Cargar ${rows.length} productos</button>
  `;

  content.appendChild(head);
  content.appendChild(tableWrap);
  content.appendChild(footer);
  modal.appendChild(content);
  document.body.appendChild(modal);

  // Eventos
  const btnCerrar = document.getElementById("btnCerrarModal");
  const btnCancelar = document.getElementById("btnCancelarImport");
  const btnConfirmar = document.getElementById("btnConfirmarImport");

  function cerrarModal() {
    modal.remove();
  }

  btnCerrar?.addEventListener("click", cerrarModal);
  btnCancelar?.addEventListener("click", cerrarModal);

  btnConfirmar?.addEventListener("click", async () => {
    cerrarModal();
    await cargarProductosDesdeCSV(rows);
  });

  return new Promise((resolve) => {
    const origRemove = modal.remove;
    modal.remove = function() {
      origRemove.call(this);
      resolve();
    };
  });
}

// Cargar productos desde CSV a Firebase
async function cargarProductosDesdeCSV(rows) {
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
    <div style="margin-bottom: 8px;">Cargando productos...</div>
    <div style="width: 100%; height: 6px; background: var(--stroke); border-radius: 3px; overflow: hidden;">
      <div id="progressBar" style="height: 100%; background: #4CAF50; width: 0%; transition: width 0.3s;"></div>
    </div>
    <div id="progressText" style="margin-top: 8px; font-size: 12px; color: var(--muted);">0 / ${rows.length}</div>
  `;

  document.body.appendChild(progressDiv);

  let loaded = 0;
  const errors = [];

  for (const row of rows) {
    try {
      // Validar datos mínimos
      const nombre = normalize(row.nombre || "");
      const categoria = normalize(row.categoria || "");

      if (!nombre || !categoria) {
        errors.push(`Fila ${loaded + 1}: NOMBRE y CATEGORÍA obligatorios`);
        loaded++;
        continue;
      }

      // Preparar payload
      const condicion = normalize(row.condicion || "NUEVO");
      const external_key = `${nombre}|${condicion}`;

      // Verificar duplicado
      const dup = await existsExternalKey(external_key);
      if (dup) {
        errors.push(`Fila ${loaded + 1}: YA EXISTE ${external_key}`);
        loaded++;
        continue;
      }

      const stock = n(row.stock);
      const stock_transito = n(row.stock_transito);
      const stock_reservado = n(row.stock_reservado);
      const stock_proyectado = calcStockProyectado(stock, stock_transito, stock_reservado);

      const payload = {
        nombre,
        categoria,
        sku: normalize(row.sku || ""),
        marca: normalize(row.marca || ""),
        modelo: normalize(row.modelo || ""),
        condicion,
        estado: normalize(row.estado || "ACTIVO"),
        stock,
        stock_transito,
        stock_reservado,
        stock_proyectado,
        costo_prom: n(row.costo_prom),
        precio: n(row.precio),
        garantia_meses: n(row.garantia_meses),
        ubicacion: normalize(row.ubicacion || ""),
        notas: normalize(row.notas || ""),
        external_key,
        foto_url: "",
        foto_path: "",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      await addDoc(collection(db, "productos"), payload);
      loaded++;

    } catch (err) {
      errors.push(`Fila ${loaded + 1}: ${err?.message || "Error desconocido"}`);
      loaded++;
    }

    // Actualizar progreso
    const percent = Math.round((loaded / rows.length) * 100);
    const bar = progressDiv.querySelector("#progressBar");
    const text = progressDiv.querySelector("#progressText");
    if (bar) bar.style.width = percent + "%";
    if (text) text.textContent = `${loaded} / ${rows.length}`;
  }

  progressDiv.remove();

  // Refrescar tabla
  await refresh();

  // Mostrar resultado
  let msg = `✓ Cargados ${loaded} productos`;
  if (errors.length) {
    msg += `\n\n⚠ Errores (${errors.length}):\n${errors.slice(0, 5).join("\n")}`;
    if (errors.length > 5) msg += `\n... y ${errors.length - 5} más`;
  }

  alert(msg);
}

// Helper: calcular stock proyectado
function calcStockProyectado(stock, transito, reservado) {
  return Math.max(0, stock + transito - reservado);
}

/* =========================
   MOUNT
   ========================= */
export async function mountInventarioGeneral(container){
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
      localStorage.setItem('dc_inventario_drawer_minimized', isMinimized ? '1' : '0');
    }
  });
  
  // CSV handlers
  $("#btnDescargarCsv").addEventListener("click", descargarPlantilla);
  
  $("#btnCargarCsv").addEventListener("click", () => {
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
            const parsed = parseCSV(csvText);
            console.log("Parsed CSV:", parsed); // DEBUG
            if (parsed.rows.length > 0) {
              mostrarVistaPrevia(parsed);
            } else {
              // Mostrar más detalles del error
              const lines = csvText.trim().split("\n");
              const headers = lines[0];
              alert(`No se encontraron productos en el CSV.\n\nCabecera detectada:\n${headers}\n\nAsegúrate de que:\n1. La primera fila sea la cabecera\n2. Haya al menos una fila de datos\n3. El campo "nombre" esté presente`);
            }
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  });

  $("#invSearch").addEventListener("input", applyFilters);
  $("#fCategoria").addEventListener("change", applyFilters);
  $("#fCondicion").addEventListener("change", applyFilters);
  $("#fEstado").addEventListener("change", applyFilters);

  await refresh();
  
  // Restaurar estado del drawer
  const isMinimized = localStorage.getItem('dc_inventario_drawer_minimized') === '1';
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
