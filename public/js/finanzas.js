/* ===========================
   MÓDULO DE FINANZAS v2.0
   
   NUEVO OBJETIVO:
   - Comparar dinero que debería tener vs el que tengo de ventas realizadas
   - Cuadrar caja con dinero físico
   - Distribuir fondos disponibles
   - Documentar destino de fondos
   
   FLUJO:
   1. Seleccionar período (def: 1ro al último día del mes)
   2. Cargar ventas: Venta finalizada + estado_liquidacion = SI + no cuadradas
   3. Calcular totales automáticamente
   4. Ingresar dinero físico para cuadrar
   5. Distribuir fondos
   6. Guardar cierre y marcar ventas como cuadradas
   
   Firestore collections:
   - "VENTAS": ventas con campos estado_venta, estado_liquidacion, cuadrado
   - "cierres_finanzas": historial de cierres
   =========================== */

import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc,
  serverTimestamp, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ===========================
   HELPERS & UTILITIES
   ========================= */
const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const n = (v) => Number(v || 0);
const money = (v) => n(v).toFixed(2);
const todayISO = () => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Obtener primer y último día del mes actual
function getPeriodoMesActual() {
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  
  const pad = (x) => String(x).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  
  return {
    inicio: iso(primero),
    fin: iso(ultimo)
  };
}

function formatFechaDisplay(fecha) {
  if (!fecha) return "";
  const [year, month, day] = fecha.split("-");
  return `${day}/${month}/${year}`;
}

function showToast(msg, type = "info") {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 16px;
    background: ${
      type === "error"
        ? "rgba(239,68,68,.9)"
        : type === "success"
        ? "rgba(34,197,94,.9)"
        : "rgba(99,102,241,.9)"
    };
    color: white;
    border-radius: 8px;
    font-size: 12px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,.3);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* ===========================
   ESTADO GLOBAL
   ========================= */
const finanzasState = {
  modo: "list", // list | cuadrar | distribuir | resumen
  periodo: { inicio: "", fin: "" },
  ventasCargas: [], // ventas cargadas del período
  totalesVentas: {
    total_facturado: 0,
    ganancia_total: 0,
    costo_total: 0,
    cantidad_ventas: 0
  },
  datosReales: { // valores ingresados manualmente
    efectivo: 0,
    cuenta_ahorro: 0,
    pendientes: 0,
    reserva_anterior: 0  // Saldo de reserva del período anterior
  },
  distribucion: { // cómo se distribuyen los fondos
    retiro_ganancia: 0,
    fondear_inventario: 0,
    reserva: 0,
    resto: 0
  },
  cierres: []
};

/* ===========================
   LÓGICA DE CUADRE
   ========================= */

// Obtener ventas del periodo con filtros correctos
async function cargarVentasPeriodo(fechaInicio, fechaFin) {
  try {
    const ventasRef = collection(db, "VENTAS");
    const snapshot = await getDocs(ventasRef);
    const ventas = [];

    snapshot.forEach((doc) => {
      const venta = { id: doc.id, ...doc.data() };
      
      // Criterios de filtro:
      // 1. Estado venta = Venta finalizada
      // 2. Estado liquidacion = SI
      // 3. No cuadrado (no tiene el campo cuadrado o es false)
      const cumpleCriterios = 
        venta.estado_venta === "Venta finalizada" &&
        venta.estado_liquidacion === "SI" &&
        !venta.cuadrado;
      
      // Filtrar por fecha
      const fechaVenta = venta.fecha || "";
      const enPeriodo = fechaVenta >= fechaInicio && fechaVenta <= fechaFin;
      
      if (cumpleCriterios && enPeriodo) {
        ventas.push(venta);
      }
    });

    finanzasState.ventasCargas = ventas;
    return ventas;
  } catch (error) {
    console.error("Error obteniendo ventas:", error);
    showToast("Error al obtener ventas", "error");
    return [];
  }
}

// Obtener saldo de reserva del período anterior
async function obtenerReservaAnterior(fechaInicio) {
  try {
    const cierresRef = collection(db, "cierres_finanzas");
    const snapshot = await getDocs(cierresRef);
    let reservaAnterior = 0;

    const cierres = [];
    snapshot.forEach((doc) => {
      const cierre = doc.data();
      if (cierre.distribucion && cierre.fecha_fin) {
        cierres.push(cierre);
      }
    });

    console.log('[obtenerReservaAnterior] Total cierres encontrados:', cierres.length);

    // Si no hay cierres, retornar 0
    if (cierres.length === 0) {
      console.log('[obtenerReservaAnterior] No hay cierres anteriores');
      return 0;
    }

    // Ordenar por fecha fin descendente (más reciente primero)
    cierres.sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || ""));

    console.log('[obtenerReservaAnterior] Cierres ordenados. Buscando anterior a:', fechaInicio);

    // Buscar el cierre más reciente anterior a la fecha de inicio
    for (const cierre of cierres) {
      const fechaFin = (cierre.fecha_fin || "").trim();
      const esAnterior = fechaFin < fechaInicio;
      
      console.log('[obtenerReservaAnterior] Comparando:', {
        fecha_fin_cierre: fechaFin,
        fecha_inicio_busqueda: fechaInicio,
        es_anterior: esAnterior,
        distribucion_keys: Object.keys(cierre.distribucion || {})
      });
      
      if (esAnterior) {
        reservaAnterior = n(cierre.distribucion.reserva || 0);
        console.log('[obtenerReservaAnterior] ✓ Encontrado cierre anterior con reserva:', reservaAnterior);
        break;
      }
    }

    // Si no encontró ninguno anterior (ej: mismo período o períodos futuros)
    // tomar el más reciente disponible
    if (reservaAnterior === 0 && cierres.length > 0) {
      const cierreMasReciente = cierres[0];
      if (cierreMasReciente.distribucion) {
        reservaAnterior = n(cierreMasReciente.distribucion.reserva || 0);
        console.log('[obtenerReservaAnterior] No se encontró anterior, usando cierre más reciente:', {
          fecha_fin: cierreMasReciente.fecha_fin,
          reserva: reservaAnterior
        });
      }
    }

    console.log('[obtenerReservaAnterior] Valor final a retornar:', reservaAnterior);
    return reservaAnterior;
  } catch (error) {
    console.error("Error obteniendo reserva anterior:", error);
    return 0;
  }
}

// Calcular totales desde ventas
function calcularTotalesVentas(ventas) {
  let totalFacturado = 0;
  let gananciTotal = 0;
  let costoTotal = 0;

  ventas.forEach((venta) => {
    const precio = n(venta.precio_producto);
    const ganancia = n(venta.ganancia);
    const costo = n(venta.costo_producto);

    totalFacturado += precio;
    gananciTotal += ganancia;
    costoTotal += costo;
  });

  finanzasState.totalesVentas = {
    total_facturado: totalFacturado,
    ganancia_total: gananciTotal,
    costo_total: costoTotal,
    cantidad_ventas: ventas.length
  };

  return finanzasState.totalesVentas;
}

// Calcular cuadre: comparar lo que debería tener vs lo que tengo
function calcularCuadre() {
  const totales = finanzasState.totalesVentas;
  const reales = finanzasState.datosReales;
  const reservaAnterior = reales.reserva_anterior || 0;

  // Lo que debería tener según el sistema = Facturación del período + Reserva acumulada de períodos anteriores
  const deberiaHaber = totales.total_facturado + reservaAnterior;

  // Lo que realmente tengo (suma de efectivo + ahorro + pendientes)
  const tengoRealmente = reales.efectivo + reales.cuenta_ahorro + reales.pendientes;

  // Diferencia (con tolerancia de centavos)
  const diferencia = tengoRealmente - deberiaHaber;
  const cuadra = Math.abs(diferencia) < 0.01;

  return {
    deberia_haber: deberiaHaber,
    tengo_realmente: tengoRealmente,
    diferencia: diferencia,
    cuadra: cuadra,
    reserva_anterior: reservaAnterior
  };
}

// Actualizar dinero disponible para distribuir
function calcularDisponible() {
  const cuadre = calcularCuadre();
  // El disponible es simplemente lo que realmente tenemos, ya que el cuadre ya incluye la reserva anterior
  return cuadre.tengo_realmente;
}

// Guardar cierre completo y marcar ventas como cuadradas
async function guardarCierreCompleto() {
  try {
    const cuadre = calcularCuadre();

    if (!cuadre.cuadra) {
      showToast(
        `No cuadra: diferencia de $${money(cuadre.diferencia)}. Revisa los datos.`,
        "error"
      );
      return false;
    }

    // Crear documento de cierre
    const cierreData = {
      fecha_inicio: finanzasState.periodo.inicio,
      fecha_fin: finanzasState.periodo.fin,
      totales: {
        total_facturado: money(finanzasState.totalesVentas.total_facturado),
        ganancia_total: money(finanzasState.totalesVentas.ganancia_total),
        costo_total: money(finanzasState.totalesVentas.costo_total),
        cantidad_ventas: finanzasState.totalesVentas.cantidad_ventas
      },
      dinero_fisico: {
        efectivo: money(finanzasState.datosReales.efectivo),
        cuenta_ahorro: money(finanzasState.datosReales.cuenta_ahorro),
        pendientes: money(finanzasState.datosReales.pendientes),
        total: money(cuadre.tengo_realmente)
      },
      cuadre: {
        deberia_haber: money(cuadre.deberia_haber),
        tengo_realmente: money(cuadre.tengo_realmente),
        diferencia: money(cuadre.diferencia),
        cuadra: true
      },
      distribucion: {
        retiro_ganancia: money(finanzasState.distribucion.retiro_ganancia),
        fondear_inventario: money(finanzasState.distribucion.fondear_inventario),
        reserva: money(finanzasState.distribucion.reserva),
        resto: money(finanzasState.distribucion.resto)
      },
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    };

    const cierreRef = await addDoc(collection(db, "cierres_finanzas"), cierreData);

    // Marcar ventas como cuadradas con transacción
    const batch = writeBatch(db);
    finanzasState.ventasCargas.forEach((venta) => {
      const ventaRef = doc(db, "VENTAS", venta.id);
      batch.update(ventaRef, { cuadrado: true });
    });
    await batch.commit();

    showToast("✅ Cierre guardado y ventas marcadas como cuadradas", "success");
    return true;
  } catch (error) {
    console.error("Error guardando cierre:", error);
    showToast("Error al guardar cierre", "error");
    return false;
  }
}

// Obtener todos los cierres
async function obtenerCierres() {
  try {
    const cierresRef = collection(db, "cierres_finanzas");
    const snapshot = await getDocs(cierresRef);
    const cierres = [];

    snapshot.forEach((doc) => {
      cierres.push({ id: doc.id, ...doc.data() });
    });

    // Ordenar por fecha fin descendente
    cierres.sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || ""));

    finanzasState.cierres = cierres;
    return cierres;
  } catch (error) {
    console.error("Error obteniendo cierres:", error);
    return [];
  }
}

/* ===========================
   TEMPLATES
   ========================= */

// Tabla de ventas a cuadrar
function templateTablaVentas(ventas) {
  if (!ventas || ventas.length === 0) {
    return `<p style="text-align: center; color: var(--muted);">No hay ventas para mostrar</p>`;
  }

  const filas = ventas.map((venta) => `
    <tr>
      <td>${formatFechaDisplay(venta.fecha || "")}</td>
      <td>${venta.cliente || "-"}</td>
      <td class="fin-text-right">$${money(n(venta.precio_producto))}</td>
      <td class="fin-text-right fin-color-green">$${money(n(venta.ganancia))}</td>
      <td class="fin-text-right fin-color-red">$${money(n(venta.costo_producto))}</td>
      <td>${venta.estado_venta || "-"}</td>
    </tr>
  `).join("");

  return `
    <div class="fin-table-wrapper">
      <table class="fin-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th class="fin-text-right">Precio</th>
            <th class="fin-text-right">Ganancia</th>
            <th class="fin-text-right">Costo</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
      </table>
    </div>
  `;
}
function templateListaCierres() {
  const cierres = finanzasState.cierres;

  if (cierres.length === 0) {
    return `
      <div class="fin-empty-state">
        <div class="fin-empty-icon">📊</div>
        <h2>Sin cierres aún</h2>
        <p>No hay cierres registrados. Comienza tu primer cuadre de caja.</p>
        <button class="fin-btn fin-btn-primary" onclick="finanzas.iniciarCuadre()">
          + Nuevo Cuadre
        </button>
      </div>
    `;
  }

  const filas = cierres
    .map((c) => `
      <tr>
        <td>${formatFechaDisplay(c.fecha_inicio)}</td>
        <td>${formatFechaDisplay(c.fecha_fin)}</td>
        <td class="fin-text-right">$${c.totales?.total_facturado || "0.00"}</td>
        <td class="fin-text-right">$${c.cuadre?.tengo_realmente || "0.00"}</td>
        <td class="fin-text-right fin-text-success">$${c.distribucion?.retiro_ganancia || "0.00"}</td>
        <td class="fin-text-right">
          <span class="fin-badge fin-badge-success">✓ Cuadrado</span>
        </td>
        <td class="fin-text-center">
          <button class="fin-btn fin-btn-sm fin-btn-ghost" onclick="finanzas.verCierre('${c.id}')" title="Ver">👁️</button>
        </td>
      </tr>
    `).join("");

  return `
    <div class="fin-list-container">
      <div class="fin-header">
        <h2>📋 Cierres de Caja</h2>
        <button class="fin-btn fin-btn-primary" onclick="finanzas.iniciarCuadre()">
          + Nuevo Cuadre
        </button>
      </div>
      <div class="fin-table-wrapper">
        <table class="fin-table">
          <thead>
            <tr>
              <th>Inicio</th>
              <th>Fin</th>
              <th class="fin-text-right">Total Facturado</th>
              <th class="fin-text-right">Dinero Físico</th>
              <th class="fin-text-right">Retiro</th>
              <th>Estado</th>
              <th class="fin-text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${filas}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Template para cuadre de caja
function templateCuadreCaja() {
  const periodo = finanzasState.periodo;
  const periodoDefault = getPeriodoMesActual();
  
  return `
    <div class="fin-cuadre-container">
      <div class="fin-header">
        <h2>💰 Cuadre de Caja</h2>
        <p class="fin-subtitle">Paso 1: Selecciona período y carga ventas</p>
      </div>

      <div class="fin-cuadre-scroll">
      <div class="fin-card fin-step">
        <h3>📅 Período a Cuadrar</h3>
        <div class="fin-grid-2">
          <div class="fin-form-group">
            <label class="fin-label">Fecha Inicio</label>
            <input id="periodoInicio" type="date" class="fin-input" value="${periodoDefault.inicio}">
          </div>
          <div class="fin-form-group">
            <label class="fin-label">Fecha Fin</label>
            <input id="periodoFin" type="date" class="fin-input" value="${periodoDefault.fin}">
          </div>
        </div>
        <button class="fin-btn fin-btn-primary" onclick="finanzas.cargarVentas()" style="width: 100%; margin-top: 15px;">
          Cargar Ventas del Período
        </button>
      </div>

      <div id="containerVentas" style="display: none;">
        <div class="fin-card fin-step">
          <h3>📊 Totales Calculados</h3>
          <div class="fin-grid-3">
            <div class="fin-metric">
              <span class="fin-metric-label">Total Facturado</span>
              <span class="fin-metric-value fin-color-blue" id="metricTotal">$0.00</span>
              <span class="fin-metric-detail" id="metricDetalleVentas"></span>
            </div>
            <div class="fin-metric">
              <span class="fin-metric-label">Ganancia Total</span>
              <span class="fin-metric-value fin-color-green" id="metricGanancia">$0.00</span>
            </div>
            <div class="fin-metric">
              <span class="fin-metric-label">Costo Total</span>
              <span class="fin-metric-value fin-color-red" id="metricCosto">$0.00</span>
            </div>
          </div>
        </div>

        <div class="fin-card fin-step">
          <h3>📋 Ventas a Cuadrar</h3>
          <div id="containerTablaVentas" style="max-height: 400px; overflow-y: auto;"></div>
        </div>

        <div class="fin-card fin-step">
          <h3>💵 Dinero Físico (Ingresa valores reales)</h3>
          <div class="fin-grid-3">
            <div class="fin-form-group">
              <label class="fin-label">Efectivo (en caja)</label>
              <div class="fin-input-with-icon">
                <span>$</span>
                <input id="inputEfectivo" type="number" class="fin-input" value="0" min="0" step="0.01" oninput="finanzas.actualizarCuadre()">
              </div>
            </div>
            <div class="fin-form-group">
              <label class="fin-label">Cuenta de Ahorro</label>
              <div class="fin-input-with-icon">
                <span>$</span>
                <input id="inputAhorro" type="number" class="fin-input" value="0" min="0" step="0.01" oninput="finanzas.actualizarCuadre()">
              </div>
            </div>
            <div class="fin-form-group">
              <label class="fin-label">Pendientes en Tránsito</label>
              <div class="fin-input-with-icon">
                <span>$</span>
                <input id="inputPendientes" type="number" class="fin-input" value="0" min="0" step="0.01" oninput="finanzas.actualizarCuadre()">
              </div>
            </div>
          </div>
        </div>

        <div class="fin-card fin-step">
          <h3>💾 Saldo de Período Anterior</h3>
          <p class="fin-subtitle">Fondos acumulados que se incluyen en este cuadre</p>
          <div class="fin-grid-2">
            <div class="fin-form-group">
              <label class="fin-label">Reserva Período Anterior</label>
              <div class="fin-input-with-icon">
                <span>$</span>
                <input id="inputReservaAnterior" type="number" class="fin-input" value="0" min="0" step="0.01" readonly>
              </div>
              <span id="displayReservaAnterior" style="font-size: 1.1em; font-weight: 600; color: var(--accent); margin-top: 4px; display: block;">$0.00</span>
              <span style="font-size: 0.75em; color: var(--muted); margin-top: 4px;">Calculado automáticamente del cierre anterior</span>
            </div>
          </div>
        </div>

        <div id="containerResultado" style="display: none;">
          <div class="fin-card fin-step fin-cuadre-resultado">
            <h3>✅ Resultado del Cuadre</h3>
            <div class="fin-cuadre-content">
              <div style="font-size: 0.85em; color: var(--muted); margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--stroke);">
                <strong>Lo que DEBERÍA tener:</strong>
              </div>
              <div class="fin-cuadre-item" style="margin-left: 15px; margin-bottom: 8px;">
                <span class="fin-cuadre-label">Total facturado (período)</span>
                <span class="fin-cuadre-value" id="resultFacturado">$0.00</span>
              </div>
              <div class="fin-cuadre-item" style="margin-left: 15px; margin-bottom: 15px;">
                <span class="fin-cuadre-label">+ Reserva período anterior</span>
                <span class="fin-cuadre-value fin-color-blue" id="resultReservaAnterior">$0.00</span>
              </div>
              <div class="fin-cuadre-item">
                <span class="fin-cuadre-label"><strong>= Debería tener (total)</strong></span>
                <span class="fin-cuadre-value" id="resultDeberiaHaber">$0.00</span>
              </div>
              <div style="font-size: 0.85em; color: var(--muted); margin: 15px 0 10px 0; padding-top: 10px; border-top: 1px solid var(--stroke);">
                <strong>Lo que REALMENTE tengo:</strong>
              </div>
              <div class="fin-cuadre-item">
                <span class="fin-cuadre-label">Dinero físico (efectivo + ahorro + pendientes)</span>
                <span class="fin-cuadre-value" id="resultTengoRealmente">$0.00</span>
              </div>
              <div class="fin-cuadre-item fin-cuadre-diff">
                <span class="fin-cuadre-label">Diferencia</span>
                <span class="fin-cuadre-value" id="resultDiferencia">$0.00</span>
              </div>
            </div>
            <div class="fin-cuadre-status" id="statusCuadre">✓ CUADRA</div>
          </div>

          <div id="containerDistribucion" style="display: none;">
            <div class="fin-card fin-step">
              <h3>📊 Distribución de Fondos</h3>
              <p class="fin-subtitle">Ingresa cómo distribuir el dinero disponible</p>
              <div class="fin-disponible-info">
                <span>Disponible para distribuir:</span>
                <strong id="displayDisponible">$0.00</strong>
              </div>
              <div class="fin-grid-2">
                <div class="fin-form-group">
                  <label class="fin-label">Retiro de Ganancia</label>
                  <div class="fin-input-with-icon">
                    <span>$</span>
                    <input id="inputRetiro" type="number" class="fin-input" value="0" min="0" step="0.01" oninput="finanzas.actualizarDistribucion()">
                  </div>
                </div>
                <div class="fin-form-group">
                  <label class="fin-label">Fondear Inventario</label>
                  <div class="fin-input-with-icon">
                    <span>$</span>
                    <input id="inputFondeo" type="number" class="fin-input" value="0" min="0" step="0.01" oninput="finanzas.actualizarDistribucion()">
                  </div>
                </div>
                <div class="fin-form-group">
                  <label class="fin-label">Reserva</label>
                  <div class="fin-input-with-icon">
                    <span>$</span>
                    <input id="inputReserva" type="number" class="fin-input" value="0" min="0" step="0.01" oninput="finanzas.actualizarDistribucion()">
                  </div>
                </div>
                <div class="fin-form-group">
                  <label class="fin-label">Resto sin distribuir</label>
                  <div class="fin-input-with-icon">
                    <span>$</span>
                    <input id="inputResto" type="number" class="fin-input" value="0" min="0" step="0.01" disabled>
                  </div>
                </div>
              </div>
            </div>

            <div class="fin-actions">
              <button class="fin-btn fin-btn-primary" onclick="finanzas.guardarCierre()">
                ✓ Guardar Cierre
              </button>
              <button class="fin-btn fin-btn-ghost" onclick="finanzas.volver()">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  `;
}

// Template para ver cierre
function templateVerCierre(cierre) {
  if (!cierre || !cierre.cuadre || !cierre.totales) {
    return `
      <div class="fin-error">
        <p>Error: Datos de cierre incompletos</p>
        <button class="fin-btn fin-btn-ghost" onclick="finanzas.volver()">← Volver</button>
      </div>
    `;
  }

  const t = cierre.totales;
  const d = cierre.dinero_fisico;
  const dist = cierre.distribucion;

  return `
    <div class="fin-view-container">
      <div class="fin-header">
        <h2>Cierre: ${formatFechaDisplay(cierre.fecha_inicio)} - ${formatFechaDisplay(cierre.fecha_fin)}</h2>
        <button class="fin-btn fin-btn-ghost" onclick="finanzas.volver()">← Volver</button>
      </div>

      <div class="fin-card">
        <h3>📊 Totales del Sistema</h3>
        <div class="fin-grid-3">
          <div class="fin-metric">
            <span class="fin-metric-label">Total Facturado</span>
            <span class="fin-metric-value fin-color-blue">$${t.total_facturado}</span>
          </div>
          <div class="fin-metric">
            <span class="fin-metric-label">Ganancia</span>
            <span class="fin-metric-value fin-color-green">$${t.ganancia_total}</span>
          </div>
          <div class="fin-metric">
            <span class="fin-metric-label">Costo</span>
            <span class="fin-metric-value fin-color-red">$${t.costo_total}</span>
          </div>
        </div>
      </div>

      <div class="fin-card">
        <h3>💵 Dinero Físico Ingresado</h3>
        <div class="fin-grid-3">
          <div class="fin-metric">
            <span class="fin-metric-label">Efectivo</span>
            <span class="fin-metric-value">$${d.efectivo}</span>
          </div>
          <div class="fin-metric">
            <span class="fin-metric-label">Cuenta de Ahorro</span>
            <span class="fin-metric-value">$${d.cuenta_ahorro}</span>
          </div>
          <div class="fin-metric">
            <span class="fin-metric-label">Pendientes</span>
            <span class="fin-metric-value">$${d.pendientes}</span>
          </div>
        </div>
      </div>

      <div class="fin-card fin-cuadre-resultado">
        <h3>✅ Cuadre</h3>
        <div class="fin-cuadre-content">
          <div class="fin-cuadre-item">
            <span class="fin-cuadre-label">Debería tener</span>
            <span class="fin-cuadre-value">$${cierre.cuadre.deberia_haber}</span>
          </div>
          <div class="fin-cuadre-item">
            <span class="fin-cuadre-label">Tengo realmente</span>
            <span class="fin-cuadre-value">$${cierre.cuadre.tengo_realmente}</span>
          </div>
          <div class="fin-cuadre-item fin-cuadre-diff">
            <span class="fin-cuadre-label">Diferencia</span>
            <span class="fin-cuadre-value">$${cierre.cuadre.diferencia}</span>
          </div>
        </div>
      </div>

      <div class="fin-card">
        <h3>📊 Distribución de Fondos</h3>
        <div class="fin-grid-3">
          <div class="fin-metric">
            <span class="fin-metric-label">Retiro</span>
            <span class="fin-metric-value">$${dist.retiro_ganancia}</span>
          </div>
          <div class="fin-metric">
            <span class="fin-metric-label">Fondear Inventario</span>
            <span class="fin-metric-value">$${dist.fondear_inventario}</span>
          </div>
          <div class="fin-metric">
            <span class="fin-metric-label">Reserva</span>
            <span class="fin-metric-value">$${dist.reserva}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ===========================
   FUNCIONES DE CONTROL
   ========================= */

const finanzas = {
  // Mostrar lista de cierres
  mostrar: async function (container) {
    container.classList.add("fin-wrapper");
    await obtenerCierres();
    container.innerHTML = templateListaCierres();
    finanzasState.modo = "list";
  },

  // Iniciar nuevo cuadre
  iniciarCuadre: function () {
    finanzasState.modo = "cuadrar";
    const container = document.querySelector(".fin-wrapper");
    container.innerHTML = templateCuadreCaja();
  },

  // Cargar ventas del período
  cargarVentas: async function () {
    const inicio = $("#periodoInicio").value;
    const fin = $("#periodoFin").value;

    if (!inicio || !fin) {
      showToast("Selecciona ambas fechas", "error");
      return;
    }

    if (inicio > fin) {
      showToast("La fecha de inicio debe ser anterior a la fecha de fin", "error");
      return;
    }

    const ventas = await cargarVentasPeriodo(inicio, fin);

    if (ventas.length === 0) {
      showToast("No hay ventas para cuadrar en este período", "warning");
      return;
    }

    finanzasState.periodo = { inicio, fin };
    const totales = calcularTotalesVentas(ventas);

    // Actualizar display de totales
    $("#metricTotal").textContent = `$${money(totales.total_facturado)}`;
    $("#metricDetalleVentas").textContent = `${totales.cantidad_ventas} ventas`;
    $("#metricGanancia").textContent = `$${money(totales.ganancia_total)}`;
    $("#metricCosto").textContent = `$${money(totales.costo_total)}`;

    // Obtener reserva del período anterior
    const reservaAnterior = await obtenerReservaAnterior(inicio);
    finanzasState.datosReales.reserva_anterior = reservaAnterior;
    const inputReservaAnterior = $("#inputReservaAnterior");
    const displayReservaAnterior = $("#displayReservaAnterior");
    if (inputReservaAnterior) {
      inputReservaAnterior.value = reservaAnterior || 0;
      if (displayReservaAnterior) {
        displayReservaAnterior.textContent = `$${money(reservaAnterior || 0)}`;
      }
      console.log('[cargarVentas] Reserva anterior asignada:', reservaAnterior);
    }

    // Mostrar tabla de ventas
    const containerTabla = $("#containerTablaVentas");
    if (containerTabla) {
      containerTabla.innerHTML = templateTablaVentas(ventas);
    }

    // Mostrar secciones
    $("#containerVentas").style.display = "block";
    $("#containerResultado").style.display = "block";
    $("#containerDistribucion").style.display = "block";

    // Actualizar display inicial del cuadre
    this.actualizarCuadre();
  },

  // Actualizar cuadre en tiempo real
  actualizarCuadre: function () {
    finanzasState.datosReales = {
      efectivo: n($("#inputEfectivo")?.value || 0),
      cuenta_ahorro: n($("#inputAhorro")?.value || 0),
      pendientes: n($("#inputPendientes")?.value || 0),
      reserva_anterior: finanzasState.datosReales.reserva_anterior || 0
    };

    const cuadre = calcularCuadre();
    const disponible = calcularDisponible();

    // Mostrar componentes del cuadre desglosados
    const totalFacturado = finanzasState.totalesVentas.total_facturado || 0;
    $("#resultFacturado").textContent = `$${money(totalFacturado)}`;
    $("#resultReservaAnterior").textContent = `$${money(cuadre.reserva_anterior)}`;
    
    // Mostrar resultado total
    $("#resultDeberiaHaber").textContent = `$${money(cuadre.deberia_haber)}`;
    $("#resultTengoRealmente").textContent = `$${money(cuadre.tengo_realmente)}`;
    $("#resultDiferencia").textContent = `$${money(cuadre.diferencia)}`;
    $("#displayDisponible").textContent = `$${money(disponible)}`;

    const statusEl = $("#statusCuadre");
    if (cuadre.cuadra) {
      statusEl.textContent = "✓ CUADRA";
      statusEl.className = "fin-cuadre-status fin-status-ok";
    } else {
      statusEl.textContent = `✗ NO CUADRA - Diferencia: $${money(Math.abs(cuadre.diferencia))}`;
      statusEl.className = "fin-cuadre-status fin-status-error";
    }
  },

  // Actualizar distribución
  actualizarDistribucion: function () {
    const retiro = n($("#inputRetiro")?.value || 0);
    const fondeo = n($("#inputFondeo")?.value || 0);
    const reserva = n($("#inputReserva")?.value || 0);
    const disponible = calcularDisponible();
    const resto = disponible - retiro - fondeo - reserva;

    finanzasState.distribucion = {
      retiro_ganancia: retiro,
      fondear_inventario: fondeo,
      reserva: reserva,
      resto: Math.max(0, resto)
    };

    $("#inputResto").value = money(Math.max(0, resto));
  },

  // Guardar cierre
  guardarCierre: async function () {
    const cuadre = calcularCuadre();

    if (!cuadre.cuadra) {
      showToast("El cuadre no está balanceado. Revisa los valores.", "error");
      return;
    }

    const guardado = await guardarCierreCompleto();

    if (guardado) {
      setTimeout(() => {
        finanzas.volver();
      }, 1000);
    }
  },

  // Ver cierre existente
  verCierre: function (cierreId) {
    const cierre = finanzasState.cierres.find((c) => c.id === cierreId);
    if (!cierre) {
      showToast("Cierre no encontrado", "error");
      return;
    }

    finanzasState.modo = "view";
    const container = document.querySelector(".fin-wrapper");
    container.innerHTML = templateVerCierre(cierre);
  },

  // Volver al listado
  volver: async function () {
    const container = document.querySelector(".fin-wrapper");
    finanzasState.modo = "list";
    await obtenerCierres();
    container.innerHTML = templateListaCierres();
  }
};

// Exportar para acceso global
window.finanzas = finanzas;

/* ===========================
   MONTAJE PRINCIPAL
   ========================= */

async function mountFinanzas(container) {
  finanzas.mostrar(container);
}

export { mountFinanzas };
