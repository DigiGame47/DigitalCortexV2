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
function norm(s){ return (s ?? "").toString().trim().toUpperCase(); }
function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ===========================
   NOTIFICACIONES TOAST
   ========================= */
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast-notification ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/* ===========================
   UI: ESTILOS
   ========================= */
function ensureVentasStyles(){
  if ($("#dc-ventas-styles")) return;

  const s = document.createElement("style");
  s.id = "dc-ventas-styles";
  s.textContent = `
    /* Inputs / Buttons */
    .dc-input{ padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.03); color: rgba(238,240,255,.95); outline:none; font-size: 13px; }
    .dc-input::placeholder{ color: rgba(238,240,255,.45); }
    .dc-input:disabled{ opacity: 0.6; cursor: not-allowed; }

    .dc-btn{ padding:10px 14px; border-radius:12px; border:1px solid rgba(79,111,255,.25);
      background: rgba(79,111,255,.18); color:#fff; cursor:pointer; font-weight:800; font-size: 13px; }
    .dc-btn:hover:not(:disabled){ background: rgba(79,111,255,.25); }
    .dc-btn:disabled{ opacity: 0.5; cursor: not-allowed; }
    .dc-btn-ghost{ background: rgba(255,255,255,.03); border-color: rgba(255,255,255,.10); }
    .dc-btn-ghost:hover{ background: rgba(255,255,255,.06); }
    .dc-danger{ border-color: rgba(255,120,120,.30); background: rgba(255,120,120,.18); }
    .dc-danger:hover{ background: rgba(255,120,120,.25); }

    select.dc-input{
      -webkit-appearance:none; -moz-appearance:none; appearance:none;
      padding-right: 38px;
      cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M7 10l5 5 5-5' stroke='rgba(238,240,255,0.75)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat:no-repeat;
      background-position:right 12px center;
      background-size:18px 18px;
    }
    select.dc-input option{ background:#0f1424; color:#eef0ff; }

    /* Grid Layout - Sin espacio en blanco a la derecha */
    .inv-grid{
      display:grid;
      grid-template-columns: 1fr auto;
      gap: 14px;
      align-items:start;
    }

    /* Card */
    .card{
      border-radius: 16px;
      border:1px solid rgba(255,255,255,.10);
      background: rgba(19,26,42,.70);
    }

    /* Drawer - Ajustado sin resizer */
    .inv-drawer{
      border-radius: 16px;
      border:1px solid rgba(255,255,255,.10);
      background: rgba(19,26,42,.70);
      padding: 14px;
      position: sticky;
      top: 12px;
      width: clamp(360px, 35vw, 600px);
      min-width: 360px;
      height: 100%;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
    }

    /* Table */
    .dc-table-wrap{ overflow:auto; border-radius:14px; border:1px solid rgba(255,255,255,.08); }
    .dc-table{
      width:100%;
      border-collapse:separate;
      border-spacing:0;
      font-size: 12px;
    }
    .dc-table th, .dc-table td{ padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); white-space:nowrap; }
    .dc-table th{ position:sticky; top:0; background: rgba(15,20,36,.92); z-index:1; text-align:left; font-weight: 800; }
    .dc-row{ cursor:pointer; }
    .dc-row:hover{ background: rgba(255,255,255,.04); }
    .dc-row.selected{ background: rgba(79,111,255,.12); outline: 1px solid rgba(79,111,255,.25); }

    /* Labels & Forms - VENTAS ESPECÍFICO */
        /* Labels & Forms - VENTAS ESPECÍFICO */
    #vDrawer {
      --ventas-label-color: rgba(238,240,255,.85);
      --ventas-label-size: 13px;
      color: rgba(238,240,255,.90);
    }
    
    #vDrawer label.dc-label,
    #vDrawer .dc-label{ 
      display: block !important;
      font-size: var(--ventas-label-size) !important; 
      color: var(--ventas-label-color) !important;
      font-weight: 700 !important;
      letter-spacing: 0.3px !important;
      text-transform: uppercase !important;
      margin-bottom: 8px !important;
      padding: 0 !important;
      background: transparent !important;
      border: none !important;
      line-height: 1.4 !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: relative !important;
      z-index: 1 !important;
    }
    
    #vDrawer .dc-input{ 
      padding:10px 12px; 
      border-radius:12px; 
      border:1px solid rgba(255,255,255,.15);
      background: rgba(255,255,255,.04); 
      color: rgba(238,240,255,.95); 
      outline:none; 
      font-size: 13px; 
      width: 100%;
    }
    #vDrawer .dc-input::placeholder{ color: rgba(238,240,255,.55); }
    #vDrawer .dc-input:disabled{ opacity: 0.5; cursor: not-allowed; }

    #vDrawer .drawer-title{ 
      font-weight:900 !important; 
      letter-spacing:.3px; 
      margin:0; 
      font-size:16px !important; 
      color: rgba(238,240,255,.95) !important; 
    }
    #vDrawer .drawer-sub{ 
      font-size:12px; 
      color: rgba(238,240,255,.70); 
      margin-top:4px; 
      font-weight: 600;
    }

    /* Autocomplete Producto */
    .producto-autocomplete-wrapper{
      position: relative;
      width: 100%;
    }
    
    #vProductoInput{
      width: 100%;
    }
    
    .producto-suggestions{
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: rgba(15,20,36,.95);
      border: 1px solid rgba(79,111,255,.25);
      border-top: none;
      border-radius: 0 0 12px 12px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    }
    
    .producto-suggestions.visible{
      display: block;
    }
    
    .producto-suggestion-item{
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,.06);
      color: rgba(238,240,255,.85);
      font-size: 13px;
      transition: background 0.15s ease;
    }
    
    .producto-suggestion-item:hover,
    .producto-suggestion-item.active{
      background: rgba(79,111,255,.18);
    }
    
    .producto-suggestion-item:last-child{
      border-bottom: none;
    }
    
    .producto-suggestion-item strong{
      color: rgba(238,240,255,.95);
      font-weight: 700;
    }

    /* Notificación Toast */
    .toast-notification{
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(79, 111, 255, 0.95);
      color: #fff;
      padding: 14px 18px;
      border-radius: 12px;
      border: 1px solid rgba(79, 111, 255, 0.5);
      font-size: 13px;
      font-weight: 600;
      z-index: 9999;
      animation: slideInRight 0.3s ease-out, slideOutRight 0.3s ease-out 3.7s forwards;
      box-shadow: 0 8px 24px rgba(79, 111, 255, 0.3);
    }
    .toast-notification.error{
      background: rgba(255, 120, 120, 0.95);
      border-color: rgba(255, 120, 120, 0.5);
      box-shadow: 0 8px 24px rgba(255, 120, 120, 0.3);
    }
    .toast-notification.success{
      background: rgba(120, 200, 120, 0.95);
      border-color: rgba(120, 200, 120, 0.5);
      box-shadow: 0 8px 24px rgba(120, 200, 120, 0.3);
    }

    @keyframes slideInRight{
      from{
        transform: translateX(400px);
        opacity: 0;
      }
      to{
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOutRight{
      from{
        transform: translateX(0);
        opacity: 1;
      }
      to{
        transform: translateX(400px);
        opacity: 0;
      }
    }

    /* Responsive */
    @media (max-width: 1200px){
      .inv-drawer{ width: clamp(320px, 30vw, 500px); }
    }
    @media (max-width: 1000px){
      .inv-grid{ grid-template-columns: 1fr; }
      .inv-drawer{
        position:relative;
        top:auto;
        right:auto;
        height:auto;
        width:100%;
        min-width: unset;
      }
    }

/* ✅ FIX SOLO VENTAS: evita 3ra columna sin afectar compras/inventario */
.ventas-root .inv-grid{
  grid-template-columns: minmax(0, 1fr) clamp(360px, 35vw, 600px) !important;
  height: 100%;
  min-width: 0;
}

/* Evita overflow horizontal residual en este módulo */
.ventas-root{ min-width: 0; width: 100%; overflow-x: hidden; }


/* ✅ Ajuste final SOLO VENTAS: quita “aire” derecho e inferior */
.ventas-root{
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

.ventas-root .inv-grid{
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

/* importante para que el grid no “se pase” y genere scroll/espacios */
.ventas-root .inv-grid > *{
  min-width: 0;
}

/* opcional: si tu contenedor principal tiene padding, compensamos */
body.page-ventas .content,
body.page-ventas main{
  width: 100%;
  max-width: none;
}

/* 🚀 SOLUCIÓN RÁPIDA - Agregar al final de ensureVentasStyles() */

/* FIX: Eliminar espacio en blanco derecho/inferior */
.ventas-root{
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.ventas-root .inv-grid{
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(360px, 35vw, 600px);
  gap: 14px;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.ventas-root .inv-drawer{
  max-width: 600px;
  overflow-x: hidden;
  box-sizing: border-box;
  height: fit-content;
  max-height: calc(100vh - 24px);
}

.ventas-root .card{
  box-sizing: border-box;
  max-width: 100%;
}

/* Prevenir scroll horizontal global */
body.page-ventas{
  overflow-x: hidden;
}


  `;
  document.head.appendChild(s);
}

/* ===========================
   TEMPLATE
   ========================= */
function ventasTemplate(){
  return `
  <div class="ventas-root">
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

      <aside class="inv-drawer" id="vDrawer">
        <div id="vDrawerInner"></div>
      </aside>
    </div>
  </div>
  `;
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
  
  // Aplicar estilos inline a todas las etiquetas como respaldo
  setTimeout(() => {
    const labels = Array.from(updatedInner.querySelectorAll("label.dc-label"));
    labels.forEach(label => {
      try{
        const replacement = document.createElement('div');
        replacement.className = label.className;
        replacement.innerHTML = label.innerHTML;
        for(const attr of Array.from(label.attributes)){
          if(attr.name.startsWith('data-')) replacement.setAttribute(attr.name, attr.value);
        }
        label.parentNode.replaceChild(replacement, label);
        replacement.style.setProperty('display', 'block', 'important');
        replacement.style.setProperty('font-size', '13px', 'important');
        replacement.style.setProperty('color', '#ffffff', 'important');
        replacement.style.setProperty('font-weight', '700', 'important');
        replacement.style.setProperty('letter-spacing', '0.3px', 'important');
        replacement.style.setProperty('text-transform', 'uppercase', 'important');
        replacement.style.setProperty('margin-bottom', '8px', 'important');
        replacement.style.setProperty('padding', '0', 'important');
        replacement.style.setProperty('background', 'transparent', 'important');
        replacement.style.setProperty('border', 'none', 'important');
        replacement.style.setProperty('line-height', '1.4', 'important');
        replacement.style.setProperty('visibility', 'visible', 'important');
        replacement.style.setProperty('opacity', '1', 'important');
      }catch(e){
        console.warn('replace label failed', e);
      }
    });
  }, 0);
  
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

  // Aplicar estilos
  ensureVentasStyles();

  // ✅ FIX extra: forzar que el grid ocupe el ancho completo del contenedor
  // (evita “huecos” si el padre trae reglas raras de otro módulo)
  // Esto NO cambia tu UI, solo asegura el layout al volver.
  const oldStyle = document.getElementById("dc-ventas-layout-fix");
  if(!oldStyle){
    const st = document.createElement("style");
    st.id = "dc-ventas-layout-fix";
    st.textContent = `
      body.page-ventas .inv-grid{ width:100%; max-width:100%; }
      body.page-ventas .card{ width:100%; max-width:100%; }
    `;
    document.head.appendChild(st);
  }

  container.innerHTML = ventasTemplate();
  bindHeaderEvents();
  await ventasLoadAll();

  // Asegurar que las etiquetas del drawer conserven estilos incluso si
  // otros módulos o reglas CSS intentan sobrescribirlos en runtime.
  const vDrawer = document.getElementById('vDrawer');
  if(vDrawer){
    const applyForcedStyles = () => {
      const elems = vDrawer.querySelectorAll('.dc-label');
      elems.forEach(el=>{
        try{
          el.style.setProperty('color', '#3f3f3f73', 'important');
          el.style.setProperty('font-weight', '700', 'important');
          el.style.setProperty('font-size', '13px', 'important');
          el.style.setProperty('letter-spacing', '0.3px', 'important');
          el.style.setProperty('text-transform', 'uppercase', 'important');
          el.style.setProperty('margin-bottom', '8px', 'important');
          el.style.setProperty('padding', '0', 'important');
          el.style.setProperty('background', 'transparent', 'important');
          el.style.setProperty('border', 'none', 'important');
        }catch(e){/* ignore */}
      });
    };

    applyForcedStyles();

    if(ventasState._styleObserver){
      ventasState._styleObserver.disconnect();
    }

    const mo = new MutationObserver(()=>{ applyForcedStyles(); });
    mo.observe(vDrawer, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    ventasState._styleObserver = mo;
  }
}



