/**
 * Script para normalizar los estados de venta a minúscula en Firestore
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
    "PEDIDO PROGRAMADO": "pedido programado",
    "VENTA FINALIZADA": "venta finalizada",
    "CANCELADO POR CLIENTE": "cancelado por cliente",
    "DEVOLUCION": "devolucion",
    "Venta finalizada": "venta finalizada",
    "Cancelado por cliente": "cancelado por cliente",
    "Pedido programado": "pedido programado"
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
║  Normalizador de Estados de Venta - Minúsculas              ║
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
    "PEDIDO PROGRAMADO": "pedido programado",
    "VENTA FINALIZADA": "venta finalizada",
    "CANCELADO POR CLIENTE": "cancelado por cliente",
    "DEVOLUCION": "devolucion",
    "Venta finalizada": "venta finalizada",
    "Cancelado por cliente": "cancelado por cliente",
    "Pedido programado": "pedido programado"
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
7. Las categorías ahora aparecerán en minúsculas

✨ ¡Listo!
`);
