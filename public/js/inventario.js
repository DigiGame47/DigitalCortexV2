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
          <button id="btnRefrescar" class="dc-btn dc-btn-ghost">Refrescar</button>
        </div>
      </div>

      <div style="margin-top:12px;" class="dc-table-wrap">
        <table class="dc-table">
          <thead>
            <tr>
              <th>Foto</th>
              <th>SKU</th>
              <th>Producto</th>
              <th>CLAVE</th>
              <th>Categoría</th>
              <th>Condición</th>
              <th>Estado</th>
              <th style="text-align:right;">Stock</th>
              <th style="text-align:right;">Tránsito</th>
              <th style="text-align:right;">Reservado</th>
              <th style="text-align:right;">Proyectado</th>
              <th style="text-align:right;">Costo Prom</th>
              <th style="text-align:right;">Precio</th>
              <th>Acciones</th>
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
  // ✅ CAMBIO: cargar TODOS, no solo stock_proyectado > 0
  const snap = await getDocs(collection(db, "productos"));

  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

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

function applyFilters(){
  const q = normalize($("#invSearch").value);
  const cat = normalize($("#fCategoria").value);
  const cond = normalize($("#fCondicion").value);
  const est = normalize($("#fEstado").value);

  state.filtered = state.rows.filter(r => {
    const text = normalize(`${r.nombre||""} ${r.sku||""} ${r.marca||""} ${r.modelo||""}`);
    if (q && !text.includes(q)) return false;
    if (cat && normalize(r.categoria) !== cat) return false;
    if (cond && normalize(r.condicion) !== cond) return false;
    if (est && normalize(r.estado) !== est) return false;
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
    const foto = (r.foto_url && r.foto_url !== "SIN FOTO") ? r.foto_url : "";
    const selectedClass = r.id === state.selectedId ? "selected" : "";
    return `
      <tr class="dc-row ${selectedClass}" data-row="${r.id}">
        <td>${foto ? `<img class="dc-img-sm" src="${foto}" />` : `<div class="dc-img-sm"></div>`}</td>
        <td>${r.sku || ""}</td>
        <td><span class="dc-pill">${r.nombre || ""}</span></td>
        <td>${escapeHtml(r.external_key || (r.nombre || "") + '|' + (r.condicion || ''))}</td>
        <td>${r.categoria || ""}</td>
        <td>${r.condicion || ""}</td>
        <td>${r.estado || ""}</td>
        <td style="text-align:right;">${n(r.stock)}</td>
        <td style="text-align:right;">${n(r.stock_transito)}</td>
        <td style="text-align:right;">${n(r.stock_reservado)}</td>
        <td style="text-align:right;"><b>${n(r.stock_proyectado)}</b></td>
        <td style="text-align:right;">${money(r.costo_prom)}</td>
        <td style="text-align:right;">${money(r.precio)}</td>
        <td>
          <div class="dc-actions">
            <button class="dc-btn dc-mini" data-edit="${r.id}" type="button">Editar</button>
            <button class="dc-btn dc-mini dc-danger" data-del="${r.id}" type="button">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tb.querySelectorAll("[data-row]").forEach(row => {
    row.addEventListener("click", (ev) => {
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

    ${foto ? `<img class="preview-img" src="${foto}" />` : `<div class="preview-img"></div>`}

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
    payload.foto_url = "SIN FOTO";
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
    foto_url: current?.foto_url || "SIN FOTO",
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
   MOUNT
   ========================= */
export async function mountInventarioGeneral(container){
  container.innerHTML = viewTemplate();

  $("#btnNuevo").addEventListener("click", openNew);
  $("#btnRefrescar").addEventListener("click", refresh);

  $("#invSearch").addEventListener("input", applyFilters);
  $("#fCategoria").addEventListener("change", applyFilters);
  $("#fCondicion").addEventListener("change", applyFilters);
  $("#fEstado").addEventListener("change", applyFilters);

  await refresh();
  renderTable();
  renderDrawer();

  initResizer(container);
}
