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
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
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
  _styleObserver: null, // referencia al MutationObserver para cleanup
};

// Constantes para selects
const V_ESTADO_VENTA = ["PEDIDO PROGRAMADO","VENTA FINALIZADA","CANCELADO POR CLIENTE","DEVOLUCION"];
const V_PROV_ENVIO   = ["FLASH BOX","LOS 44 EXPRESS","OTRO","RETIRO EN LOCAL"];
const V_LIQ          = ["SI","NO"];
const V_RECAUDO      = ["EFECTIVO","PAYPAL","TRANSFERENCIA","CHIVO WALLET","WOMPY TC","OTRO"];

// Funciones utilitarias
function n(v){ return Number(v || 0); }
function money(v){ return n(v).toFixed(2); }
function norm(s){ return (s||"").toString().trim().toUpperCase(); }
function normalize(s){ return (s||"").toString().trim().toUpperCase(); }
function todayISO(){
  const d = new Date();
  const pad = (x)=> String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
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
          <button id="vBtnRefrescar" class="dc-btn dc-btn-ghost">Refrescar</button>
        </div>
      </div>

      <div style="margin-top:12px;" class="dc-table-wrap">
        <table class="dc-table">
          <thead>
            <tr>
              <th>Foto</th>
              <th>FECHA</th>
              <th>PRODUCTO</th>
              <th>CLIENTE</th>
              <th>TEL</th>
              <th>ESTADO</th>
              <th style="text-align:right;">TOTAL</th>
              <th style="text-align:right;">ENVÍO</th>
              <th style="text-align:right;">PRODUCTO</th>
              <th style="text-align:right;">COSTO</th>
              <th style="text-align:right;">GANANCIA</th>
              <th>LIQ.</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody id="vTbody"></tbody>
        </table>
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
  return `
    <tr class="dc-row" data-id="${v.id}">
      <td>${img}</td>
      <td>${v.fecha || ""}</td>
      <td title="${v.producto_key || ""}">${v.producto_key || ""}</td>
      <td>${v.cliente || ""}</td>
      <td>${v.telefono || ""}</td>
      <td>${v.estado_venta || ""}</td>
      <td style="text-align:right;">$${money(v.total_pago_cliente)}</td>
      <td style="text-align:right;">$${money(v.precio_envio)}</td>
      <td style="text-align:right;">$${money(v.precio_producto)}</td>
      <td style="text-align:right;">$${money(v.costo_producto)}</td>
      <td style="text-align:right;">$${money(v.ganancia)}</td>
      <td>${v.estado_liquidacion || ""}</td>
      <td>
        <button class="dc-btn dc-btn-ghost vEditBtn" data-id="${v.id}">Editar</button>
        <button class="dc-btn dc-danger vDelBtn" data-id="${v.id}">Eliminar</button>
      </td>
    </tr>
  `;
}

function renderTable(){
  const tbody = $("#vTbody");
  if(!tbody) return;
  tbody.innerHTML = ventasState.filtered.map(rowHTML).join("");

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
  tbody.querySelectorAll(".vEditBtn").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      e.stopPropagation();
      openEdit(btn.dataset.id);
    });
  });
  tbody.querySelectorAll(".vDelBtn").forEach(btn=>{
    btn.addEventListener("click", async (e)=>{
      e.stopPropagation();
      await deleteVenta(btn.dataset.id);
    });
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
        <input id="vPrecioEnvio" type="text" class="dc-input" value="${data.precio_envio ? '$' + money(data.precio_envio) : ""}" ${dis}/>
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
    </div>

    <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end;">
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
function applyFilters(){
  const q = norm($("#vSearch")?.value);
  const estado = $("#vEstadoVenta")?.value || "";
  const liq = $("#vLiquidacion")?.value || "";

  ventasState.filtered = ventasState.ventas.filter(v=>{
    const blob = norm([
      v.producto_key, v.cliente, v.telefono, v.estado_venta, v.origen_venta, v.nombre_campana
    ].join(" "));
    const okQ = !q || blob.includes(q);
    const okE = !estado || v.estado_venta === estado;
    const okL = !liq || v.estado_liquidacion === liq;
    return okQ && okE && okL;
  });

  renderTable();
}

function bindHeaderEvents(){
  $("#vSearch")?.addEventListener("input", applyFilters);
  $("#vEstadoVenta")?.addEventListener("change", applyFilters);
  $("#vLiquidacion")?.addEventListener("change", applyFilters);

  $("#vBtnNuevo")?.addEventListener("click", ()=>{
    ventasState.mode = "new";
    ventasState.selectedId = null;
    renderDrawer({
      fecha: todayISO(),
      estado_venta: "PEDIDO PROGRAMADO",
      estado_liquidacion: "NO",
      tipo_recaudo: "EFECTIVO",
      proveedor_envio: "FLASH BOX",
      precio_envio: 0,
      total_pago_cliente: 0,
      gasto_publicidad: 0
    });
  });

  $("#vBtnRefrescar")?.addEventListener("click", async ()=>{
    await ventasLoadAll();
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
      estado_venta: "PEDIDO PROGRAMADO",
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
  $("#vPrecioEnvio")?.addEventListener("input", recalcVentaFields);

  $("#vGuardar")?.addEventListener("click", saveVenta);
  $("#vCancelar")?.addEventListener("click", ()=>{
    ventasState.mode = "details";
    const v = ventasState.selectedId ? ventasState.ventas.find(x=>x.id===ventasState.selectedId) : null;
    renderDrawer(v || {});
  });
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

    renderTable();

    // Mostrar drawer vacío o detalle
    if(!ventasState.selectedId){
      ventasState.mode = "details";
      renderDrawer({
        fecha: todayISO(),
        estado_venta: "PEDIDO PROGRAMADO",
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
  bindHeaderEvents();
  await ventasLoadAll();

  // Asegurar que las etiquetas del drawer conserven estilos incluso si
  // otros módulos o reglas CSS intentan sobrescribirlos en runtime.
  const vDrawer = document.getElementById('vDrawer');
  if(vDrawer){
    // Estilos controlados por CSS central; no observar cambios para forzar inline.
    if(ventasState._styleObserver){
      try { ventasState._styleObserver.disconnect(); } catch(e){}
      ventasState._styleObserver = null;
    }
  }
}



