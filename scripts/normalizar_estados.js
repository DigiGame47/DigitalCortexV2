/**
 * Script para normalizar los estados de venta en Firestore
 * Ejecutar desde la consola del navegador (F12 → Console)
 * 
 * Copia y pega esto en la consola:
 */

/*
(async () => {
  console.log("🔄 Iniciando normalización de estados de venta...\n");
  
  const ventasRef = collection(db, "VENTAS");
  const snapshot = await getDocs(ventasRef);
  
  const mappeo = {
    "pedido programado": "Pedido programado",
    "PEDIDO PROGRAMADO": "Pedido programado",
    "venta finalizada": "Venta finalizada",
    "VENTA FINALIZADA": "Venta finalizada",
    "cancelado por cliente": "Cancelado por cliente",
    "CANCELADO POR CLIENTE": "Cancelado por cliente",
    "devolucion": "Devolucion",
    "DEVOLUCION": "Devolucion",
    "Devolucion": "Devolucion"
  };
  
  let actualizadas = 0;
  const batch = writeBatch(db);
  
  snapshot.forEach((ventaDoc) => {
    const venta = ventaDoc.data();
    const estadoActual = venta.estado_venta || "";
    
    if (mappeo[estadoActual]) {
      const estadoNuevo = mappeo[estadoActual];
      
      if (estadoActual !== estadoNuevo) {
        console.log(`Actualizando: "${estadoActual}" → "${estadoNuevo}"`);
        batch.update(ventaDoc.ref, {
          estado_venta: estadoNuevo,
          updated_at: serverTimestamp()
        });
        actualizadas++;
      }
    }
  });
  
  if (actualizadas > 0) {
    console.log(`\n✓ Se actualizarán ${actualizadas} venta(s)\n`);
    await batch.commit();
    console.log("✅ Normalización completada!\n");
  } else {
    console.log("ℹ️  No había registros que normalizar\n");
  }
})();
*/

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  Normalizador de Estados de Venta                            ║
╚═══════════════════════════════════════════════════════════════╝

📝 Instrucciones:

1. Abre tu aplicación en el navegador
2. Presiona F12 para abrir la consola
3. Copia y pega TODO lo siguiente en la consola:

═════════════════════════════════════════════════════════════════

(async () => {
  console.log("🔄 Iniciando normalización de estados de venta...\\n");
  
  const ventasRef = collection(db, "VENTAS");
  const snapshot = await getDocs(ventasRef);
  
  const mappeo = {
    "pedido programado": "Pedido programado",
    "PEDIDO PROGRAMADO": "Pedido programado",
    "venta finalizada": "Venta finalizada",
    "VENTA FINALIZADA": "Venta finalizada",
    "cancelado por cliente": "Cancelado por cliente",
    "CANCELADO POR CLIENTE": "Cancelado por cliente",
    "devolucion": "Devolucion",
    "DEVOLUCION": "Devolucion",
    "Devolucion": "Devolucion"
  };
  
  let actualizadas = 0;
  const batch = writeBatch(db);
  
  snapshot.forEach((ventaDoc) => {
    const venta = ventaDoc.data();
    const estadoActual = venta.estado_venta || "";
    
    if (mappeo[estadoActual]) {
      const estadoNuevo = mappeo[estadoActual];
      
      if (estadoActual !== estadoNuevo) {
        console.log(\`Actualizando: "\${estadoActual}" → "\${estadoNuevo}"\`);
        batch.update(ventaDoc.ref, {
          estado_venta: estadoNuevo,
          updated_at: serverTimestamp()
        });
        actualizadas++;
      }
    }
  });
  
  if (actualizadas > 0) {
    console.log(\`\\n✓ Se actualizarán \${actualizadas} venta(s)\\n\`);
    await batch.commit();
    console.log("✅ Normalización completada!\\n");
  } else {
    console.log("ℹ️  No había registros que normalizar\\n");
  }
})();

═════════════════════════════════════════════════════════════════

4. Presiona Enter
5. Espera a que aparezca el mensaje de éxito
6. Recarga la página (F5)
7. Los estados de venta ahora estarán normalizados

✨ ¡Listo!
`);
