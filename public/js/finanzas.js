import { db } from './firebase.js';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const money = (n) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2 }).format(n);

let finanzasState = {
  fechaInicio: '',
  fechaFin: '',
  ventas: [],
  compras: [],
  cierre: {},
  saldoInicial: {
    pendiente: 0,
    disponible: 0,
    total: 0
  },
  distribuciónFondos: {
    idCierre: null,
    fondearCompras: 0,
    retiroGanancias: 0,
    reserva: 0,
    totalDisponible: 0
  }
};

async function calcularSaldoInicial(fechaInicio) {
  try {
    const dateObj = new Date(fechaInicio);
    const mesAnterior = dateObj.getMonth() - 1;
    const anoAnterior = dateObj.getFullYear();
    
    const primerDiaAnterior = new Date(anoAnterior, mesAnterior, 1);
    const ultimoDiaAnterior = new Date(anoAnterior, mesAnterior + 1, 0);
    
    const formato = (d) => d.toISOString().split('T')[0];
    const desdeAnterior = formato(primerDiaAnterior);
    const hastaAnterior = formato(ultimoDiaAnterior);

    const cierresRef = query(
      collection(db, 'CIERRES_FINANZAS'),
      where('periodo', '==', desdeAnterior + ' a ' + hastaAnterior)
    );

    const cierresSnap = await getDocs(cierresRef);
    
    let pendiente = 0;
    let pendienteLiquidado = 0;
    let pendientePendiente = 0;
    let disponible = 0;

    if (cierresSnap.docs.length > 0) {
      const ultimoCierre = cierresSnap.docs[0].data();
      const pendienteOriginal = parseFloat(ultimoCierre.ventas_pendientes_reales) || 0;
      
      // Validar si los pendientes del período anterior fueron liquidados
      const validacion = await validarPendientesLiquidados(desdeAnterior, hastaAnterior, fechaInicio);
      pendienteLiquidado = validacion.liquidado;
      pendientePendiente = validacion.pendiente;
      
      pendiente = pendienteOriginal;
      if (!ultimoCierre.compras_en_periodo) {
        disponible = parseFloat(ultimoCierre.ganancia_disponible) || 0;
      }

      // Agregar distribución de fondos del período anterior
      if (ultimoCierre.distribucion_fondos) {
        const dist = ultimoCierre.distribucion_fondos;
        // Sumar fondos asignados a compras + reserva
        disponible = (parseFloat(dist.fondearCompras) || 0) + (parseFloat(dist.reserva) || 0);
      }
    }

    return {
      pendiente,
      pendienteLiquidado,
      pendientePendiente,
      disponible,
      total: pendiente + disponible
    };
  } catch (error) {
    console.error('Error calculando saldo inicial:', error);
    return { pendiente: 0, pendienteLiquidado: 0, pendientePendiente: 0, disponible: 0, total: 0 };
  }
}

async function validarPendientesLiquidados(desdeAnterior, hastaAnterior, fechaInicio) {
  try {
    // Obtener el cierre del período anterior
    const cierresRef = query(
      collection(db, 'CIERRES_FINANZAS'),
      where('periodo', '==', desdeAnterior + ' a ' + hastaAnterior)
    );
    const cierresSnap = await getDocs(cierresRef);
    
    if (cierresSnap.docs.length === 0) {
      return { liquidado: 0, pendiente: 0 };
    }
    
    const ultimoCierre = cierresSnap.docs[0].data();
    const pendientesAnterior = parseFloat(ultimoCierre.ventas_pendientes_reales) || 0;
    
    // Buscar en las ventas del período actual que tengan referencia al período anterior
    const fechaActual = new Date(fechaInicio);
    const fin = new Date(fechaActual);
    fin.setMonth(fin.getMonth() + 1);
    fin.setDate(0); // Último día del mes actual
    
    const formato = (d) => d.toISOString().split('T')[0];
    const desdeActual = formato(fechaActual);
    const hastaActual = formato(fin);
    
    const ventasRef = collection(db, 'VENTAS');
    const snapVentas = await getDocs(ventasRef);
    
    let liquidadoEnPeriodoActual = 0;
    let pendienteAun = 0;
    
    snapVentas.docs.forEach(doc => {
      const venta = doc.data();
      const fecha = (venta.fecha || '').toString();
      
      // Contar ventas del período actual con estado liquidación SI (que líquidan los pendientes anteriores)
      if (fecha >= desdeActual && fecha <= hastaActual && 
          venta.estado_venta === 'VENTA FINALIZADA' && 
          venta.estado_liquidacion === 'SI') {
        const precio = parseFloat(venta.precio_producto) || 0;
        liquidadoEnPeriodoActual += precio;
      }
    });
    
    // Determinar cuánto se liquidó del período anterior
    liquidadoEnPeriodoActual = Math.min(liquidadoEnPeriodoActual, pendientesAnterior);
    pendienteAun = Math.max(0, pendientesAnterior - liquidadoEnPeriodoActual);
    
    return {
      liquidado: liquidadoEnPeriodoActual,
      pendiente: pendienteAun
    };
  } catch (error) {
    console.error('Error validando pendientes:', error);
    return { liquidado: 0, pendiente: 0 };
  }
}

async function cargarFechaUltimoCorte() {
  try {
    const snap = await getDocs(collection(db, 'CIERRES_FINANZAS'));
    const cierres = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));

    if (cierres.length > 0) {
      const ultimoCierre = cierres[0];
      const fecha = new Date(ultimoCierre.fecha_cierre);
      const fechaFormato = fecha.toLocaleDateString('es-CO', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      document.getElementById('ultimoCorte').textContent = fechaFormato;
    }
  } catch (error) {
    console.error('Error cargando fecha del último corte:', error);
  }
}

async function verificarComprasEnPeriodo(fechaInicio, fechaFin) {
  try {
    const comprasRef = query(
      collection(db, 'COMPRAS'),
      where('fecha', '>=', fechaInicio),
      where('fecha', '<=', fechaFin)
    );
    
    const snap = await getDocs(comprasRef);
    return snap.docs.length > 0;
  } catch (error) {
    console.error('Error verificando compras:', error);
    return false;
  }
}

async function cargarCuadre() {
  try {
    const inicio = document.getElementById('fechaInicio').value;
    const fin = document.getElementById('fechaFin').value;

    if (!inicio || !fin) {
      alert('Selecciona fecha inicio y fin');
      return;
    }

    finanzasState.fechaInicio = inicio;
    finanzasState.fechaFin = fin;

    const ventasRef = collection(db, 'VENTAS');
    const snapVentas = await getDocs(ventasRef);
    finanzasState.ventas = snapVentas.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(v => {
        const fecha = (v.fecha || '').toString();
        return fecha >= inicio && fecha <= fin && v.estado_venta === 'VENTA FINALIZADA';
      });

    console.log('[Finanzas] Ventas cargadas:', finanzasState.ventas.length);

    let ventasLiquidadas = 0;
    let ventasPendientes = 0;
    let cantLiquidadas = 0;
    let cantPendientes = 0;
    let gananciaTotal = 0;

    finanzasState.ventas.forEach(v => {
      const precio = parseFloat(v.precio_producto) || 0;
      const ganancia = parseFloat(v.ganancia) || 0;
      gananciaTotal += ganancia;

      if (v.estado_liquidacion === 'SI') {
        ventasLiquidadas += precio;
        cantLiquidadas++;
      } else if (v.estado_liquidacion === 'NO') {
        ventasPendientes += precio;
        cantPendientes++;
      }
    });

    const totalFacturado = ventasLiquidadas + ventasPendientes;
    const costoInventario = totalFacturado - gananciaTotal;

    const huboCompras = await verificarComprasEnPeriodo(inicio, fin);
    const saldoInicial = await calcularSaldoInicial(inicio);

    finanzasState.cierre = {
      totalFacturado,
      gananciaTotal,
      costoInventario,
      ventasLiquidadas,
      ventasPendientes,
      cantLiquidadas,
      cantPendientes,
      saldoInicial,
      compras_en_periodo: huboCompras
    };

    document.getElementById('resumenEsperado').style.display = 'block';
    document.getElementById('cuadreValores').style.display = 'block';
    document.getElementById('desgloseEstado').style.display = 'block';
    if (saldoInicial.total > 0) {
      document.getElementById('saldoInicial').style.display = 'block';
    }
    document.getElementById('btnGuardarCuadre').style.display = 'block';

    // Mostrar desglose de pendiente liquidar periodo anterior
    document.getElementById('pendienteLiquidarAnterior').textContent = '$' + money(saldoInicial.pendiente);
    document.getElementById('pendienteLiquidadoEnActual').textContent = '$' + money(saldoInicial.pendienteLiquidado);
    document.getElementById('pendienteAunPor').textContent = '$' + money(saldoInicial.pendientePendiente);
    document.getElementById('disponibleComprasAnterior').textContent = '$' + money(saldoInicial.disponible);
    document.getElementById('saldoInicialTotal').textContent = '$' + money(saldoInicial.total);

    document.getElementById('totalFacturado').textContent = '$' + money(totalFacturado);
    document.getElementById('gananciaTotalDisponible').textContent = '$' + money(gananciaTotal);
    document.getElementById('costoInventarioReservado').textContent = '$' + money(costoInventario);
    document.getElementById('cantVentas').textContent = finanzasState.ventas.length;

    document.getElementById('ventasLiquidadas').textContent = '$' + money(ventasLiquidadas);
    document.getElementById('cantLiquidadas').textContent = cantLiquidadas + ' ventas';
    document.getElementById('ventasPendientes').textContent = '$' + money(ventasPendientes);
    document.getElementById('cantPendientes').textContent = cantPendientes + ' ventas';

    // Cargar fecha del último corte
    cargarFechaUltimoCorte();

    document.getElementById('liquidadoEsperadoInput').value = '$' + money(ventasLiquidadas);
    document.getElementById('pendienteEsperadoInput').value = '$' + money(ventasPendientes);
    document.getElementById('totalEsperado').value = '$' + money(totalFacturado);

    // Llenar inputs reales (pendiente se llena automáticamente, pero es editable)
    document.getElementById('efectivoReal').value = '';
    document.getElementById('cuentaAhorroReal').value = '';
    document.getElementById('pendienteReal').value = ventasPendientes.toFixed(2);
    document.getElementById('gastosOperativosReal').value = '';
    document.getElementById('efectivoReal').addEventListener('input', calcularDiferencias);
    document.getElementById('cuentaAhorroReal').addEventListener('input', calcularDiferencias);
    document.getElementById('pendienteReal').addEventListener('input', calcularDiferencias);
    document.getElementById('gastosOperativosReal').addEventListener('input', calcularDiferencias);

    cargarCierresHistoricos();

  } catch (err) {
    console.error('Error cargando cuadre:', err);
    alert('Error: ' + err.message);
  }
}

function calcularDiferencias() {
  const efectivoReal = parseFloat(document.getElementById('efectivoReal').value) || 0;
  const cuentaAhorroReal = parseFloat(document.getElementById('cuentaAhorroReal').value) || 0;
  const pendienteReal = parseFloat(document.getElementById('pendienteReal').value) || 0;
  const gastosOperativosReal = parseFloat(document.getElementById('gastosOperativosReal').value) || 0;
  const totalReal = efectivoReal + cuentaAhorroReal + pendienteReal + gastosOperativosReal;

  const liquidadoEsp = finanzasState.cierre.ventasLiquidadas;
  const pendienteEsp = finanzasState.cierre.ventasPendientes;
  const totalEsp = finanzasState.cierre.totalFacturado;

  const difLiquidado = (efectivoReal + cuentaAhorroReal) - liquidadoEsp;
  const difPendiente = pendienteReal - pendienteEsp;
  const difTotal = totalReal - totalEsp;

  document.getElementById('difLiquidado').textContent = '$' + money(difLiquidado);
  document.getElementById('difPendiente').textContent = '$' + money(difPendiente);
  document.getElementById('difTotal').textContent = '$' + money(difTotal);
  document.getElementById('totalReal').value = '$' + money(totalReal);

  document.getElementById('difLiquidado').style.color = difLiquidado >= 0 ? '#4caf50' : '#f44336';
  document.getElementById('difPendiente').style.color = difPendiente >= 0 ? '#4caf50' : '#f44336';
  document.getElementById('difTotal').style.color = difTotal >= 0 ? '#4caf50' : '#f44336';
}

async function guardarCierre() {
  try {
    if (!finanzasState.cierre.totalFacturado) {
      mostrarMensajeExito('Carga los datos del cuadre primero', false);
      return;
    }

    const periodo = finanzasState.fechaInicio + ' a ' + finanzasState.fechaFin;
    const efectivoReal = parseFloat(document.getElementById('efectivoReal').value) || 0;
    const cuentaAhorroReal = parseFloat(document.getElementById('cuentaAhorroReal').value) || 0;
    const pendienteReal = parseFloat(document.getElementById('pendienteReal').value) || 0;
    const gastosOperativosReal = parseFloat(document.getElementById('gastosOperativosReal').value) || 0;
    const totalReal = efectivoReal + cuentaAhorroReal + pendienteReal + gastosOperativosReal;

    const cierre = {
      periodo,
      fecha_cierre: new Date().toISOString().split('T')[0],
      ventas_liquidadas_esperadas: finanzasState.cierre.ventasLiquidadas,
      ventas_pendientes_esperadas: finanzasState.cierre.ventasPendientes,
      total_facturado_esperado: finanzasState.cierre.totalFacturado,
      ganancia_disponible: finanzasState.cierre.gananciaTotal,
      costo_inventario_reservado: finanzasState.cierre.costoInventario,
      efectivo_reales: efectivoReal,
      cuenta_ahorro_reales: cuentaAhorroReal,
      ventas_pendientes_reales: pendienteReal,
      gastos_operativos_reales: gastosOperativosReal,
      total_facturado_real: totalReal,
      diferencia_efectivo_ahorro: (efectivoReal + cuentaAhorroReal) - finanzasState.cierre.ventasLiquidadas,
      diferencia_pendiente: pendienteReal - finanzasState.cierre.ventasPendientes,
      diferencia_total: totalReal - finanzasState.cierre.totalFacturado,
      cant_ventas: finanzasState.ventas.length,
      cant_liquidadas: finanzasState.cierre.cantLiquidadas,
      cant_pendientes: finanzasState.cierre.cantPendientes,
      saldo_inicial_pendiente: finanzasState.cierre.saldoInicial.pendiente,
      saldo_inicial_pendiente_liquidado: finanzasState.cierre.saldoInicial.pendienteLiquidado,
      saldo_inicial_pendiente_aun_por_liquidar: finanzasState.cierre.saldoInicial.pendientePendiente,
      saldo_inicial_disponible: finanzasState.cierre.saldoInicial.disponible,
      compras_en_periodo: finanzasState.cierre.compras_en_periodo
    };

    if (finanzasState.editandoCierre && finanzasState.editandoCierreId) {
      // Actualizar cierre existente
      await updateDoc(doc(db, 'CIERRES_FINANZAS', finanzasState.editandoCierreId), cierre);
      mostrarMensajeExito('✓ Cierre actualizado correctamente', true);
      finanzasState.editandoCierre = false;
      finanzasState.editandoCierreId = null;
      
      // Restaurar botón guardar
      const btnGuardar = document.getElementById('btnGuardarCuadre');
      btnGuardar.textContent = '💾 Guardar Cierre';
      btnGuardar.style.background = '#4caf50';
    } else {
      // Crear nuevo cierre
      await addDoc(collection(db, 'CIERRES_FINANZAS'), cierre);
      mostrarMensajeExito('✓ Cierre guardado correctamente', true);
    }
    
    cargarCierresHistoricos();

  } catch (err) {
    console.error('Error guardando cierre:', err);
    mostrarMensajeExito('Error: ' + err.message, false);
  }
}

async function distribuirFondosPorID(cierreId) {
  try {
    const cierreDoc = await getDoc(doc(db, 'CIERRES_FINANZAS', cierreId));
    if (!cierreDoc.exists()) {
      mostrarMensajeExito('Cierre no encontrado', false);
      return;
    }
    
    const cierre = cierreDoc.data();
    cierre.id = cierreId;
    
    abrirDistribucionFondos(cierreId, cierre);
  } catch (err) {
    console.error('Error obteniendo cierre:', err);
    mostrarMensajeExito('Error al cargar cierre', false);
  }
}

async function abrirDistribucionFondos(cierreId, cierre) {
  try {
    // Calcular total disponible a distribuir
    const gananciaDisponible = parseFloat(cierre.ganancia_disponible) || 0;
    const saldoDisponible = parseFloat(cierre.saldo_inicial_disponible) || 0;
    const totalDisponible = gananciaDisponible + saldoDisponible;

    finanzasState.distribuciónFondos.idCierre = cierreId;
    finanzasState.distribuciónFondos.totalDisponible = totalDisponible;

    // Cargar distribución anterior si existe
    const distribucionAnterior = cierre.distribucion_fondos || null;

    // Mostrar modal de distribución
    const modalHTML = `
      <div id="modalDistribucion" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
        <div style="background:#fff;border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.15);">
          <h2 style="margin:0 0 20px 0;color:#333;font-size:18px;display:flex;align-items:center;gap:8px;">
            💰 Distribuir Fondos - ${cierre.periodo}
          </h2>

          <div style="background:#f9f9f9;padding:14px;border-radius:8px;margin-bottom:20px;border-left:4px solid #2196f3;">
            <div style="font-size:11px;color:#666;margin-bottom:4px;">Total disponible a distribuir:</div>
            <div style="font-size:24px;font-weight:700;color:#2196f3;">$${money(totalDisponible)}</div>
            <div style="font-size:10px;color:#999;margin-top:8px;">
              Ganancia: $${money(gananciaDisponible)} + Saldo anterior: $${money(saldoDisponible)}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            <div style="background:#fff;padding:14px;border-radius:8px;border:2px solid #4caf50;">
              <label style="display:block;font-size:11px;font-weight:600;color:#4caf50;margin-bottom:8px;">
                🏦 Fondear Cuenta para Compras
              </label>
              <input type="number" id="fondearCompras" placeholder="0.00" step="0.01" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:12px;box-sizing:border-box;" value="${distribucionAnterior?.fondearCompras || 0}"/>
              <div style="font-size:9px;color:#999;margin-top:4px;">Se usa en próximo período</div>
            </div>

            <div style="background:#fff;padding:14px;border-radius:8px;border:2px solid #f44336;">
              <label style="display:block;font-size:11px;font-weight:600;color:#f44336;margin-bottom:8px;">
                💸 Retiro de Ganancias
              </label>
              <input type="number" id="retiroGanancias" placeholder="0.00" step="0.01" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:12px;box-sizing:border-box;" value="${distribucionAnterior?.retiroGanancias || 0}"/>
              <div style="font-size:9px;color:#999;margin-top:4px;">Sale del negocio</div>
            </div>

            <div style="background:#fff;padding:14px;border-radius:8px;border:2px solid #ff9800;grid-column:1/-1;">
              <label style="display:block;font-size:11px;font-weight:600;color:#ff9800;margin-bottom:8px;">
                🔒 Reserva
              </label>
              <input type="number" id="reserva" placeholder="0.00" step="0.01" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:12px;box-sizing:border-box;" value="${distribucionAnterior?.reserva || 0}" readonly/>
              <div style="font-size:9px;color:#999;margin-top:4px;">Se calcula automáticamente. Será saldo inicial del próximo período</div>
            </div>
          </div>

          <div style="background:linear-gradient(135deg,#e3f2fd 0%,#f3e5f5 100%);padding:14px;border-radius:8px;margin-bottom:20px;border:1px solid #bbdefb;">
            <div style="font-size:10px;color:#666;margin-bottom:8px;font-weight:600;">📊 RESUMEN DE DISTRIBUCIÓN:</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:11px;">
              <div style="background:#fff;padding:8px;border-radius:4px;border-left:3px solid #4caf50;">
                <div style="color:#999;font-size:9px;">Compras</div>
                <div id="montoFondear" style="font-weight:700;color:#4caf50;">$0.00</div>
              </div>
              <div style="background:#fff;padding:8px;border-radius:4px;border-left:3px solid #f44336;">
                <div style="color:#999;font-size:9px;">Retiros</div>
                <div id="montoRetiro" style="font-weight:700;color:#f44336;">$0.00</div>
              </div>
              <div style="background:#fff;padding:8px;border-radius:4px;border-left:3px solid #ff9800;">
                <div style="color:#999;font-size:9px;">Reserva</div>
                <div id="montoReserva" style="font-weight:700;color:#ff9800;">$0.00</div>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button onclick="cerrarModalDistribucion()" style="padding:10px 16px;background:#e0e0e0;color:#333;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">Cancelar</button>
            <button onclick="guardarDistribucionFondos()" style="padding:10px 16px;background:#4caf50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">✓ Guardar Distribución</button>
          </div>
        </div>
      </div>
    `;

    // Agregar modal al DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Agregar event listeners para calcular reserva automáticamente
    document.getElementById('fondearCompras').addEventListener('input', calcularReservaDinamica);
    document.getElementById('retiroGanancias').addEventListener('input', calcularReservaDinamica);

    // Calcular inicial
    calcularReservaDinamica();

  } catch (err) {
    console.error('Error abriendo distribución de fondos:', err);
    alert('Error: ' + err.message);
  }
}

function calcularReservaDinamica() {
  const totalDisponible = finanzasState.distribuciónFondos.totalDisponible;
  const fondear = parseFloat(document.getElementById('fondearCompras').value) || 0;
  const retiro = parseFloat(document.getElementById('retiroGanancias').value) || 0;
  const reserva = Math.max(0, totalDisponible - fondear - retiro);

  document.getElementById('reserva').value = reserva.toFixed(2);
  
  // Actualizar resumen visual
  document.getElementById('montoFondear').textContent = '$' + money(fondear);
  document.getElementById('montoRetiro').textContent = '$' + money(retiro);
  document.getElementById('montoReserva').textContent = '$' + money(reserva);

  // Validar que no se distribuya más de lo disponible
  if (fondear + retiro > totalDisponible) {
    document.getElementById('montoReserva').style.color = '#f44336';
    document.querySelector('button:contains("Guardar")') && (document.querySelector('button:contains("Guardar")').disabled = true);
  } else {
    document.getElementById('montoReserva').style.color = '#ff9800';
  }
}

function cerrarModalDistribucion() {
  const modal = document.getElementById('modalDistribucion');
  if (modal) modal.remove();
}

async function guardarDistribucionFondos() {
  try {
    const cierreId = finanzasState.distribuciónFondos.idCierre;
    const fondear = parseFloat(document.getElementById('fondearCompras').value) || 0;
    const retiro = parseFloat(document.getElementById('retiroGanancias').value) || 0;
    const reserva = parseFloat(document.getElementById('reserva').value) || 0;

    if (!cierreId) {
      mostrarMensajeExito('Error: No se encontró el cierre', false);
      return;
    }

    // Guardar distribución en el cierre
    const distribucion = {
      fondearCompras: fondear,
      retiroGanancias: retiro,
      reserva: reserva,
      fechaDistribucion: new Date().toISOString().split('T')[0]
    };

    await updateDoc(doc(db, 'CIERRES_FINANZAS', cierreId), {
      distribucion_fondos: distribucion
    });

    mostrarMensajeExito('✓ Distribución de fondos guardada correctamente', true);
    cerrarModalDistribucion();
    cargarCierresHistoricos();

  } catch (err) {
    console.error('Error guardando distribución de fondos:', err);
    mostrarMensajeExito('Error: ' + err.message, false);
  }
}

async function cargarCierresHistoricos() {
  try {
    const snap = await getDocs(collection(db, 'CIERRES_FINANZAS'));
    let cierres = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));

    // Por defecto mostrar solo mes actual
    const verTodos = document.getElementById('verTodosCierres');
    if (!verTodos.checked) {
      const ahora = new Date();
      const mesActual = ahora.getMonth();
      const anoActual = ahora.getFullYear();
      cierres = cierres.filter(c => {
        const fecha = new Date(c.fecha_cierre);
        return fecha.getMonth() === mesActual && fecha.getFullYear() === anoActual;
      });
    }

    const rowsDiv = document.getElementById('rowsCierres');
    if (!rowsDiv) return;
    
    rowsDiv.innerHTML = '';

    if (cierres.length === 0) {
      rowsDiv.innerHTML = '<div style="padding:16px;text-align:center;color:#999;grid-column:1/-1;">No hay cierres</div>';
      return;
    }

    cierres.forEach(cierre => {
      const dif = cierre.diferencia_total;
      const difColor = dif >= 0 ? '#4caf50' : '#f44336';
      const tieneAlerta = Math.abs(dif) > 10000;
      const textoEstado = tieneAlerta ? '⚠️ ALERTA' : '✓ OK';
      const colorEstado = tieneAlerta ? '#f44336' : '#4caf50';

      const fecha = new Date(cierre.fecha_cierre);
      const fechaFormato = fecha.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });

      const row = document.createElement('div');
      row.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 0.9fr 0.9fr 0.9fr 0.9fr 1fr 0.9fr 0.9fr 1fr 0.9fr 0.8fr 0.8fr 1.2fr;
        gap: 0;
        border-bottom: 1px solid #eee;
        background: #fff;
        font-size: 11px;
      `;

      row.onmouseover = () => row.style.background = '#f9f9f9';
      row.onmouseout = () => row.style.background = '#fff';

      row.innerHTML = `
        <div style="padding:12px 10px;border-right:1px solid #eee;font-weight:600;color:#2196f3;">${cierre.periodo}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;color:#999;font-size:10px;">${fechaFormato}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;font-weight:600;">$${money(cierre.total_facturado_esperado)}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;font-weight:600;">$${money(cierre.total_facturado_real)}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;font-weight:700;color:${difColor};">$${money(dif)}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;font-weight:600;color:#4caf50;">$${money(cierre.ganancia_disponible)}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;color:#666;">$${money(cierre.efectivo_reales)}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;color:#666;">$${money(cierre.cuenta_ahorro_reales)}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;color:#ff9800;font-weight:600;">$${money(cierre.ventas_pendientes_reales)}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;color:#666;">$${money(cierre.gastos_operativos_reales)}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;font-weight:600;color:#666;">${cierre.cant_ventas || 0}</div>
        <div style="padding:12px 10px;border-right:1px solid #eee;color:${colorEstado};font-weight:700;">${textoEstado}</div>
        <div style="padding:12px 8px;display:flex;gap:3px;justify-content:center;align-items:center;flex-wrap:wrap;">
          <button style="background:#2196f3;color:#fff;border:none;padding:5px 7px;cursor:pointer;font-size:8px;font-weight:600;border-radius:3px;transition:background 0.2s;white-space:nowrap;" onmouseover="this.style.background='#1976d2'" onmouseout="this.style.background='#2196f3'" onclick="distribuirFondosPorID('${cierre.id}')">💵 Dist</button>
          <button style="background:#ff9800;color:#fff;border:none;padding:5px 7px;cursor:pointer;font-size:8px;font-weight:600;border-radius:3px;transition:background 0.2s;white-space:nowrap;" onmouseover="this.style.background='#f57c00'" onmouseout="this.style.background='#ff9800'" onclick="editarCierre('${cierre.id}')">✎ Edit</button>
          <button style="background:#f44336;color:#fff;border:none;padding:5px 7px;cursor:pointer;font-size:8px;font-weight:600;border-radius:3px;transition:background 0.2s;white-space:nowrap;" onmouseover="this.style.background='#d32f2f'" onmouseout="this.style.background='#f44336'" onclick="eliminarCierre('${cierre.id}')">⏹ Del</button>
        </div>
      `;

      rowsDiv.appendChild(row);
    });

  } catch (err) {
    console.error('Error cargando cierres:', err);
  }
}

async function inicializarFechasDefault() {
  try {
    const snap = await getDocs(collection(db, 'CIERRES_FINANZAS'));
    const cierres = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));

    if (cierres.length > 0) {
      const ultimoCierre = cierres[0];
      const ultimaFecha = new Date(ultimoCierre.fecha_cierre);
      const diaAdelante = new Date(ultimaFecha);
      diaAdelante.setDate(diaAdelante.getDate() + 1);
      
      const formato = (d) => d.toISOString().split('T')[0];
      document.getElementById('fechaInicio').value = formato(diaAdelante);
      document.getElementById('fechaFin').value = formato(new Date());
    } else {
      const hoy = new Date();
      const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const formato = (d) => d.toISOString().split('T')[0];
      document.getElementById('fechaInicio').value = formato(primerDia);
      document.getElementById('fechaFin').value = formato(hoy);
    }
    
    // Cargar tabla inicial
    cargarCierresHistoricos();
  } catch (err) {
    console.error('Error inicializando fechas:', err);
  }
}

async function eliminarCierre(id) {
  if (!confirm('¿Eliminar este cierre?')) return;

  try {
    await deleteDoc(doc(db, 'CIERRES_FINANZAS', id));
    cargarCierresHistoricos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function editarCierre(id) {
  try {
    const cierreDoc = await getDoc(doc(db, 'CIERRES_FINANZAS', id));
    if (!cierreDoc.exists()) {
      mostrarMensajeExito('Cierre no encontrado', false);
      return;
    }
    
    const cierre = cierreDoc.data();
    
    // Mostrar el formulario
    document.getElementById('cuadreValores').style.display = 'block';
    document.getElementById('desgloseEstado').style.display = 'block';
    document.getElementById('resumenEsperado').style.display = 'block';
    if ((cierre.saldo_inicial_pendiente || 0) > 0) {
      document.getElementById('saldoInicial').style.display = 'block';
    }
    
    // Cargar las fechas desde el período guardado (formato: "YYYY-MM-DD a YYYY-MM-DD")
    if (cierre.periodo) {
      const [fechaIni, fechaFin] = cierre.periodo.split(' a ');
      document.getElementById('fechaInicio').value = fechaIni || '';
      document.getElementById('fechaFin').value = fechaFin || '';
    }
    
    // Rellenar los campos de ESPERADO (readonly)
    document.getElementById('liquidadoEsperadoInput').value = '$' + money(cierre.ventas_liquidadas_esperadas || 0);
    document.getElementById('pendienteEsperadoInput').value = '$' + money(cierre.ventas_pendientes_esperadas || 0);
    document.getElementById('totalEsperado').value = '$' + money(cierre.total_facturado_esperado || 0);
    
    // Rellenar los campos de REAL (editable)
    document.getElementById('efectivoReal').value = cierre.efectivo_reales || '';
    document.getElementById('cuentaAhorroReal').value = cierre.cuenta_ahorro_reales || '';
    document.getElementById('pendienteReal').value = cierre.ventas_pendientes_reales || '';
    document.getElementById('gastosOperativosReal').value = cierre.gastos_operativos_reales || '';
    
    // Actualizar el total real
    const totalReal = (parseFloat(cierre.efectivo_reales) || 0) + 
                      (parseFloat(cierre.cuenta_ahorro_reales) || 0) + 
                      (parseFloat(cierre.ventas_pendientes_reales) || 0) + 
                      (parseFloat(cierre.gastos_operativos_reales) || 0);
    document.getElementById('totalReal').value = '$' + money(totalReal);
    
    // Cargar el saldo inicial con desglose
    document.getElementById('pendienteLiquidarAnterior').textContent = '$' + money(cierre.saldo_inicial_pendiente || 0);
    document.getElementById('pendienteLiquidadoEnActual').textContent = '$' + money(cierre.saldo_inicial_pendiente_liquidado || 0);
    document.getElementById('pendienteAunPor').textContent = '$' + money(cierre.saldo_inicial_pendiente_aun_por_liquidar || 0);
    document.getElementById('disponibleComprasAnterior').textContent = '$' + money(cierre.saldo_inicial_disponible || 0);
    document.getElementById('saldoInicialTotal').textContent = '$' + money((cierre.saldo_inicial_pendiente || 0) + (cierre.saldo_inicial_disponible || 0));
    
    // Cargar el desglose de estado
    document.getElementById('ventasLiquidadas').textContent = '$' + money(cierre.ventas_liquidadas_esperadas || 0);
    document.getElementById('cantLiquidadas').textContent = (cierre.cant_liquidadas || 0) + ' ventas';
    document.getElementById('ventasPendientes').textContent = '$' + money(cierre.ventas_pendientes_esperadas || 0);
    document.getElementById('cantPendientes').textContent = (cierre.cant_pendientes || 0) + ' ventas';
    
    // Cargar resumen esperado
    document.getElementById('totalFacturado').textContent = '$' + money(cierre.total_facturado_esperado || 0);
    document.getElementById('gananciaTotalDisponible').textContent = '$' + money(cierre.ganancia_disponible || 0);
    document.getElementById('costoInventarioReservado').textContent = '$' + money(cierre.costo_inventario_reservado || 0);
    document.getElementById('cantVentas').textContent = cierre.cant_ventas || 0;
    
    // Calcular y mostrar diferencias
    const difLiquidado = (parseFloat(cierre.efectivo_reales) || 0) - (parseFloat(cierre.ventas_liquidadas_esperadas) || 0);
    const difPendiente = (parseFloat(cierre.ventas_pendientes_reales) || 0) - (parseFloat(cierre.ventas_pendientes_esperadas) || 0);
    const difTotal = cierre.diferencia_total || 0;
    
    document.getElementById('difLiquidado').textContent = '$' + money(difLiquidado);
    document.getElementById('difPendiente').textContent = '$' + money(difPendiente);
    document.getElementById('difTotal').textContent = '$' + money(difTotal);
    document.getElementById('difTotal').style.color = Math.abs(difTotal) > 10000 ? '#f44336' : '#4caf50';
    
    // Guardar el ID del cierre siendo editado
    finanzasState.editandoCierreId = id;
    finanzasState.editandoCierre = true;
    
    // Cambiar el texto del botón guardar
    const btnGuardar = document.getElementById('btnGuardarCuadre');
    btnGuardar.textContent = '✏️ Actualizar Cierre';
    btnGuardar.style.background = '#ff9800';
    btnGuardar.style.display = 'block';
    
    // Desplazar hasta el formulario
    document.getElementById('cuadreValores').scrollIntoView({ behavior: 'smooth' });
    mostrarMensajeExito('Editando cierre - Realiza cambios y guarda', true);
    
  } catch (err) {
    console.error('Error editando cierre:', err);
    mostrarMensajeExito('Error al cargar cierre para editar', false);
  }
}

function mostrarMensajeExito(mensaje, esExito) {
  const etiquetaMensaje = document.getElementById('etiquetaMensaje');
  if (!etiquetaMensaje) return;
  
  etiquetaMensaje.textContent = mensaje;
  etiquetaMensaje.style.color = esExito ? '#4caf50' : '#f44336';
  etiquetaMensaje.style.display = 'block';
  
  setTimeout(() => {
    etiquetaMensaje.style.display = 'none';
  }, 4000);
}

function limpiarFormulario() {
  document.getElementById('fechaInicio').value = '';
  document.getElementById('fechaFin').value = '';
  document.getElementById('resumenEsperado').style.display = 'none';
  document.getElementById('cuadreValores').style.display = 'none';
  document.getElementById('saldoInicial').style.display = 'none';
  document.getElementById('desgloseEstado').style.display = 'none';
  document.getElementById('historicoCierres').style.display = 'none';
}

function mountFinanzas(container) {
  container.innerHTML = `
    <div class="dc-container" style="padding:16px;">
      <h2 style="margin:0 0 16px 0;">💰 FINANZAS - CUADRE DE CAJA</h2>

      <div style="background:#f9f9f9;padding:12px;border-radius:8px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:flex-end;">
        <div>
          <label style="display:block;font-size:10px;color:#666;margin-bottom:4px;font-weight:600;">DESDE</label>
          <input type="date" id="fechaInicio" class="dc-input" style="font-size:11px;"/>
        </div>
        <div>
          <label style="display:block;font-size:10px;color:#666;margin-bottom:4px;font-weight:600;">HASTA</label>
          <input type="date" id="fechaFin" class="dc-input" style="font-size:11px;"/>
        </div>
        <button id="btnCargarCuadre" class="dc-btn" style="background:#2196f3;">Cargar Cuadre</button>
      </div>

      <div id="etiquetaMensaje" style="display:none;padding:12px;border-radius:8px;margin-bottom:16px;font-weight:600;text-align:center;background:#f0f0f0;"></div>

      <div id="saldoInicial" style="display:none;background:linear-gradient(135deg,#2196f3 0%,#1976d2 100%);color:#fff;padding:14px;border-radius:8px;margin-bottom:12px;">
        <h3 style="margin:0 0 12px 0;font-size:12px;font-weight:600;">💳 SALDO INICIAL (ARRASTRADO)</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:11px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.3);">
          <div style="background:rgba(255,255,255,0.1);padding:10px;border-radius:4px;">
            <div style="opacity:0.9;font-size:10px;">📦 Total pendiente anterior</div>
            <div id="pendienteLiquidarAnterior" style="font-size:14px;font-weight:700;margin-top:4px;">$0.00</div>
          </div>
          <div style="background:rgba(76,175,80,0.2);padding:10px;border-radius:4px;">
            <div style="opacity:0.9;font-size:10px;">✓ Liquidado en este período</div>
            <div id="pendienteLiquidadoEnActual" style="font-size:14px;font-weight:700;margin-top:4px;">$0.00</div>
          </div>
          <div style="background:rgba(255,193,7,0.2);padding:10px;border-radius:4px;">
            <div style="opacity:0.9;font-size:10px;">⏳ Aún pendiente por liquidar</div>
            <div id="pendienteAunPor" style="font-size:14px;font-weight:700;margin-top:4px;">$0.00</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:11px;">
          <div>
            <div style="opacity:0.9;">Disponible para compras (no usado)</div>
            <div id="disponibleComprasAnterior" style="font-size:16px;font-weight:700;">$0.00</div>
          </div>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.3);text-align:right;">
          <div style="font-size:10px;opacity:0.9;">TOTAL SALDO INICIAL</div>
          <div id="saldoInicialTotal" style="font-size:18px;font-weight:700;">$0.00</div>
        </div>
      </div>

      <div id="resumenEsperado" style="display:none;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
          <div style="background:linear-gradient(135deg,#4caf50 0%,#388e3c 100%);color:#fff;padding:16px;border-radius:8px;">
            <div style="font-size:9px;opacity:0.9;margin-bottom:8px;font-weight:600;">TOTAL FACTURADO</div>
            <div id="totalFacturado" style="font-size:22px;font-weight:700;margin-bottom:6px;">$0.00</div>
            <div style="font-size:9px;opacity:0.8;">Ingresos</div>
          </div>
          <div style="background:linear-gradient(135deg,#2196f3 0%,#1976d2 100%);color:#fff;padding:16px;border-radius:8px;">
            <div style="font-size:9px;opacity:0.9;margin-bottom:8px;font-weight:600;">GANANCIA DISPONIBLE</div>
            <div id="gananciaTotalDisponible" style="font-size:22px;font-weight:700;margin-bottom:6px;">$0.00</div>
            <div style="font-size:9px;opacity:0.8;">Por distribuir</div>
          </div>
          <div style="background:linear-gradient(135deg,#ff9800 0%,#f57c00 100%);color:#fff;padding:16px;border-radius:8px;">
            <div style="font-size:9px;opacity:0.9;margin-bottom:8px;font-weight:600;">COSTO INVENTARIO</div>
            <div id="costoInventarioReservado" style="font-size:22px;font-weight:700;margin-bottom:6px;">$0.00</div>
            <div style="font-size:9px;opacity:0.8;">Reservado</div>
          </div>
          <div style="background:linear-gradient(135deg,#9c27b0 0%,#7b1fa2 100%);color:#fff;padding:16px;border-radius:8px;">
            <div style="font-size:9px;opacity:0.9;margin-bottom:8px;font-weight:600;">CANTIDAD VENTAS</div>
            <div id="cantVentas" style="font-size:22px;font-weight:700;margin-bottom:6px;">0</div>
            <div style="font-size:9px;opacity:0.8;">Transacciones</div>
          </div>
          <div style="background:linear-gradient(135deg,#e91e63 0%,#c2185b 100%);color:#fff;padding:16px;border-radius:8px;">
            <div style="font-size:9px;opacity:0.9;margin-bottom:8px;font-weight:600;">ÚLTIMO CORTE</div>
            <div id="ultimoCorte" style="font-size:16px;font-weight:700;margin-bottom:6px;">--</div>
            <div style="font-size:9px;opacity:0.8;">Fecha</div>
          </div>
        </div>
      </div>

      <div id="desgloseEstado" style="display:none;background:#f9f9f9;padding:14px;border-radius:8px;margin-bottom:16px;">
        <h3 style="margin:0 0 12px 0;font-size:12px;font-weight:600;">💵 DESGLOSE POR ESTADO DE LIQUIDACIÓN</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:11px;">
          <div style="background:#fff;padding:12px;border-radius:8px;border-left:4px solid #4caf50;">
            <div style="color:#666;font-size:10px;margin-bottom:4px;">✓ LIQUIDADAS (YA TENGO)</div>
            <div id="ventasLiquidadas" style="font-size:16px;font-weight:700;color:#4caf50;">$0.00</div>
            <div id="cantLiquidadas" style="font-size:9px;color:#999;margin-top:4px;">0 ventas</div>
          </div>
          <div style="background:#fff;padding:12px;border-radius:8px;border-left:4px solid #ff9800;">
            <div style="color:#666;font-size:10px;margin-bottom:4px;">⏳ PENDIENTE DE LIQUIDAR</div>
            <div id="ventasPendientes" style="font-size:16px;font-weight:700;color:#ff9800;">$0.00</div>
            <div id="cantPendientes" style="font-size:9px;color:#999;margin-top:4px;">0 ventas</div>
          </div>
        </div>
      </div>

      <div id="cuadreValores" style="display:none;background:#f9f9f9;padding:16px;border-radius:8px;margin-bottom:16px;">
        <h3 style="margin:0 0 12px 0;font-size:12px;font-weight:600;">📊 CUADRE DE CAJA</h3>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
          <div style="background:#fff;padding:12px;border-radius:8px;border:1px solid #e0e0e0;">
            <h4 style="margin:0 0 12px 0;font-size:10px;font-weight:600;color:#666;">ESPERADO</h4>
            <div style="margin-bottom:10px;">
              <label style="font-size:9px;color:#999;">Liquidadas (SI)</label>
              <input type="text" id="liquidadoEsperadoInput" readonly class="dc-input" style="font-size:11px;background:#e8f5e9;"/>
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:9px;color:#999;">Pendientes (NO)</label>
              <input type="text" id="pendienteEsperadoInput" readonly class="dc-input" style="font-size:11px;background:#e8f5e9;"/>
            </div>
            <div>
              <label style="font-size:9px;color:#999;font-weight:600;">TOTAL</label>
              <input type="text" id="totalEsperado" readonly class="dc-input" style="font-size:11px;background:#e8f5e9;font-weight:600;"/>
            </div>
          </div>

          <div style="background:#fff;padding:12px;border-radius:8px;border:1px solid #e0e0e0;">
            <h4 style="margin:0 0 12px 0;font-size:10px;font-weight:600;color:#666;">REAL (REGISTRADO)</h4>
            <div style="margin-bottom:10px;">
              <label style="font-size:9px;color:#999;">Efectivo</label>
              <input type="number" id="efectivoReal" class="dc-input" placeholder="0.00" step="0.01" style="font-size:11px;"/>
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:9px;color:#999;">Cuenta de ahorro</label>
              <input type="number" id="cuentaAhorroReal" class="dc-input" placeholder="0.00" step="0.01" style="font-size:11px;"/>
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:9px;color:#999;">Pendientes (dinero en tránsito)</label>
              <input type="number" id="pendienteReal" class="dc-input" placeholder="0.00" step="0.01" style="font-size:11px;"/>
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:9px;color:#999;">Gastos operativos</label>
              <input type="number" id="gastosOperativosReal" class="dc-input" placeholder="0.00" step="0.01" style="font-size:11px;"/>
            </div>
            <div>
              <label style="font-size:9px;color:#999;font-weight:600;">TOTAL</label>
              <input type="text" id="totalReal" readonly class="dc-input" style="font-size:11px;background:#f5f5f5;font-weight:600;"/>
            </div>
          </div>
        </div>

        <div style="background:#fff;padding:12px;border-radius:8px;border:2px solid #ff9800;">
          <h4 style="margin:0 0 12px 0;font-size:10px;font-weight:600;color:#666;">DIFERENCIAS (Real - Esperado)</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:11px;">
            <div>
              <div style="color:#999;font-size:9px;">Liquidadas</div>
              <div id="difLiquidado" style="font-size:14px;font-weight:700;color:#999;">$0.00</div>
            </div>
            <div>
              <div style="color:#999;font-size:9px;">Pendientes</div>
              <div id="difPendiente" style="font-size:14px;font-weight:700;color:#999;">$0.00</div>
            </div>
            <div style="border-left:2px solid #e0e0e0;padding-left:10px;">
              <div style="color:#999;font-size:9px;font-weight:600;">DIFERENCIA TOTAL</div>
              <div id="difTotal" style="font-size:16px;font-weight:700;color:#999;">$0.00</div>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:16px;">
          <button id="btnGuardarCuadre" class="dc-btn" style="display:none;padding:8px 16px;background:#4caf50;font-size:11px;">💾 Guardar Cierre</button>
        </div>
      </div>

      <div id="historicoCierres" style="background:#ffffff;padding:16px;border-radius:8px;margin-bottom:16px;border:1px solid #e0e0e0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;font-size:13px;font-weight:700;color:#333;">📋 HISTÓRICO DE CIERRES</h3>
          <label style="font-size:11px;color:#666;display:flex;gap:6px;align-items:center;cursor:pointer;user-select:none;">
            <input type="checkbox" id="verTodosCierres" style="cursor:pointer;"/>
            Ver todos los períodos
          </label>
        </div>
        <div id="tablaCierres" style="border-radius:6px;overflow:hidden;border:1px solid #ddd;font-size:11px;width:100%;overflow-x:auto;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:grid;grid-template-columns:1fr 0.9fr 0.9fr 0.9fr 0.9fr 1fr 0.9fr 0.9fr 1fr 0.9fr 0.8fr 0.8fr 1.8fr;gap:0;background:#f8f8f8;">
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">PERÍODO</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">FECHA</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">ESPERADO</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">REAL</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">DIF.</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">GANANCIA</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">EFECTIVO</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">CUENTA</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">PENDIENTES</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">GASTOS OP.</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">VENTAS</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-right:1px solid #ddd;border-bottom:2px solid #2196f3;">ESTADO</div>
            <div style="background:#f0f0f0;padding:12px 10px;font-weight:700;color:#333;border-bottom:2px solid #2196f3;text-align:center;">ACCIONES</div>
          </div>
          <div id="rowsCierres" style="max-height:500px;overflow-y:auto;"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnCargarCuadre').addEventListener('click', cargarCuadre);
  document.getElementById('btnGuardarCuadre').addEventListener('click', guardarCierre);
  document.getElementById('verTodosCierres').addEventListener('change', cargarCierresHistoricos);
  
  // Exponer funciones al scope global para que funcionen los onclick del HTML
  window.editarCierre = editarCierre;
  window.eliminarCierre = eliminarCierre;
  window.distribuirFondosPorID = distribuirFondosPorID;
  window.cerrarModalDistribucion = cerrarModalDistribucion;
  window.guardarDistribucionFondos = guardarDistribucionFondos;
  window.calcularReservaDinamica = calcularReservaDinamica;
  
  // Inicializar fechas por defecto
  inicializarFechasDefault();
}

export { mountFinanzas };
