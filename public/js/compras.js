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
   UI + ESTILOS (IGUAL A INVENTARIO)
   ========================= */


function ensureUIStyles(){
  if ($("#dc-comp-styles")) return;

  const s = document.createElement("style");
  s.id = "dc-comp-styles";
  s.textContent = `
    .dc-input{ padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.03); color: rgba(238,240,255,.95); outline:none; }
    .dc-input::placeholder{ color: rgba(238,240,255,.45); }

    .dc-btn{ padding:10px 14px; border-radius:12px; border:1px solid rgba(79,111,255,.25);
      background: rgba(79,111,255,.18); color:#fff; cursor:pointer; font-weight:800; }
    .dc-btn:hover{ background: rgba(79,111,255,.25); }
    .dc-btn-ghost{ background: rgba(255,255,255,.03); border-color: rgba(255,255,255,.10); }
    .dc-btn-ghost:hover{ background: rgba(255,255,255,.06); }
    .dc-danger{ border-color: rgba(255,120,120,.30); background: rgba(255,120,120,.18); }
    .dc-danger:hover{ background: rgba(255,120,120,.25); }

    .dc-input{ -webkit-appearance:none; -moz-appearance:none; appearance:none; }
    select.dc-input{
      padding-right: 38px;
      cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M7 10l5 5 5-5' stroke='rgba(238,240,255,0.75)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat:no-repeat;
      background-position:right 12px center;
      background-size:18px 18px;
    }
    select.dc-input option{ background:#0f1424; color:#eef0ff; }

    /* =========================
       GRID (RESPONSIVE REAL)
       ========================= */

    /* ✅ minmax(0,1fr) evita que la tabla "reviente" el grid */
    .inv-grid{
      display:grid;
      grid-template-columns: minmax(0, 1fr) auto clamp(320px, 32vw, var(--drawerW, 520px));
      gap: 14px;
      align-items:start;
    }

    /* drawer (columna derecha) */
    .inv-drawer{
      border-radius: 16px;
      border:1px solid rgba(255,255,255,.10);
      background: rgba(19,26,42,.70);
      padding: 12px;
      position: sticky;
      top: 12px;

      /* ✅ ancho flexible (mejor que fijo) */
      width: clamp(320px, 32vw, var(--drawerW, 520px));
      min-width: 320px;
      max-width: 920px;

      height: calc(100vh - 120px);
      overflow: auto;
    }

    /* ✅ Breakpoint más realista (muchas pantallas quedan entre 1200–1400) */
    @media (max-width: 1400px){
      .inv-grid{ grid-template-columns: minmax(0, 1fr) auto 420px; }
      .inv-drawer{ width: 420px; min-width: 360px; }
    }

    /* ✅ ya en pantallas menores: 1 columna (drawer abajo) */
    @media (max-width: 1100px){
      .inv-grid{ grid-template-columns: 1fr; }
      .inv-drawer{
        position:relative;
        top:auto;
        height:auto;
        width:100%;
        min-width: unset;
        max-width: unset;
      }
      .drawer-resizer{ display:none; }
    }

    /* =========================
       TABLE
       ========================= */
    .dc-table-wrap{ overflow:auto; border-radius:14px; border:1px solid rgba(255,255,255,.08); }

    /* ✅ min-width moderado */
    .dc-table{
      width:100%;
      border-collapse:separate;
      border-spacing:0;
      min-width: 1050px;
    }
    @media (max-width: 700px){
      .dc-table{ min-width: 760px; }
    }

    .dc-table th, .dc-table td{ padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); font-size:13px; white-space:nowrap; }
    .dc-table th{ position:sticky; top:0; background: rgba(15,20,36,.92); z-index:1; text-align:left; }
    .dc-row{ cursor:pointer; }
    .dc-row:hover{ background: rgba(255,255,255,.04); }
    .dc-row.selected{ background: rgba(79,111,255,.12); outline: 1px solid rgba(79,111,255,.25); }

    .dc-actions{ display:flex; gap:8px; }
    .dc-mini{ padding:8px 10px; border-radius:10px; font-weight:800; }
    .dc-pill{ padding:4px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); display:inline-block; }

    /* resizer */
    .drawer-resizer{ width:12px; cursor: col-resize; display:block; border-radius:8px; background:transparent; position:relative; }
    .drawer-resizer::before{ content:""; position:absolute; top:8px; bottom:8px; left:5px; width:2px; background: rgba(255,255,255,.06); border-radius:2px; }

    .drawer-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
    .drawer-title{ font-weight:900; letter-spacing:.2px; margin:0; font-size:14px; color: rgba(238,240,255,.92); }
    .drawer-sub{ font-size:12px; color: rgba(238,240,255,.60); margin-top:2px; }

    .preview-img{
      width:100%;
      aspect-ratio: 16/10;
      border-radius: 14px;
      border:1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.04);
      object-fit: cover;
      margin-bottom:10px;
    }

    .chiprow{ display:flex; gap:8px; flex-wrap:wrap; margin: 6px 0 10px; }
    .chip{ padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); font-size:12px; }

    .kv{
      display:grid;
      grid-template-columns: 140px 1fr;
      gap:8px;
      padding:8px 0;
      border-bottom:1px solid rgba(255,255,255,.06);
      font-size:12px;
    }
    @media (max-width: 520px){
      .kv{ grid-template-columns: 1fr; }
      .dc-input{ width:100%; }
    }
    .kv b{ color: rgba(238,240,255,.85); font-weight:800; }
    .kv span{ color: rgba(238,240,255,.78); }

    .form-grid{ display:grid; grid-template-columns: 1fr; gap:10px; margin-top:10px; }
    .dc-label{ display:flex; flex-direction:column; gap:6px; font-size:12px; color: rgba(238,240,255,.78); }

    .divider{ height:1px; background: rgba(255,255,255,.08); margin:10px 0; }
    .hint{ font-size:12px; color: rgba(238,240,255,.58); line-height:1.35; }

    .dc-img-sm{
      width:34px; height:34px; border-radius:10px; object-fit:cover;
      border:1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.05);
    }

    /* Suggestions (autocomplete) */
    .dc-suggest-wrap{ position:relative; }
    .suggestions{ position:absolute; left:0; top:calc(100% + 6px); min-width:260px; max-width:calc(100vw - 40px); background:#0f1424; border:1px solid rgba(255,255,255,.08); border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,.45); z-index:80; max-height:260px; overflow:auto; }
    .suggestion-item{ padding:8px 10px; cursor:pointer; color: rgba(238,240,255,.95); font-size:13px; }
    .suggestion-item:hover, .suggestion-item.active{ background: rgba(79,111,255,.12); }

    .dc-badge{
      padding:6px 10px; border-radius:12px;
      border:1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.03);
      font-size:12px;
    }

    .dc-btn-warn{
      border-color: rgba(255,205,120,.35);
      background: rgba(255,205,120,.18);
    }
    .dc-btn-warn:hover{ background: rgba(255,205,120,.26); }
  `;
  document.head.appendChild(s);
}




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
        </div>
      </div>

      <div style="margin-top:12px;" class="dc-table-wrap">
        <table class="dc-table">
          <thead>
            <tr>
              <th>Foto</th>
              <th>N RASTREO</th>
              <th>ESTADO</th>
              <th>CLAVE</th>
              <th>CATEGORÍA</th>
              <th style="text-align:right;">CANT</th>
              <th style="text-align:right;">TOTAL</th>
              <th style="text-align:right;">C/U</th>
              <th>PROVEEDOR ENVIO</th>
              <th>TIENDA</th>
              <th>USUARIO</th>
              <th>FECHA COMPRA</th>
              <th>FECHA RECIBIDO</th>
              <th style="text-align:right;">ENVIO</th>
              <th style="text-align:right;">RECIBIDO</th>
              <th>ACCIONES</th>
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
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  state.productos = rows;
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


function applyFilters(){
  const q = normalize($("#cSearch").value);
  const est = normalize($("#fEstadoTransito").value);
  const tienda = normalize($("#fTienda").value);
  const usuario = normalize($("#fUsuario").value);

  state.filtered = state.rows.filter(r=>{
    const text = normalize(`${r.n_rastreo||""} ${r.external_key||""} ${r.tienda||""} ${r.usuario||""} ${r.proveedor_envio||""}`);
    if (q && !text.includes(q)) return false;
    if (est && normalize(r.estado_transito) !== est) return false;
    if (tienda && normalize(r.tienda) !== tienda) return false;
    if (usuario && normalize(r.usuario) !== usuario) return false;
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
    const foto = (r.foto_url && r.foto_url !== "SIN FOTO") ? r.foto_url : "";
    const selectedClass = r.id === state.selectedId ? "selected" : "";
    return `
      <tr class="dc-row ${selectedClass}" data-row="${r.id}">
        <td>${foto ? `<img class="dc-img-sm" src="${foto}"/>` : `<div class="dc-img-sm"></div>`}</td>
        <td>${escapeHtml(r.n_rastreo || "")}</td>
        <td><span class="dc-pill">${escapeHtml(r.estado_transito || "")}</span></td>
        <td>${escapeHtml(r.external_key || "")}</td>
        <td>${escapeHtml(r.categoria || "")}</td>
        <td style="text-align:right;">${n(r.cantidad)}</td>
        <td style="text-align:right;">${money(r.total_costo)}</td>
        <td style="text-align:right;">${money(r.costo_unitario)}</td>
        <td>${escapeHtml(r.proveedor_envio || "")}</td>
        <td>${escapeHtml(r.tienda || "")}</td>
        <td>${escapeHtml(r.usuario || "")}</td>
        <td>${escapeHtml(r.fecha_compra || "")}</td>
        <td>${escapeHtml(r.fecha_recibido || "")}</td>
        <td style="text-align:right;">${money(r.costo_envio_total)}</td>
        <td style="text-align:right;"><b>${n(r.cant_recibido_total)}</b></td>
        <td>
          <div class="dc-actions">
            <button class="dc-btn dc-mini" data-edit="${r.id}" type="button">Editar</button>
            <button class="dc-btn dc-mini dc-danger" data-del="${r.id}" type="button">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tb.querySelectorAll("[data-row]").forEach(row=>{
    row.addEventListener("click", (ev)=>{
      if (ev.target.closest("button")) return;
      state.selectedId = row.dataset.row;
      state.mode = "details";
      renderTable();
      renderDrawer();
    });
  });

  tb.querySelectorAll("[data-edit]").forEach(b =>
    b.addEventListener("click", () => openEdit(b.dataset.edit))
  );
  tb.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", () => onDelete(b.dataset.del))
  );
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
  // r == null => new
  // r != null => edit
  return `
    <form id="drawerForm" class="form-grid">

      <label class="dc-label">PRODUCTO / CONDICIÓN (CLAVE) *
        <input id="cProductoKey" class="dc-input" placeholder="EJ: JBL TUNE BUDS|SIN_CAJA" required ${r ? "disabled" : ""}>
      </label>

      <div id="prodChips"></div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">N PRODUCTO
          <input id="cNProducto" class="dc-input" disabled>
        </label>
        <label class="dc-label">CATEGORÍA
          <input id="cCategoria" class="dc-input" disabled>
        </label>
      </div>

      <label class="dc-label">CONDICIÓN
        <input id="cCondicion" class="dc-input" disabled>
      </label>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">N RASTREO <input id="cRastreo" class="dc-input" placeholder="OPCIONAL"></label>
        <label class="dc-label">ESTADO DE TRÁNSITO *
          <select id="cEstado" class="dc-input" required>
            ${ESTADOS_TRANSITO.map(x=> `<option>${x}</option>`).join("")}
          </select>
        </label>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <label class="dc-label">CANTIDAD * <input id="cCantidad" class="dc-input" type="number" min="1" value="1" required></label>
        <label class="dc-label">TOTAL COSTO * <input id="cTotalCosto" class="dc-input" type="number" min="0" step="0.01" value="0" required></label>
      </div>

      <label class="dc-label">COSTO UNITARIO (AUTO)
        <input id="cCostoUnitario" class="dc-input" type="number" step="0.01" value="0" disabled>
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

  $("#cNProducto").value = p?.nombre || "";
  $("#cCategoria").value = p?.categoria || "";
  $("#cCondicion").value = p?.condicion || "";
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
    items = list.slice(0, 14);
    if (!items.length){ hide(); return; }

    sugg.innerHTML = items.map((p, i) => `
      <div class="suggestion-item" data-idx="${i}" data-val="${escapeHtml(p.external_key)}">
        <div style="font-weight:900;">${escapeHtml(p.external_key)}</div>
        <div style="opacity:.7; font-size:12px;">${escapeHtml(p.categoria||"")} · STOCK ${n(p.stock)} · TRÁNSITO ${n(p.stock_transito)} · $${money(p.costo_prom)}</div>
      </div>
    `).join("");

    sugg.querySelectorAll('.suggestion-item').forEach(it => it.addEventListener('mousedown', (ev)=>{
      ev.preventDefault();
      const key = it.dataset.val;
      input.value = key;
      const p = findProductoByKey(key);
      setProductoSelected(p);
      hide();
    }));

    sugg.style.display = 'block';
    activeIdx = -1;
  }

  function onInput(){
    const q = normalize(input.value || '');
    if (!q) { hide(); setProductoSelected(null); return; }

    const list = state.productos
      .filter(p => normalize(p.external_key).includes(q))
      .sort((a,b)=> (a.external_key||"").localeCompare(b.external_key||""));

    showList(list);
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

function wireDrawerForm(r){
  const recepMode = !!window.__dc_recepcion_mode;

  // defaults
  $("#cFechaCompra").value = todayISO();
  $("#cFechaRecibido").value = "";

  // si edita, llenar valores
  if (r){
    $("#cProductoKey").value = r.external_key || "";
    $("#cRastreo").value = r.n_rastreo || "";
    $("#cEstado").value = r.estado_transito || "EN_TRANSITO";
    $("#cCantidad").value = n(r.cantidad) || 1;
    $("#cTotalCosto").value = n(r.total_costo) || 0;
    $("#cCostoUnitario").value = money(n(r.costo_unitario));
    $("#cProveedorEnvio").value = r.proveedor_envio || "";
    $("#cTienda").value = r.tienda || "";
    $("#cUsuario").value = r.usuario || "";
    $("#cFechaCompra").value = r.fecha_compra || "";
    $("#cFechaRecibido").value = r.fecha_recibido || "";
  } else {
    $("#cEstado").value = "EN_TRANSITO";
    $("#cCantidad").value = 1;
    $("#cTotalCosto").value = 0;
    $("#cCostoUnitario").value = "0.00";
    $("#cCostoEnvioAdd").value = "0";
    $("#cCantRecibidoAdd").value = "0";
  }

  // producto seleccionado
  if (r){
    const p = findProductoByKey(r.external_key);
    setProductoSelected(p);
  } else {
    setProductoSelected(null);
  }

  // autocomplete producto (solo cuando es new)
  if (!r){
    setupAutocompleteProducto("cProductoKey");
  }

  // calcular costo unitario cuando cambia cantidad o total
  const recalc = ()=> computeCostoUnitario();
  $("#cCantidad").addEventListener("input", recalc);
  $("#cTotalCosto").addEventListener("input", recalc);

  // modo recepcion o estado recepcion ya existente
  const estadoInicial = normalize($("#cEstado").value);
  const isEstadoRecep = (estadoInicial === "RECIBIDO" || estadoInicial === "PENDIENTE_DE_RETIRAR" || estadoInicial === "RECIBIDO_PARCIALMENTE");
  const enableRecep = recepMode || isEstadoRecep;

  enableRecepcionFields(enableRecep);
  restrictEstadoForRecepcion(enableRecep);

  // si habilitamos recepcion, forzamos estado a uno permitido si no lo era
  if (enableRecep){
    const cur = normalize($("#cEstado").value);
    if (cur !== "RECIBIDO" && cur !== "PENDIENTE_DE_RETIRAR"){
      $("#cEstado").value = "RECIBIDO";
    }
  }

  // cancelar
  $("#btnCancelDrawer")?.addEventListener("click", ()=>{
    window.__dc_recepcion_mode = false;
    state.mode = state.selectedId ? "details" : "new";
    renderDrawer();
  });

  // submit
  $("#drawerForm")?.addEventListener("submit", (ev)=> onSave(ev, r));
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
  
  ensureUIStyles();
  container.innerHTML = viewTemplate();

  $("#btnNuevo").addEventListener("click", openNew);
  $("#btnRefrescar").addEventListener("click", refresh);

  $("#cSearch").addEventListener("input", applyFilters);
  $("#fEstadoTransito").addEventListener("change", applyFilters);
  $("#fTienda").addEventListener("input", applyFilters);
  $("#fUsuario").addEventListener("input", applyFilters);

  await refresh();
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
