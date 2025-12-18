import { db } from "./firebase.js";

console.log('[compras] module loaded');
import {
  collection, getDocs, addDoc, doc, setDoc, updateDoc, getDoc, deleteDoc,
  serverTimestamp, query, where, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { computeNewCostoProm } from './compras-utils.js';

const $c = (q) => document.querySelector(q);

const state = {
  rows: [],
};

function n(v){ return Number(v || 0); }
function money(v){ return n(v).toFixed(2); }
function normalize(s){ return (s||"").toString().trim(); }

function ensureCompraStyles(){
  // if the global inventory styles already exist, reuse them
  if (document.getElementById('dc-inv-styles')) return;
  if (document.getElementById('dc-compras-styles')) return;

  const s = document.createElement('style');
  s.id = 'dc-compras-styles';
  s.textContent = `
    /* ===== shared ui (copied from inventario) ===== */
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

    .dc-table-wrap{ overflow:auto; border-radius:14px; border:1px solid rgba(255,255,255,.08); }
    .dc-table{ width:100%; border-collapse:separate; border-spacing:0; min-width:1100px; }
    .dc-table th, .dc-table td{ padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); font-size:13px; white-space:nowrap; }
    .dc-table th{ position:sticky; top:0; background: rgba(15,20,36,.92); z-index:1; text-align:left; }
    .dc-row{ cursor:pointer; }
    .dc-row:hover{ background: rgba(255,255,255,.04); }

    /* suggestions */
    .dc-suggest-wrap{ position:relative; }
    .suggestions{ position:absolute; left:0; top:calc(100% + 6px); min-width:220px; max-width:calc(100vw - 40px); background:#0f1424; border:1px solid rgba(255,255,255,.08); border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,.45); z-index:80; max-height:240px; overflow:auto; }
    .suggestion-item{ padding:8px 10px; cursor:pointer; }
    .suggestion-item.active{ background: rgba(255,255,255,.03); }

    /* Drawer layout */
    .inv-grid{ display:grid; grid-template-columns: 1fr auto var(--drawerW, 520px); gap:14px; align-items:start; }
    @media (max-width: 1100px){ .inv-grid{ grid-template-columns: 1fr; } .inv-drawer{ position:relative; right:auto; top:auto; height:auto; } .drawer-resizer{ display:none; } }
    .inv-drawer{ border-radius: 16px; border:1px solid rgba(255,255,255,.10); background: rgba(19,26,42,.70); padding: 12px; position: sticky; top: 12px; width: var(--drawerW, 520px); min-width: 420px; max-width: 920px; height: calc(100vh - 120px); overflow: auto; }
    .drawer-resizer{ width:12px; cursor: col-resize; display:block; border-radius:8px; background:transparent; position:relative; }
    .drawer-resizer::before{ content:""; position:absolute; top:8px; bottom:8px; left:5px; width:2px; background: rgba(255,255,255,.06); border-radius:2px; }
    .drawer-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
    .drawer-title{ font-weight:900; letter-spacing:.2px; margin:0; font-size:14px; color: rgba(238,240,255,.92); }
    .drawer-sub{ font-size:12px; color: rgba(238,240,255,.60); margin-top:2px; }

    .drawer-actions{ display:flex; gap:8px; margin-top:12px; }
  `;
  document.head.appendChild(s);
}

function distinctOriginal(arr, key){
  const map = new Map();
  for (const x of arr){
    const raw = (x[key] || "").toString();
    const k = normalize(raw);
    if (k && !map.has(k)) map.set(k, raw);
  }
  return Array.from(map.values()).sort((a,b)=> a.localeCompare(b));
}

function setupAutocompleteFor(inputEl, key, sourceArray, onSelect){
  const input = typeof inputEl === 'string' ? document.getElementById(inputEl) : inputEl;
  if (!input) return;
  ensureCompraStyles();

  // ensure wrapper exists (for absolute positioning)
  let wrap = input.closest('.dc-suggest-wrap');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.className = 'dc-suggest-wrap';
    input.parentElement.insertBefore(wrap, input);
    wrap.appendChild(input);
  }

  // create suggestions container
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
    // attach click
    sugg.querySelectorAll('.suggestion-item').forEach(it => it.addEventListener('mousedown', (ev)=>{
      ev.preventDefault(); // prevent blur before click
      const val = it.dataset.val;
      input.value = val;
      input.dispatchEvent(new Event('input'));
      // if a sourceArray and key were provided, try to find the corresponding object and notify
      if (Array.isArray(sourceArray) && typeof key === 'string' && typeof onSelect === 'function'){
        const found = sourceArray.find(o => normalize((o[key]||'') + '') === normalize(val + ''));
        if (found) onSelect(found);
      }
      hide();
    }));
    sugg.style.display = 'block';
    activeIdx = -1;
  }

  function onInput(){
    const q = normalize(input.value || '');
    if (!q) { hide(); return; }
    const all = sourceArray ? distinctOriginal(sourceArray, key) : distinctOriginal(state.rows, key);
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

async function loadCompras(){
  const snap = await getDocs(collection(db, "compras"));
  const rows = [];
  snap.forEach(s => rows.push({ id: s.id, ...s.data() }));
  // sort by fecha_compra desc if available
  rows.sort((a,b)=> (b.fecha_compra?.toMillis?.()||0) - (a.fecha_compra?.toMillis?.()||0));
  state.rows = rows;
}

function escapeHtml(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderTable(){
  const rows = state.rows;
  if (!rows.length) return `<div class="card">No hay órdenes de compra</div>`;

  return `
    <div class="card">
      <div class="dc-table-wrap">
        <table class="dc-table">
          <thead>
            <tr>
              <th>N RASTREO</th>
              <th>NOMBRE</th>
              <th>CLAVE</th>
              <th>ESTADO</th>
              <th>CANT</th>
              <th>RECIBIDO</th>
              <th>COSTO TOTAL</th>
              <th>COSTO U.</th>
              <th>PROVEEDOR</th>
              <th>FECHA</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>{
              const costoTotal = n(r.costo_total || 0);
              const costoUnit = costoTotal > 0 ? (costoTotal / Math.max(1, n(r.cantidad))) : n(r.costo_unitario || 0);
              return `
              <tr data-id="${r.id}" class="dc-row">
                <td>${escapeHtml(r.n_rastreo||'')}</td>
                <td>${escapeHtml(r.nombre||'')}</td>
                <td>${escapeHtml(r.external_key || ((r.nombre||'') + '|' + (r.estado||'')))}</td>
                <td>${escapeHtml(r.estado||'')}</td>
                <td>${n(r.cantidad)}</td>
                <td>${n(r.cantidad_recibida||0)}</td>
                <td>$${money(costoTotal)}</td>
                <td>$${money(costoUnit)}</td>
                <td>${escapeHtml(r.proveedor||'')}</td>
                <td>${r.fecha_compra?.toDate ? r.fecha_compra.toDate().toLocaleDateString() : ''}</td>
                <td>
                  <input type="number" min="1" class="receive-qty dc-input" style="width:80px;display:inline-block;margin-right:8px;" placeholder="qty" />
                  <input type="number" min="0" step="0.01" class="receive-transporte dc-input" style="width:120px;display:inline-block;margin-right:8px;" placeholder="Costo transporte" />
                  <button class="dc-btn dc-mini receive-btn">Recepcionar</button>
                  <button class="dc-btn dc-mini dc-btn-ghost edit-btn">Editar</button>
                  <button class="dc-btn dc-mini dc-danger delete-btn">Eliminar</button>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function mountComprasRecepcion(container){
  ensureCompraStyles();
  console.log('[compras] mountComprasRecepcion called', container);

  container.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">Recepción de órdenes</h3>
      <button id="newCompraBtn" class="dc-btn dc-btn-ghost">Nueva orden</button>
    </div>

    <div class="inv-grid">
      <div id="comprasListCol">
        <div id="comprasList">Cargando...</div>
      </div>
      <div class="drawer-resizer" id="drawerResizer" style="display:none"></div>
      <aside id="comprasDrawer" class="inv-drawer" style="display:none" data-id=""></aside>
    </div>
  `;

  // init resizer (simple show/hide based on viewport)
  const res = container.querySelector('#drawerResizer');
  initDrawerResizer(res);

  await reloadAndRender(container);

  // wire new button
  const nb = container.querySelector('#newCompraBtn');
  nb.addEventListener('click', ()=> openCompraDrawer(null, container));

  // global click delegation
  container.addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('.receive-btn');
    if (btn){
      const tr = btn.closest('tr');
      const id = tr?.dataset?.id;
      const input = tr.querySelector('.receive-qty');
      const transporteInput = tr.querySelector('.receive-transporte');
      const qty = Math.max(0, Number(input.value||0));
      const transporte = Math.max(0, Number(transporteInput?.value||0));
      if (!id || qty <= 0) return showToast('Ingresa cantidad mayor a 0', true);
      btn.disabled = true;
      try{
        if (transporte === 0){
          const ok = await showConfirm('Costo transporte no especificado. ¿Deseas continuar con 0?');
          if (!ok){ btn.disabled = false; return; }
        }
        const res = await receivePurchase(id, qty, transporte);
        await reloadAndRender(container);
        if (res){
          if (res.remaining <= 0) showToast(`Recepción completa: ${res.applied} recibidos (orden completa)`);
          else showToast(`Recepción parcial: ${res.applied} recibidos, quedan ${res.remaining}`);
        } else {
          showToast('Recepción procesada');
        }
      }catch(e){ showToast('Error: ' + (e.message||e), true); }
      btn.disabled = false;
      return;
    }

    // edit button
    const editBtn = ev.target.closest('.edit-btn');
    if (editBtn){
      const tr = editBtn.closest('tr');
      const id = tr?.dataset?.id;
      if (id) openCompraDrawer(id, container);
      return;
    }

    // delete button
    const delBtn = ev.target.closest('.delete-btn');
    if (delBtn){
      const tr = delBtn.closest('tr');
      const id = tr?.dataset?.id;
      if (!id) return showToast('Orden no encontrada', true);
      if (!await showConfirm('Eliminar orden?')) return;
      try{
        await deleteDoc(doc(db,'compras',id));
        await reloadAndRender(container);
        showToast('Orden eliminada');
      }catch(e){ showToast('Error eliminando: '+(e.message||e), true); }
      return;
    }

    // table row click => open drawer (or toggle)
    const tr = ev.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    const aside = container.querySelector('#comprasDrawer');
    const visible = aside.style.display !== 'none' && aside.dataset.id === id;
    if (visible){ aside.style.display = 'none'; aside.dataset.id = ''; return; }

    openCompraDrawer(id, container);
  });
}

async function reloadAndRender(container){
  await loadCompras();
  const list = container.querySelector('#comprasList');
  list.innerHTML = renderTable();
}

async function openCompraDrawer(id, container){
  // id == null => new
  const drawer = container.querySelector('#comprasDrawer');
  drawer.style.display = 'block';
  drawer.dataset.id = id || '';

  // get products list for suggestions
  const prodSnap = await getDocs(collection(db, 'productos'));
  const productsArray = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // helper: refresh badge showing stock / costo_prom for given product id
  async function refreshProductBadge(prodId){
    const stockEl = drawer.querySelector('#badge_stock');
    const costoEl = drawer.querySelector('#badge_costo');
    if (!stockEl || !costoEl) return;
    if (!prodId){ stockEl.textContent = '-'; costoEl.textContent = '-'; return; }
    // try to find in cached list
    let prod = productsArray.find(p => p.id === prodId);
    if (!prod){
      try{
        const psnap = await getDoc(doc(db,'productos', prodId));
        if (psnap.exists()) prod = { id: psnap.id, ...psnap.data() };
      }catch(e){ console.warn('Error fetching product for badge', e); }
    }
    if (!prod){ stockEl.textContent = 'N/A'; costoEl.textContent = 'N/A'; return; }
    stockEl.textContent = n(prod.stock);
    costoEl.textContent = money(prod.costo_prom || 0);
  }

  // build form
  drawer.innerHTML = `
    <div class="card">
      <div class="drawer-head">
        <div>
          <h3 class="drawer-title">${id ? 'Editar orden' : 'Nueva orden de compra'}</h3>
          <div class="drawer-sub">Administra los detalles de la orden</div>
        </div>
        <div id="c_prod_badge" style="text-align:right;">
          <div style="display:inline-block;padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);font-size:12px;color:rgba(238,240,255,.9);">
            <div>Stock: <b id="badge_stock">-</b></div>
            <div>Costo Prom: $<b id="badge_costo">-</b></div>
          </div>
        </div>
      </div>

      <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <input id="c_nombre" class="dc-input" placeholder="Nombre producto" readonly />
        <input id="c_n_rastreo" class="dc-input" placeholder="N rastreo" />
        <input id="c_categoria" class="dc-input" placeholder="Categoría" />
        <input id="c_proveedor" class="dc-input" placeholder="Proveedor" />
        <input id="c_cantidad" type="number" class="dc-input" placeholder="Cantidad" />
        <input id="c_costo_total" type="number" class="dc-input" placeholder="Costo total" />

        <select id="c_estado" class="dc-input">
          <option value="EN_TRANSITO">EN TRANSITO</option>
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="RECIBIDO">RECIBIDO</option>
        </select>
      </div>

      <div class="drawer-actions">
        <button id="saveCompra" class="dc-btn">Guardar</button>
        <button id="cancelCompra" class="dc-btn dc-btn-ghost">Cancelar</button>
        <button id="deleteCompra" class="dc-btn dc-danger" style="margin-left:auto;">Eliminar</button>
      </div>
    </div>
  `;

  // hidden value to capture productId from selection
  const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = 'c_productId'; drawer.querySelector('.form-grid').appendChild(hidden);

  // Build product select (only products created in inventory). The product name in inventory can include the state like "JBL Tune Buds | Caja abierta".
  const selHTML = ['<option value="">-- Selecciona producto --</option>']
    .concat(productsArray.map(p => {
      const label = p.external_key || ((p.nombre || '') + ' | ' + (p.condicion || ''));
      return `<option value="${p.id}">${escapeHtml(label)}</option>`;
    }))
    .join('');
  const selContainer = document.createElement('div'); selContainer.style.gridColumn = '1 / -1';
  selContainer.innerHTML = `<select id="c_prod_select" class="dc-input">${selHTML}</select>`;
  drawer.querySelector('.form-grid').insertBefore(selContainer, drawer.querySelector('#c_nombre'));

  const sel = drawer.querySelector('#c_prod_select');
  // initialize select/new form
  sel.value = '';
  drawer.querySelector('#c_productId').value = '';
  drawer.querySelector('#c_nombre').value = '';
  drawer.querySelector('#c_categoria').value = '';
  drawer.querySelector('#c_estado').value = 'EN_TRANSITO';
  refreshProductBadge('');

  sel.addEventListener('change', ()=>{
    const pid = sel.value;
    if (!pid){ drawer.querySelector('#c_productId').value = ''; drawer.querySelector('#c_nombre').value = ''; drawer.querySelector('#c_categoria').value = ''; drawer.querySelector('#c_estado').value = 'EN_TRANSITO'; refreshProductBadge(''); return; }
    const prod = productsArray.find(p=>p.id === pid);
    drawer.querySelector('#c_productId').value = pid;
    // product name may include a state after a '|' e.g. "JBL Tune Buds | Caja abierta"
    // set the displayed name to the product external key (nombre|condicion)
    drawer.querySelector('#c_nombre').value = prod?.external_key || ((prod?.nombre || '') + ' | ' + (prod?.condicion || ''));
    drawer.querySelector('#c_categoria').value = prod?.categoria || '';
    // do not override purchase estado here; leave it as selected or default
    refreshProductBadge(pid);
  });
  setupAutocompleteFor('c_categoria','categoria', productsArray, (prod)=>{
    const pIdEl = drawer.querySelector('#c_productId'); if (pIdEl) pIdEl.value = prod?.id || '';
    const nameEl = drawer.querySelector('#c_nombre'); if (nameEl) nameEl.value = prod?.nombre || '';
    refreshProductBadge(prod?.id);
  });

  // if editing, load data and ensure productId is available
  if (id){
    const snap = await getDoc(doc(db, 'compras', id));
    if (!snap.exists()) { showToast('Orden no encontrada', true); return; }
    const data = snap.data();
    drawer.querySelector('#c_nombre').value = data.nombre || '';
    drawer.querySelector('#c_n_rastreo').value = data.n_rastreo || '';
    drawer.querySelector('#c_categoria').value = data.categoria || '';
    drawer.querySelector('#c_proveedor').value = data.proveedor || '';
    drawer.querySelector('#c_cantidad').value = data.cantidad || 0;
    drawer.querySelector('#c_costo_total').value = data.costo_total || data.costo_unitario || 0;

    drawer.querySelector('#c_estado').value = data.estado || 'EN_TRANSITO';
    // ensure productId is set for validation when saving
    drawer.querySelector('#c_productId').value = data.productId || '';

      // try to select the combo entry productId
    const sel = drawer.querySelector('#c_prod_select');
    if (sel && data.productId){
      const opt = sel.querySelector(`option[value="${data.productId}"]`);
      if (opt) sel.value = data.productId;
      else { const o = document.createElement('option'); o.value = data.productId; o.textContent = `${data.external_key || data.nombre}`; sel.appendChild(o); sel.value = data.productId; }
      // set displayed name to the external key
      drawer.querySelector('#c_nombre').value = data.external_key || data.nombre || '';
      // ensure estado matches stored order (override inferred if needed)
      drawer.querySelector('#c_estado').value = data.estado || drawer.querySelector('#c_estado').value || 'EN_TRANSITO';
    }

    // refresh badge for linked product
    await refreshProductBadge(data.productId || '');
  }

  drawer.querySelector('#cancelCompra').addEventListener('click', ()=>{ drawer.style.display='none'; drawer.dataset.id=''; });

  drawer.querySelector('#saveCompra').addEventListener('click', async ()=>{
    try{
      await saveCompra(id, container);
      drawer.style.display='none'; drawer.dataset.id='';
      await reloadAndRender(container);
      showToast('Orden guardada');
    }catch(e){ showToast('Error guardando: '+(e.message||e), true); }
  });

  drawer.querySelector('#deleteCompra').addEventListener('click', async ()=>{
    if (!id) return showToast('No hay orden para eliminar', true);
    if (!await showConfirm('Eliminar orden?')) return;
    try{
      await deleteDoc(doc(db, 'compras', id));
      drawer.style.display='none'; drawer.dataset.id='';
      await reloadAndRender(container);
      showToast('Orden eliminada');
    }catch(e){ showToast('Error eliminando: '+(e.message||e), true); }
  });
}

function showToast(msg, isError){
  let t = document.getElementById('dc-toast');
  if (!t){
    t = document.createElement('div'); t.id = 'dc-toast';
    t.style.position = 'fixed'; t.style.right = '18px'; t.style.bottom = '18px'; t.style.padding = '10px 14px'; t.style.borderRadius = '8px'; t.style.background = 'rgba(30,30,40,.95)'; t.style.color = '#fff'; t.style.boxShadow = '0 6px 24px rgba(0,0,0,.5)'; t.style.zIndex = 9999; document.body.appendChild(t);
  }
  t.textContent = msg; t.style.background = isError ? 'rgba(170,40,40,.95)' : 'rgba(30,30,40,.95)';
  t.style.opacity = '1';
  clearTimeout(t._hideTimeout);
  t._hideTimeout = setTimeout(()=>{ t.style.opacity = '0'; }, 3200);
}

// simple modal confirm that matches the app styles
function showConfirm(msg){
  return new Promise((resolve)=>{
    const id = 'dc-confirm';
    let m = document.getElementById(id);
    if (m) m.remove();
    m = document.createElement('div'); m.id = id;
    m.style.position = 'fixed'; m.style.left = '0'; m.style.top = '0'; m.style.right = '0'; m.style.bottom = '0'; m.style.display = 'flex'; m.style.alignItems = 'center'; m.style.justifyContent = 'center'; m.style.background = 'rgba(0,0,0,.45)'; m.style.zIndex = 10000;
    m.innerHTML = `<div style="background: linear-gradient(180deg, rgba(18,22,34,.95), rgba(16,18,28,.95)); padding:18px; border-radius:12px; border:1px solid rgba(255,255,255,.06); min-width:320px; color:#eef0ff;">
      <div style="margin-bottom:12px;">${escapeHtml(msg)}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="dc-confirm-cancel" class="dc-btn dc-btn-ghost">Cancelar</button>
        <button id="dc-confirm-ok" class="dc-btn">Confirmar</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#dc-confirm-cancel').addEventListener('click', ()=>{ m.remove(); resolve(false); });
    m.querySelector('#dc-confirm-ok').addEventListener('click', ()=>{ m.remove(); resolve(true); });
  });
}

function initDrawerResizer(node){
  if (!node) return;
  const minW = 420, maxW = 920;
  node.style.display = window.innerWidth > 1100 ? 'block' : 'none';
  node.addEventListener('pointerdown', (ev)=>{
    ev.preventDefault();
    const startX = ev.clientX;
    const startW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--drawerW')||520,10);
    function onMove(e){
      const dx = startX - e.clientX;
      let nw = startW + dx;
      nw = Math.max(minW, Math.min(maxW, nw));
      document.documentElement.style.setProperty('--drawerW', nw + 'px');
    }
    function onUp(){ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); localStorage.setItem('dc_drawer_w', getComputedStyle(document.documentElement).getPropertyValue('--drawerW')); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  // initialize from previous
  const prev = localStorage.getItem('dc_drawer_w'); if (prev) document.documentElement.style.setProperty('--drawerW', prev);
  window.addEventListener('resize', ()=>{ node.style.display = window.innerWidth > 1100 ? 'block' : 'none'; });
}

async function saveCompra(editId, container){
  const drawer = container.querySelector('#comprasDrawer');
  const nombre = normalize(drawer.querySelector('#c_nombre').value);
  if (!nombre) throw new Error('Nombre es requerido');
  const cantidad = Number(drawer.querySelector('#c_cantidad').value||0);
  if (!cantidad) throw new Error('Cantidad inválida');
  const costo_total = Number(drawer.querySelector('#c_costo_total').value||0);
  const estado = drawer.querySelector('#c_estado').value || 'EN_TRANSITO';
  const costo_unitario = costo_total > 0 ? (costo_total / Math.max(1, cantidad)) : 0;

  // require tracking number as primary key
  const n_rastreo = (drawer.querySelector('#c_n_rastreo').value || '').toString().trim();
  if (!n_rastreo) throw new Error('N rastreo es requerido y debe ser único');

  // ensure the product was selected from inventory
  let productId = (drawer.querySelector('#c_productId')?.value || '').toString().trim();
  if (!productId){
    // try to match exact by name as fallback
    const q = query(collection(db, 'productos'), where('nombre','==', nombre));
    const ps = await getDocs(q);
    if (!ps.empty) productId = ps.docs[0].id;
  }
  if (!productId) throw new Error('Selecciona un producto existente del inventario');

  const compraId = n_rastreo;

  // if editing, preserve cantidad_recibida and compute delta for transito
  let cantidad_recibida = 0;
  let oldCantidad = 0; let oldEstado = null; let oldProductId = null;
  if (editId){
    const old = await getDoc(doc(db,'compras', editId));
    if (old.exists()){ const od = old.data(); cantidad_recibida = od.cantidad_recibida || 0; oldCantidad = n(od.cantidad); oldEstado = od.estado || null; oldProductId = od.productId || null; }
  }

  // ensure uniqueness of n_rastreo if creating new or changing id
  const existing = await getDoc(doc(db,'compras', compraId));
  if (existing.exists() && (!editId || editId !== compraId)){
    throw new Error('Ya existe una orden con ese N RASTREO');
  }

  // obtain product external_key from productos doc
  let prodExternalKey = '';
  try{
    const pSnap = await getDoc(doc(db, 'productos', productId));
    if (pSnap.exists()) prodExternalKey = pSnap.data().external_key || `${pSnap.data().nombre || nombre}|${pSnap.data().condicion || ''}`;
  }catch(e){ console.warn('Error fetching product for external key', e); }

  const payload = {
    productId, nombre, estado, cantidad, cantidad_recibida,
    costo_total: costo_total || 0, costo_unitario, costo_transporte: 0, proveedor: drawer.querySelector('#c_proveedor').value||'',
    n_rastreo, categoria: drawer.querySelector('#c_categoria').value||'',
    fecha_compra: serverTimestamp(), updated_at: serverTimestamp(), external_key: prodExternalKey || `${nombre}|${estado}`
  };

  // Write the compra
  if (editId && editId !== compraId){
    await setDoc(doc(db,'compras', compraId), payload);
    await deleteDoc(doc(db,'compras', editId));
  } else {
    await setDoc(doc(db,'compras', compraId), payload);
  }

  // update product.stock_transito: for new or edits where estado is EN_TRANSITO
  try{
    await runTransaction(db, async (tx)=>{
      // if editing and product changed, adjust both products' transito fields
      if (editId && oldProductId && oldProductId !== productId){
        const oldPref = doc(db,'productos', oldProductId);
        const oldSnap = await tx.get(oldPref);
        if (oldSnap.exists() && oldEstado === 'EN_TRANSITO'){
          const oldP = oldSnap.data();
          const oldTrans = n(oldP.stock_transito || 0);
          tx.update(oldPref, { stock_transito: Math.max(0, oldTrans - Math.round(oldCantidad)), updated_at: serverTimestamp() });
        }
        const newPref = doc(db,'productos', productId);
        const newSnap = await tx.get(newPref);
        if (newSnap.exists() && estado === 'EN_TRANSITO'){
          const newP = newSnap.data();
          const newTrans = n(newP.stock_transito || 0);
          tx.update(newPref, { stock_transito: Math.max(0, newTrans + Math.round(cantidad)), updated_at: serverTimestamp() });
        }
        return;
      }

      // otherwise operate on single product
      const pref = doc(db,'productos', productId);
      const psnap = await tx.get(pref);
      if (!psnap.exists()) return;
      const pdata = psnap.data();
      const oldTrans = n(pdata.stock_transito || 0);
      let delta = 0;
      if (!editId){
        // new order: add cantidad if estado is EN_TRANSITO
        if (estado === 'EN_TRANSITO') delta = cantidad;
      } else {
        // editing: if both old and new are EN_TRANSITO, add difference
        if (oldEstado === 'EN_TRANSITO' && estado === 'EN_TRANSITO') delta = cantidad - oldCantidad;
        // if previously EN_TRANSITO and now not, subtract oldCantidad
        else if (oldEstado === 'EN_TRANSITO' && estado !== 'EN_TRANSITO') delta = -oldCantidad;
        // if previously not EN_TRANSITO and now is, add cantidad
        else if (oldEstado !== 'EN_TRANSITO' && estado === 'EN_TRANSITO') delta = cantidad;
      }
      if (delta !== 0){
        const newTrans = Math.max(0, oldTrans + Math.round(delta));
        tx.update(pref, { stock_transito: newTrans, updated_at: serverTimestamp() });
      }
    });
  }catch(e){ console.warn('Error updating product transito:', e); }

}

async function receivePurchase(compraId, qtyRequested, transporte){
  transporte = Number(transporte || 0);
  // pre-fetch compra so we can resolve productId by external_key if needed
  const compraSnap = await getDoc(doc(db, 'compras', compraId));
  if (!compraSnap.exists()) throw new Error('Orden no encontrada');
  const compraPreview = compraSnap.data();

  // try to get or infer productId: prefer compra.productId, otherwise search by external_key
  let productId = compraPreview.productId || '';
  if (productId){
    const check = await getDoc(doc(db, 'productos', productId));
    if (!check.exists()) productId = '';
  }
  if (!productId && compraPreview.external_key){
    const q = query(collection(db, 'productos'), where('external_key', '==', compraPreview.external_key));
    const ps = await getDocs(q);
    if (!ps.empty) productId = ps.docs[0].id;
  }

  if (!productId) throw new Error('Producto vinculado no encontrado en Inventario. Crea el producto en Inventario y vuelve a intentar.');

  // proceed with transaction using resolved productId
  return runTransaction(db, async (tx)=>{
    const pRef = doc(db, 'compras', compraId);
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists()) throw new Error('Orden no encontrada');
    const compra = pSnap.data();

    const remaining = n(compra.cantidad) - n(compra.cantidad_recibida || 0);
    if (remaining <= 0) throw new Error('Ya recibida por completo');
    const toApply = Math.min(remaining, qtyRequested);

    const prodRef = doc(db, 'productos', productId);
    const prodSnap = await tx.get(prodRef);

    if (!prodSnap.exists()){
      // this should not happen because we resolved productId before, but guard anyway
      throw new Error('Producto vinculado no encontrado en Inventario (transacción)');
    }

    const prodData = prodSnap.data();
    const oldStock = n(prodData.stock);
    const oldCosto = n(prodData.costo_prom || 0);

    // per-unit base cost from order
    const perUnitBase = n(compra.costo_total || 0) / Math.max(1, n(compra.cantidad));
    // received unit cost = perUnitBase + (transporte / toApply)
    const receivedUnitCost = perUnitBase + (transporte / Math.max(1, toApply));

    const newCostoProm = computeNewCostoProm(oldStock, oldCosto, toApply, receivedUnitCost);
    const newStock = oldStock + toApply;

    // update product stock, costo_prom and decrement stock_transito by applied amount if present
    const oldTransito = n(prodData.stock_transito || 0);
    const newTransito = Math.max(0, oldTransito - toApply);

    tx.update(prodRef, { stock: newStock, costo_prom: newCostoProm, stock_transito: newTransito, updated_at: serverTimestamp() });

    const newCantidadRecibida = n(compra.cantidad_recibida) + toApply;
    const updateCompra = { cantidad_recibida: newCantidadRecibida, updated_at: serverTimestamp(), last_costo_transporte: transporte, costo_transporte_total: n(compra.costo_transporte_total||0) + transporte };
    if (newCantidadRecibida >= n(compra.cantidad)){
      updateCompra.estado = 'RECIBIDO';
      updateCompra.fecha_recibido = serverTimestamp();
    }
    // ensure purchase keeps a reference to productId (in case it was inferred)
    if (!compra.productId) updateCompra.productId = productId;

    tx.update(pRef, updateCompra);

    return { applied: toApply, remaining: remaining - toApply, newCantidadRecibida };
  });
}

export { mountComprasRecepcion };

export async function mountComprasSeguimiento(container){
  // very similar to recepcion; reuse the same view for now
  return mountComprasRecepcion(container);
}
