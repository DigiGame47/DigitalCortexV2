import { db, auth } from "./firebase.js";
import { collection, query, where, getDocs, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const liquidacionesState = {
  ventas: [],
  agrupadoPorFecha: {},
  selectedVentaId: null,
  editingId: null,
  filtroProveedor: '',
  filtroFecha: ''
};

const columnasVisibles = ['producto', 'cliente', 'fecha', 'proveedor_envio', 'precio_envio', 'precio_producto', 'total_pago_cliente', 'estado_liquidacion'];

function liquidacionesTemplate(){
  return `
    <div class="liquidaciones-root" style="width:100%;height:100%;display:flex;flex-direction:column;">
      <div style="padding:14px;height:100%;display:flex;flex-direction:column;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h2 style="margin:0;font-size:18px;font-weight:600;">Liquidaciones Pendientes</h2>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
          <select id="lFiltroProveedor" class="dc-input" style="flex:1;min-width:200px;">
            <option value="">🚚 Todos los Proveedores</option>
          </select>
          
          <select id="lFiltroFecha" class="dc-input" style="flex:1;min-width:200px;">
            <option value="">📅 Todas las Fechas</option>
          </select>
          
          <button id="lBtnLiquidarTodo" class="dc-btn" style="padding:8px 16px;">
            ✅ Liquidar Seleccionados
          </button>
        </div>

        <div id="lViewContainer" style="flex:1;overflow-y:auto;min-height:0;width:100%;">
          <!-- Content rendered here -->
        </div>
      </div>
    </div>
  `;
}

async function cargarVentasPendientes(){
  try {
    const ventasRef = collection(db, 'VENTAS');
    // Filtrar donde estado_liquidacion = 'NO' Y estado_venta = 'VENTA FINALIZADA'
    const q = query(ventasRef, 
      where('estado_liquidacion', '==', 'NO'),
      where('estado_venta', '==', 'VENTA FINALIZADA')
    );
    const snap = await getDocs(q);
    
    liquidacionesState.ventas = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    agruparDatos();
    renderizarVista();
  } catch(err){
    console.error('Error cargando ventas pendientes:', err);
    alert('Error cargando datos: ' + err.message);
  }
}

function agruparDatos(){
  liquidacionesState.agrupadoPorFecha = {};

  liquidacionesState.ventas.forEach(v => {
    const fecha = v.fecha || 'Sin fecha';
    
    if(!liquidacionesState.agrupadoPorFecha[fecha]) {
      liquidacionesState.agrupadoPorFecha[fecha] = {};
    }
    
    const proveedor = v.proveedor_envio || 'Sin proveedor';
    if(!liquidacionesState.agrupadoPorFecha[fecha][proveedor]) {
      liquidacionesState.agrupadoPorFecha[fecha][proveedor] = [];
    }
    
    liquidacionesState.agrupadoPorFecha[fecha][proveedor].push(v);
  });
}

function renderizarVista(){
  const container = document.getElementById('lViewContainer');
  if(!container) return;
  
  // Llenar combos si es primera vez
  llenarCombosFiltro();
  
  // Aplicar filtros
  renderizarPorFechaConFiltros(container);
}

function llenarCombosFiltro(){
  const selectProveedor = document.getElementById('lFiltroProveedor');
  const selectFecha = document.getElementById('lFiltroFecha');
  
  if(!selectProveedor || !selectFecha) return;
  
  // Recolectar proveedores únicos
  const proveedoresSet = new Set();
  const fechasSet = new Set();
  
  liquidacionesState.ventas.forEach(v => {
    proveedoresSet.add(v.proveedor_envio || 'Sin proveedor');
    fechasSet.add(v.fecha || 'Sin fecha');
  });
  
  // Llenar combobox de proveedores
  const proveedoresOptions = selectProveedor.innerHTML.split('\n')[0]; // Guardar opción "Todos"
  selectProveedor.innerHTML = '<option value="">🚚 Todos los Proveedores</option>';
  [...proveedoresSet].sort().forEach(p => {
    selectProveedor.innerHTML += `<option value="${p}">${p}</option>`;
  });
  
  // Llenar combobox de fechas
  selectFecha.innerHTML = '<option value="">📅 Todas las Fechas</option>';
  [...fechasSet].sort().reverse().forEach(f => {
    selectFecha.innerHTML += `<option value="${f}">${f}</option>`;
  });
}

function renderizarPorFechaConFiltros(container){
  const fechas = Object.keys(liquidacionesState.agrupadoPorFecha).sort().reverse();
  
  let html = '';
  let totalGeneral = 0;

  fechas.forEach(fecha => {
    // Aplicar filtro de fecha
    if(liquidacionesState.filtroFecha && liquidacionesState.filtroFecha !== fecha) return;
    
    const proveedoresPorFecha = liquidacionesState.agrupadoPorFecha[fecha];
    let totalFecha = 0;
    
    // Contar solo los que pasan el filtro de proveedor
    Object.keys(proveedoresPorFecha).forEach(proveedor => {
      if(liquidacionesState.filtroProveedor && liquidacionesState.filtroProveedor !== proveedor) return;
      totalFecha += proveedoresPorFecha[proveedor].reduce((sum, v) => sum + (parseFloat(v.precio_producto) || 0), 0);
    });
    
    if(totalFecha === 0) return; // Saltar si no hay items después del filtro
    
    totalGeneral += totalFecha;

    html += `
      <div style="margin:0;border:1px solid #e0e0e0;border-radius:0;overflow:hidden;background:#ffffff;margin-bottom:20px;width:100%;">
        <div style="background:#f5f5f5;padding:14px;font-weight:600;font-size:15px;border-bottom:1px solid #e0e0e0;">
          📅 ${fecha} - <span style="color:#667eea;">$${money(totalFecha)}</span>
        </div>
    `;

    // Por cada proveedor en esta fecha
    Object.keys(proveedoresPorFecha).forEach(proveedor => {
      // Aplicar filtro de proveedor
      if(liquidacionesState.filtroProveedor && liquidacionesState.filtroProveedor !== proveedor) return;
      
      const ventasProveedor = proveedoresPorFecha[proveedor];
      const totalProveedor = ventasProveedor.reduce((sum, v) => sum + (parseFloat(v.precio_producto) || 0), 0);

      html += `
        <div style="padding:14px;border-bottom:1px solid #f0f0f0;background:#fafafa;">
          <div style="font-weight:600;font-size:14px;color:#1a1a1a;margin-bottom:10px;">
            🚚 ${proveedor} - <span style="color:#667eea;">$${money(totalProveedor)}</span>
          </div>
          
          <div style="overflow-x:auto;width:100%;">
            <table class="dc-table" style="margin:0;width:100%;font-size:12px;">
              <thead>
                <tr style="background:#ffffff;border-bottom:2px solid #e0e0e0;">
                  <th style="text-align:left;padding:12px;font-size:12px;font-weight:600;">PRODUCTO</th>
                  <th style="text-align:left;padding:12px;font-size:12px;font-weight:600;">CLIENTE</th>
                  <th style="text-align:right;padding:12px;font-size:12px;font-weight:600;">ENVÍO</th>
                  <th style="text-align:right;padding:12px;font-size:12px;font-weight:600;">PRECIO</th>
                  <th style="text-align:right;padding:12px;font-size:12px;font-weight:600;">TOTAL VENTA</th>
                  <th style="text-align:center;padding:12px;font-size:12px;font-weight:600;">ESTADO</th>
                  <th style="text-align:center;padding:12px;font-size:12px;font-weight:600;">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                ${ventasProveedor.map(v => `
                  <tr style="border-bottom:1px solid #f0f0f0;">
                    <td style="padding:12px;font-size:12px;">${v.producto_key || '-'}</td>
                    <td style="padding:12px;font-size:12px;">${v.cliente || '-'}</td>
                    <td style="text-align:right;padding:12px;font-size:12px;">$${money(v.precio_envio || 0)}</td>
                    <td style="text-align:right;padding:12px;font-size:12px;font-weight:600;color:#667eea;">$${money(v.precio_producto || 0)}</td>
                    <td style="text-align:right;padding:12px;font-size:12px;">$${money(v.total_pago_cliente || 0)}</td>
                    <td style="text-align:center;padding:12px;font-size:12px;">
                      <span style="background:#fff3cd;color:#856404;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;">
                        ${v.estado_liquidacion || 'NO'}
                      </span>
                    </td>
                    <td style="text-align:center;padding:12px;">
                      <button class="dc-btn dc-btn-ghost" onclick="window.LC.editarVenta('${v.id}')" style="padding:4px 8px;font-size:11px;">
                        ✏️ Editar
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    html += `
      <div style="background:#f9f9f9;padding:12px;text-align:right;font-size:13px;font-weight:600;border-top:1px solid #e0e0e0;">
        Subtotal fecha: <span style="color:#667eea;">$${money(totalFecha)}</span>
      </div>
    </div>
    `;
  });

  html += `
    <div style="background:#ffffff;padding:16px 14px;border:2px solid #667eea;border-radius:0;margin-top:20px;margin-bottom:0;margin-left:0;margin-right:0;text-align:right;width:100%;box-sizing:border-box;">
      <div style="font-size:16px;font-weight:600;">
        Total General a Liquidar: <span style="color:#667eea;font-size:18px;">$${money(totalGeneral)}</span>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function renderizarPorFecha(container){
  const fechas = Object.keys(liquidacionesState.agrupadoPorFecha).sort().reverse();
  
  let html = '';
  let totalGeneral = 0;

  fechas.forEach(fecha => {
    const proveedoresPorFecha = liquidacionesState.agrupadoPorFecha[fecha];
    const totalFecha = Object.values(proveedoresPorFecha)
      .flat()
      .reduce((sum, v) => sum + (parseFloat(v.precio_producto) || 0), 0);
    totalGeneral += totalFecha;

    html += `
    <div style="margin:0;border:1px solid #e0e0e0;border-radius:0;overflow:hidden;background:#ffffff;margin-bottom:20px;width:100%;">
        <div style="background:#f5f5f5;padding:14px;font-weight:600;font-size:15px;border-bottom:1px solid #e0e0e0;">
          📅 ${fecha} - <span style="color:#667eea;">$${money(totalFecha)}</span>
        </div>
    `;

    // Por cada proveedor en esta fecha
    Object.keys(proveedoresPorFecha).forEach(proveedor => {
      const ventasProveedor = proveedoresPorFecha[proveedor];
      const totalProveedor = ventasProveedor.reduce((sum, v) => sum + (parseFloat(v.precio_producto) || 0), 0);

      html += `
        <div style="padding:14px;border-bottom:1px solid #f0f0f0;background:#fafafa;">
          <div style="font-weight:600;font-size:14px;color:#1a1a1a;margin-bottom:10px;">
            🚚 ${proveedor} - <span style="color:#667eea;">$${money(totalProveedor)}</span>
          </div>
          
          <div style="overflow-x:auto;width:100%;">
            <table class="dc-table" style="margin:0;width:100%;font-size:12px;">
              <thead>
                <tr style="background:#ffffff;border-bottom:2px solid #e0e0e0;">
                  <th style="text-align:left;padding:12px;font-size:12px;font-weight:600;">PRODUCTO</th>
                  <th style="text-align:left;padding:12px;font-size:12px;font-weight:600;">CLIENTE</th>
                  <th style="text-align:right;padding:12px;font-size:12px;font-weight:600;">ENVÍO</th>
                  <th style="text-align:right;padding:12px;font-size:12px;font-weight:600;">PRECIO</th>
                  <th style="text-align:right;padding:12px;font-size:12px;font-weight:600;">TOTAL VENTA</th>
                  <th style="text-align:center;padding:12px;font-size:12px;font-weight:600;">ESTADO</th>
                  <th style="text-align:center;padding:12px;font-size:12px;font-weight:600;">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                ${ventasProveedor.map(v => `
                  <tr style="border-bottom:1px solid #f0f0f0;">
                    <td style="padding:12px;font-size:12px;">${v.producto_key || '-'}</td>
                    <td style="padding:12px;font-size:12px;">${v.cliente || '-'}</td>
                    <td style="text-align:right;padding:12px;font-size:12px;">$${money(v.precio_envio || 0)}</td>
                    <td style="text-align:right;padding:12px;font-size:12px;font-weight:600;color:#667eea;">$${money(v.precio_producto || 0)}</td>
                    <td style="text-align:right;padding:12px;font-size:12px;">$${money(v.total_pago_cliente || 0)}</td>
                    <td style="text-align:center;padding:12px;font-size:12px;">
                      <span style="background:#fff3cd;color:#856404;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;">
                        ${v.estado_liquidacion || 'NO'}
                      </span>
                    </td>
                    <td style="text-align:center;padding:12px;">
                      <button class="dc-btn dc-btn-ghost" onclick="window.LC.editarVenta('${v.id}')" style="padding:4px 8px;font-size:11px;">
                        ✏️ Editar
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    html += `
        <div style="background:#f9f9f9;padding:12px;text-align:right;font-size:13px;font-weight:600;border-top:1px solid #e0e0e0;">
        Subtotal fecha: <span style="color:#667eea;">$${money(totalFecha)}</span>
      </div>
    </div>
    `;
  });

  html += `
    <div style="background:#ffffff;padding:16px 14px;border:2px solid #667eea;border-radius:0;margin-top:20px;margin-bottom:0;margin-left:0;margin-right:0;text-align:right;width:100%;box-sizing:border-box;">
      <div style="font-size:16px;font-weight:600;">
        Total General a Liquidar: <span style="color:#667eea;font-size:18px;">$${money(totalGeneral)}</span>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function money(val){
  return (parseFloat(val) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function editarVenta(ventaId){
  const venta = liquidacionesState.ventas.find(v => v.id === ventaId);
  if(!venta) return;

  const modal = document.createElement('div');
  modal.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.5);
    display:flex;align-items:center;justify-content:center;
    z-index:1000;
  `;

  modal.innerHTML = `
    <div style="background:#ffffff;padding:24px;border-radius:8px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 16px 0;font-size:16px;font-weight:600;">Actualizar Liquidación</h3>
      
      <div style="margin-bottom:16px;">
        <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600;color:#1a1a1a;">
          Cliente: <strong>${venta.cliente}</strong>
        </label>
        <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600;color:#1a1a1a;">
          Producto: <strong>${venta.producto_key}</strong>
        </label>
        <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600;color:#1a1a1a;">
          Total: <strong>$${money(venta.total_pago_cliente)}</strong>
        </label>
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block;margin-bottom:8px;font-size:12px;font-weight:600;">Estado de Liquidación</label>
        <select id="lEstadoLiq" class="dc-input" style="width:100%;">
          <option value="NO" ${venta.estado_liquidacion === 'NO' ? 'selected' : ''}>NO</option>
          <option value="SI" ${venta.estado_liquidacion === 'SI' ? 'selected' : ''}>SI</option>
          <option value="PARCIAL" ${venta.estado_liquidacion === 'PARCIAL' ? 'selected' : ''}>PARCIAL</option>
        </select>
      </div>

      <div style="display:flex;gap:8px;">
        <button id="lBtnGuardar" class="dc-btn" style="flex:1;">💾 Guardar</button>
        <button id="lBtnCancelar" class="dc-btn dc-btn-ghost" style="flex:1;">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('lBtnGuardar').onclick = async () => {
    const nuevoEstado = document.getElementById('lEstadoLiq').value;
    try {
      const ventaRef = doc(db, 'VENTAS', ventaId);
      await updateDoc(ventaRef, { estado_liquidacion: nuevoEstado });
      
      // Actualizar local
      const ventaLocal = liquidacionesState.ventas.find(v => v.id === ventaId);
      if(ventaLocal) ventaLocal.estado_liquidacion = nuevoEstado;
      
      // Si cambió a SI, quitarlo de la vista
      if(nuevoEstado === 'SI'){
        liquidacionesState.ventas = liquidacionesState.ventas.filter(v => v.id !== ventaId);
      }
      
      agruparDatos();
      renderizarVista();
      modal.remove();
    } catch(err){
      alert('Error: ' + err.message);
    }
  };

  document.getElementById('lBtnCancelar').onclick = () => {
    modal.remove();
  };
}

async function liquidarTodo(){
  // Obtener ventas filtradas
  let ventasALiquidar = liquidacionesState.ventas;
  
  // Aplicar filtro de proveedor
  if(liquidacionesState.filtroProveedor){
    ventasALiquidar = ventasALiquidar.filter(v => v.proveedor_envio === liquidacionesState.filtroProveedor);
  }
  
  // Aplicar filtro de fecha
  if(liquidacionesState.filtroFecha){
    ventasALiquidar = ventasALiquidar.filter(v => v.fecha === liquidacionesState.filtroFecha);
  }
  
  if(ventasALiquidar.length === 0){
    alert('No hay ventas para liquidar con los filtros seleccionados');
    return;
  }
  
  const confirmar = confirm(`¿Liquidar ${ventasALiquidar.length} venta(s)?\n\nEsto marcará todas como "SI" en estado de liquidación.`);
  if(!confirmar) return;
  
  try {
    // Actualizar todas las ventas en paralelo
    const promesas = ventasALiquidar.map(v => {
      const ventaRef = doc(db, 'VENTAS', v.id);
      return updateDoc(ventaRef, { estado_liquidacion: 'SI' });
    });
    
    await Promise.all(promesas);
    
    // Remover de estado local
    const idsLiquidadas = new Set(ventasALiquidar.map(v => v.id));
    liquidacionesState.ventas = liquidacionesState.ventas.filter(v => !idsLiquidadas.has(v.id));
    
    agruparDatos();
    renderizarVista();
    alert(`✅ ${ventasALiquidar.length} venta(s) liquidada(s) correctamente`);
  } catch(err){
    alert('Error liquidando: ' + err.message);
  }
}

export async function mountLiquidaciones(container){
  if(!container) throw new Error("mountLiquidaciones: container no recibido");

  document.body.classList.remove("page-ventas","page-compras","page-inventario");
  document.body.classList.add("page-ventas");

  container.innerHTML = liquidacionesTemplate();
  
  // Exponer funciones globales
  window.LC = {
    editarVenta,
    liquidarTodo
  };

  // Event listeners para filtros
  document.getElementById('lFiltroProveedor').addEventListener('change', (e) => {
    liquidacionesState.filtroProveedor = e.target.value;
    renderizarVista();
  });

  document.getElementById('lFiltroFecha').addEventListener('change', (e) => {
    liquidacionesState.filtroFecha = e.target.value;
    renderizarVista();
  });

  document.getElementById('lBtnLiquidarTodo').addEventListener('click', liquidarTodo);

  await cargarVentasPendientes();
}
