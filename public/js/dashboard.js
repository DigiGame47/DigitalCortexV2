import { db, auth } from "./firebase.js";
import { collection, query, where, getDocs, orderBy } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const dashboardState = {
  periodo: 'mensual',
  fechaInicio: null,
  fechaFin: null,
  ventas: [],
  ventasAnterior: [],
  compras: [],
  inventario: [],
  metricas: null,
  chart: null
};

function money(val){
  return (parseFloat(val) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function obtenerRangoFechas(periodo) {
  const ahora = new Date();
  let inicio, fin;

  fin = ahora.toISOString().split('T')[0];

  if(periodo === 'diario') {
    inicio = fin;
  } else if(periodo === 'semanal') {
    const d = new Date(ahora);
    d.setDate(ahora.getDate() - ahora.getDay());
    inicio = d.toISOString().split('T')[0];
  } else if(periodo === 'mensual') {
    const d = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    inicio = d.toISOString().split('T')[0];
  }

  return { inicio, fin };
}

function obtenerMesAnterior() {
  const ahora = new Date();
  const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const ultimoDiaMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
  
  const inicio = mesAnterior.toISOString().split('T')[0];
  const fin = ultimoDiaMesAnterior.toISOString().split('T')[0];
  
  return { inicio, fin };
}

function dashboardTemplate(){
  return `
    <div class="dashboard-root" style="width:100%;height:100%;display:flex;flex-direction:column;">
      <div style="padding:14px;height:100%;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;font-size:20px;font-weight:600;">📊 Dashboard de Análisis</h2>
          <select id="dbPeriodo" class="dc-input" style="width:150px;padding:8px;font-size:12px;">
            <option value="diario">Hoy</option>
            <option value="semanal">Esta Semana</option>
            <option value="mensual">Este Mes</option>
          </select>
        </div>

        <!-- KPIs PRINCIPALES -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
          <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:16px;border-radius:8px;box-shadow:0 4px 12px rgba(102,126,234,0.3);">
            <div style="font-size:11px;opacity:0.9;margin-bottom:4px;">TOTAL VENTAS</div>
            <div id="dbTotalVentas" style="font-size:20px;font-weight:700;">$0.00</div>
            <div id="dbCantVentas" style="font-size:10px;opacity:0.8;margin-top:4px;">0 transacciones</div>
          </div>

          <div style="background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);color:#fff;padding:16px;border-radius:8px;box-shadow:0 4px 12px rgba(245,87,108,0.3);">
            <div style="font-size:11px;opacity:0.9;margin-bottom:4px;">TOTAL COMPRAS</div>
            <div id="dbTotalCompras" style="font-size:20px;font-weight:700;">$0.00</div>
            <div id="dbCantCompras" style="font-size:10px;opacity:0.8;margin-top:4px;">0 órdenes</div>
          </div>

          <div style="background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);color:#fff;padding:16px;border-radius:8px;box-shadow:0 4px 12px rgba(79,172,254,0.3);">
            <div style="font-size:11px;opacity:0.9;margin-bottom:4px;">GANANCIA BRUTA</div>
            <div id="dbGanancia" style="font-size:20px;font-weight:700;">$0.00</div>
            <div id="dbMargen" style="font-size:10px;opacity:0.8;margin-top:4px;">0% margen</div>
          </div>

          <div style="background:linear-gradient(135deg,#fa709a 0%,#fee140 100%);color:#fff;padding:16px;border-radius:8px;box-shadow:0 4px 12px rgba(250,112,154,0.3);">
            <div style="font-size:11px;opacity:0.9;margin-bottom:4px;">PROMEDIO VENTA</div>
            <div id="dbPromedioVenta" style="font-size:20px;font-weight:700;">$0.00</div>
            <div id="dbPromedioPorcentaje" style="font-size:10px;opacity:0.8;margin-top:4px;">vs período anterior</div>
          </div>
        </div>

        <!-- GRÁFICO COMPARATIVO -->
        <div style="background:#f9f9f9;padding:14px;border-radius:8px;border:1px solid #e0e0e0;height:300px;">
          <h3 style="margin:0 0 12px 0;font-size:12px;font-weight:600;">📈 ANÁLISIS DIARIO - VENTAS Y GANANCIA</h3>
          <canvas id="dbChart" style="max-height:250px;"></canvas>
        </div>

        <!-- DESGLOSE DE INGRESOS -->
        <div style="background:#f9f9f9;padding:14px;border-radius:8px;border:1px solid #e0e0e0;">
          <h3 style="margin:0 0 12px 0;font-size:12px;font-weight:600;">💰 DESGLOSE DE INGRESOS</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;font-size:11px;">
            <div>
              <div style="color:#666;font-size:10px;">Efectivo</div>
              <div id="dbEfectivo" style="font-size:16px;font-weight:700;color:#4caf50;">$0.00</div>
            </div>
            <div>
              <div style="color:#666;font-size:10px;">Tarjeta</div>
              <div id="dbTarjeta" style="font-size:16px;font-weight:700;color:#2196f3;">$0.00</div>
            </div>
            <div>
              <div style="color:#666;font-size:10px;">Ticket Promedio</div>
              <div id="dbTicketPromedio" style="font-size:16px;font-weight:700;color:#ff9800;">$0.00</div>
            </div>
            <div>
              <div style="color:#666;font-size:10px;">Valor Inventario</div>
              <div id="dbValorInventario" style="font-size:16px;font-weight:700;color:#9c27b0;">$0.00</div>
            </div>
          </div>
        </div>

        <!-- FILA DE TABLAS -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0;">
          <!-- PRODUCTOS TOP -->
          <div style="background:#f9f9f9;padding:12px;border-radius:8px;border:1px solid #e0e0e0;display:flex;flex-direction:column;">
            <h3 style="margin:0 0 8px 0;font-size:11px;font-weight:600;">🏆 TOP 5 PRODUCTOS MÁS VENDIDOS</h3>
            <div id="dbProductosTop" style="flex:1;overflow-y:auto;font-size:10px;">
              <div style="text-align:center;color:#999;">Cargando...</div>
            </div>
          </div>

          <!-- CLIENTES TOP -->
          <div style="background:#f9f9f9;padding:12px;border-radius:8px;border:1px solid #e0e0e0;display:flex;flex-direction:column;">
            <h3 style="margin:0 0 8px 0;font-size:11px;font-weight:600;">👥 TOP 5 CLIENTES</h3>
            <div id="dbClientesTop" style="flex:1;overflow-y:auto;font-size:10px;">
              <div style="text-align:center;color:#999;">Cargando...</div>
            </div>
          </div>
        </div>

        <!-- INDICADORES CRÍTICOS -->
        <div style="background:#fff3e0;padding:12px;border-radius:8px;border-left:4px solid #ff9800;">
          <h3 style="margin:0 0 8px 0;font-size:11px;font-weight:600;">⚠️ ALERTAS DE INVENTARIO</h3>
          <div id="dbAlertasInventario" style="font-size:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
            <div style="text-align:center;color:#999;">Cargando...</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function cargarDatos(){
  try {
    const rango = obtenerRangoFechas(dashboardState.periodo);
    dashboardState.fechaInicio = rango.inicio;
    dashboardState.fechaFin = rango.fin;

    // Cargar todas las ventas y filtrar en memoria (mejor para flexibilidad de fechas)
    const ventasRef = collection(db, 'VENTAS');
    const snapVentasAll = await getDocs(ventasRef);
    const ventasAll = snapVentasAll.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log('[Dashboard] Total de ventas en BD:', ventasAll.length);
    
    // Filtrar ventas del período actual
    dashboardState.ventas = ventasAll.filter(venta => {
      const fecha = (venta.fecha || '').toString();
      return fecha >= rango.inicio && fecha <= rango.fin;
    });
    console.log('[Dashboard] Ventas período actual:', dashboardState.ventas.length);

    // Cargar ventas del mes anterior (para comparativa)
    if(dashboardState.periodo === 'mensual') {
      const rangoAnterior = obtenerMesAnterior();
      console.log('[Dashboard] Rango actual:', rango);
      console.log('[Dashboard] Rango anterior:', rangoAnterior);
      
      dashboardState.ventasAnterior = ventasAll.filter(venta => {
        const fecha = (venta.fecha || '').toString();
        const match = fecha >= rangoAnterior.inicio && fecha <= rangoAnterior.fin;
        return match;
      });
      console.log('[Dashboard] Ventas mes anterior cargadas:', dashboardState.ventasAnterior.length);
      if(dashboardState.ventasAnterior.length > 0) {
        console.log('[Dashboard] Primeras 3 ventas anterior:', dashboardState.ventasAnterior.slice(0, 3).map(v => ({
          fecha: v.fecha,
          precio: v.precio_producto,
          ganancia: v.ganancia
        })));
      }
    } else {
      dashboardState.ventasAnterior = [];
    }

    // Cargar compras
    const comprasRef = collection(db, 'COMPRAS');
    const snapCompras = await getDocs(comprasRef);
    dashboardState.compras = snapCompras.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Cargar inventario
    const inventarioRef = collection(db, 'INVENTARIO');
    const snapInventario = await getDocs(inventarioRef);
    dashboardState.inventario = snapInventario.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    calcularMetricas();
    renderizar();
    renderizarGrafico();
  } catch(err){
    console.error('Error cargando datos:', err);
  }
}

function calcularMetricas(){
  const v = dashboardState.ventas;
  const c = dashboardState.compras;
  const inv = dashboardState.inventario;

  // VENTAS
  const totalVentas = v.reduce((sum, venta) => sum + (parseFloat(venta.precio_producto) || 0), 0);
  const cantVentas = v.length;
  const promedioVenta = cantVentas > 0 ? totalVentas / cantVentas : 0;

  // COMPRAS
  const totalCompras = c.reduce((sum, compra) => sum + (parseFloat(compra.costo) || 0), 0);
  const cantCompras = c.length;

  // INVENTARIO
  const valorInventario = inv.reduce((sum, item) => {
    const cantidad = parseFloat(item.cantidad) || 0;
    const costo = parseFloat(item.costo_unitario) || 0;
    return sum + (cantidad * costo);
  }, 0);

  const productosCriticos = inv.filter(item => {
    const cantidad = parseFloat(item.cantidad) || 0;
    const minimo = parseFloat(item.cantidad_minima) || 10;
    return cantidad <= minimo;
  });

  // INGRESOS POR MÉTODO
  let efectivoTotal = 0;
  let tarjetaTotal = 0;
  v.forEach(venta => {
    const monto = parseFloat(venta.precio_producto) || 0;
    if(venta.metodo_pago === 'EFECTIVO') efectivoTotal += monto;
    else tarjetaTotal += monto;
  });

  // GANANCIA - Usar directamente la columna ganancia de la BD
  const ganancia = v.reduce((sum, venta) => sum + (parseFloat(venta.ganancia) || 0), 0);
  
  const margen = totalVentas > 0 ? (ganancia / totalVentas * 100) : 0;

  dashboardState.metricas = {
    totalVentas, cantVentas, promedioVenta,
    totalCompras, cantCompras,
    valorInventario, productosCriticos,
    efectivoTotal, tarjetaTotal,
    ganancia, margen
  };
}

function renderizar(){
  const m = dashboardState.metricas;
  const v = dashboardState.ventas;
  const inv = dashboardState.inventario;

  // KPIs
  document.getElementById('dbTotalVentas').textContent = '$' + money(m.totalVentas);
  document.getElementById('dbCantVentas').textContent = m.cantVentas + ' transacciones';
  
  document.getElementById('dbTotalCompras').textContent = '$' + money(m.totalCompras);
  document.getElementById('dbCantCompras').textContent = m.cantCompras + ' órdenes';
  
  document.getElementById('dbGanancia').textContent = '$' + money(m.ganancia);
  document.getElementById('dbMargen').textContent = m.margen.toFixed(1) + '% margen';
  
  document.getElementById('dbPromedioVenta').textContent = '$' + money(m.promedioVenta);
  
  // DESGLOSE
  document.getElementById('dbEfectivo').textContent = '$' + money(m.efectivoTotal);
  document.getElementById('dbTarjeta').textContent = '$' + money(m.tarjetaTotal);
  document.getElementById('dbTicketPromedio').textContent = '$' + money(m.promedioVenta);
  document.getElementById('dbValorInventario').textContent = '$' + money(m.valorInventario);

  // TOP PRODUCTOS
  const productosCount = {};
  v.forEach(venta => {
    const prod = venta.producto || 'Sin producto';
    productosCount[prod] = (productosCount[prod] || 0) + 1;
  });
  
  const topProductos = Object.entries(productosCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const htmlProductos = topProductos.length > 0 
    ? topProductos.map((p, i) => `
      <div style="padding:6px 0;border-bottom:1px solid #e0e0e0;">
        <div style="font-weight:600;">${i+1}. ${p[0]}</div>
        <div style="color:#666;font-size:9px;">${p[1]} ventas</div>
      </div>
    `).join('')
    : '<div style="text-align:center;color:#999;">Sin datos</div>';

  document.getElementById('dbProductosTop').innerHTML = htmlProductos;

  // TOP CLIENTES
  const clientesCount = {};
  v.forEach(venta => {
    const cli = venta.cliente || 'Sin cliente';
    clientesCount[cli] = (clientesCount[cli] || 0) + 1;
  });
  
  const topClientes = Object.entries(clientesCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const htmlClientes = topClientes.length > 0 
    ? topClientes.map((c, i) => `
      <div style="padding:6px 0;border-bottom:1px solid #e0e0e0;">
        <div style="font-weight:600;">${i+1}. ${c[0]}</div>
        <div style="color:#666;font-size:9px;">${c[1]} compras</div>
      </div>
    `).join('')
    : '<div style="text-align:center;color:#999;">Sin datos</div>';

  document.getElementById('dbClientesTop').innerHTML = htmlClientes;

  // ALERTAS INVENTARIO
  const htmlAlertas = m.productosCriticos.length > 0
    ? m.productosCriticos.slice(0, 5).map(item => `
      <div style="background:#fff;padding:8px;border-radius:4px;border-left:4px solid #ff9800;">
        <div style="font-weight:600;font-size:10px;">${item.producto}</div>
        <div style="font-size:9px;color:#ff9800;margin-top:2px;">
          Stock: ${parseFloat(item.cantidad || 0).toFixed(0)} / Mín: ${parseFloat(item.cantidad_minima || 0).toFixed(0)}
        </div>
      </div>
    `).join('')
    : '<div style="text-align:center;color:#999;padding:10px;">✅ Todos los productos tienen stock adecuado</div>';

  document.getElementById('dbAlertasInventario').innerHTML = htmlAlertas;
}

function renderizarGrafico(){
  const ahora = new Date();
  const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  
  // Crear array de días del mes actual
  const diasActualVentas = {};
  const diasActualGanancia = {};
  const diasAnteriorVentas = {};
  const diasAnteriorGanancia = {};
  
  for(let i = 1; i <= diasEnMes; i++) {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth(), i).toISOString().split('T')[0];
    diasActualVentas[fecha] = 0;
    diasActualGanancia[fecha] = 0;
  }

  // Llenar datos del mes actual
  dashboardState.ventas.forEach(venta => {
    if(diasActualVentas.hasOwnProperty(venta.fecha)) {
      diasActualVentas[venta.fecha] += parseFloat(venta.precio_producto) || 0;
      diasActualGanancia[venta.fecha] += parseFloat(venta.ganancia) || 0;
    }
  });

  // Llenar datos del mes anterior
  const mesAnterior = ahora.getMonth() - 1 === -1 ? 11 : ahora.getMonth() - 1;
  const anioAnterior = ahora.getMonth() - 1 === -1 ? ahora.getFullYear() - 1 : ahora.getFullYear();
  const diasEnMesAnterior = new Date(anioAnterior, mesAnterior + 1, 0).getDate();
  
  for(let i = 1; i <= diasEnMesAnterior; i++) {
    const fecha = new Date(anioAnterior, mesAnterior, i).toISOString().split('T')[0];
    diasAnteriorVentas[fecha] = 0;
    diasAnteriorGanancia[fecha] = 0;
  }

  dashboardState.ventasAnterior.forEach(venta => {
    if(diasAnteriorVentas.hasOwnProperty(venta.fecha)) {
      diasAnteriorVentas[venta.fecha] += parseFloat(venta.precio_producto) || 0;
      diasAnteriorGanancia[venta.fecha] += parseFloat(venta.ganancia) || 0;
    }
  });

  console.log('[Dashboard Gráfico] Datos mes actual ventas:', diasActualVentas);
  console.log('[Dashboard Gráfico] Datos mes anterior ventas:', diasAnteriorVentas);
  console.log('[Dashboard Gráfico] Datos mes anterior ganancia:', diasAnteriorGanancia);

  // Preparar datos para gráfico
  const labels = Object.keys(diasActualVentas).map(f => {
    const d = new Date(f + 'T00:00:00');
    return d.getDate();
  });

  const dataActualVentas = Object.values(diasActualVentas);
  const dataActualGanancia = Object.values(diasActualGanancia);
  
  // Calcular promedio y tendencia del mes actual
  const ventasValidas = dataActualVentas.filter(v => v > 0);
  const gananciasValidas = dataActualGanancia.filter(v => v > 0);
  const promedioVentas = ventasValidas.length > 0 ? ventasValidas.reduce((a, b) => a + b, 0) / ventasValidas.length : 0;
  const promedioGanancia = gananciasValidas.length > 0 ? gananciasValidas.reduce((a, b) => a + b, 0) / gananciasValidas.length : 0;

  // Datos del mes anterior (limitar a los mismos días)
  const dataAnteriorVentas = [];
  const dataAnteriorGanancia = [];
  for(let i = 1; i <= diasEnMes; i++) {
    if(i <= diasEnMesAnterior) {
      const fecha = new Date(anioAnterior, mesAnterior, i).toISOString().split('T')[0];
      dataAnteriorVentas.push(diasAnteriorVentas[fecha] || null);
      dataAnteriorGanancia.push(diasAnteriorGanancia[fecha] || null);
    } else {
      dataAnteriorVentas.push(null);
      dataAnteriorGanancia.push(null);
    }
  }

  // Destruir gráfico anterior si existe
  if(dashboardState.chart) {
    dashboardState.chart.destroy();
  }

  // Crear gráfico - VENTAS
  const ctx = document.getElementById('dbChart').getContext('2d');
  dashboardState.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Ventas Este Mes',
          data: dataActualVentas,
          type: 'bar',
          backgroundColor: 'rgba(102, 126, 234, 0.7)',
          borderColor: '#667eea',
          borderWidth: 1,
          yAxisID: 'y',
          order: 3,
          barThickness: 'flex',
          maxBarThickness: 20
        },
        {
          label: 'Ventas Mes Anterior',
          data: dataAnteriorVentas,
          type: 'bar',
          backgroundColor: 'rgba(245, 87, 108, 0.4)',
          borderColor: '#f5576c',
          borderWidth: 1,
          yAxisID: 'y',
          order: 4,
          barThickness: 'flex',
          maxBarThickness: 20
        },
        {
          label: 'Tendencia Ventas',
          data: dataActualVentas,
          type: 'line',
          borderColor: '#2c3e50',
          borderWidth: 2.5,
          tension: 0.5,
          fill: false,
          pointRadius: 5,
          pointBackgroundColor: '#2c3e50',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          yAxisID: 'y',
          order: 1
        },
        {
          label: 'Ganancia Este Mes',
          data: dataActualGanancia,
          type: 'line',
          borderColor: '#4caf50',
          borderWidth: 2,
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointBackgroundColor: '#4caf50',
          yAxisID: 'y1',
          order: 2
        },
        {
          label: 'Ganancia Mes Anterior',
          data: dataAnteriorGanancia,
          type: 'line',
          borderColor: '#ff9800',
          borderWidth: 1.5,
          borderDash: [3, 3],
          tension: 0.4,
          fill: false,
          pointRadius: 3,
          pointBackgroundColor: '#ff9800',
          yAxisID: 'y1',
          order: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 10 },
            padding: 12,
            usePointStyle: false
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 10,
          titleFont: { size: 11, weight: 'bold' },
          bodyFont: { size: 10 },
          borderColor: 'rgba(255, 255, 255, 0.3)',
          borderWidth: 1,
          displayColors: true,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += '$' + money(context.parsed.y);
              }
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Ventas ($)', font: { size: 10, weight: 'bold' } },
          beginAtZero: true,
          ticks: { 
            font: { size: 9 },
            callback: function(value) {
              return '$' + (value >= 1000 ? (value/1000).toFixed(1) + 'k' : value);
            }
          },
          grid: { color: 'rgba(102, 126, 234, 0.1)' }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Ganancia ($)', font: { size: 10, weight: 'bold' } },
          beginAtZero: true,
          ticks: { 
            font: { size: 9 },
            callback: function(value) {
              return '$' + (value >= 1000 ? (value/1000).toFixed(1) + 'k' : value);
            }
          },
          grid: { drawOnChartArea: false }
        },
        x: {
          stacked: false,
          ticks: { font: { size: 9 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    }
  });
}

export async function mountDashboard(container){
  if(!container) throw new Error("mountDashboard: container no recibido");

  document.body.classList.remove("page-ventas","page-compras","page-inventario");
  document.body.classList.add("page-ventas");

  container.innerHTML = dashboardTemplate();

  // Cargar Chart.js si no está disponible
  if(!window.Chart) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = () => {
      cargarDatos();
    };
    document.head.appendChild(script);
  } else {
    cargarDatos();
  }

  // Selector de período
  document.getElementById('dbPeriodo').addEventListener('change', (e) => {
    dashboardState.periodo = e.target.value;
    cargarDatos();
  });

  // Cargar datos iniciales
  dashboardState.periodo = 'mensual';
}
