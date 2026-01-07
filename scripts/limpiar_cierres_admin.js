#!/usr/bin/env node

/**
 * Script administrativo para limpiar cierres y resetear ventas
 * Usa Firebase Admin SDK
 * 
 * Instalación:
 * npm install firebase-admin
 * 
 * Uso:
 * node scripts/limpiar_cierres_admin.js
 */

// Nota: Este script requiere configuración de Firebase Admin SDK
// Para ejecutar desde el navegador, usa en la consola:
/*

// Pegá esto en la consola del navegador (F12) mientras estés logueado:
(async () => {
  console.log("🧹 Limpiando cierres...");
  
  // Eliminar todos los cierres
  const cierresRef = collection(db, "cierres_finanzas");
  const cierresSnapshot = await getDocs(cierresRef);
  let cierresBorrados = 0;
  
  for (const cierreDoc of cierresSnapshot.docs) {
    await deleteDoc(cierreDoc.ref);
    cierresBorrados++;
  }
  console.log(`✅ ${cierresBorrados} cierre(s) eliminado(s)`);
  
  // Desmarcar todas las ventas
  const ventasRef = collection(db, "VENTAS");
  const ventasSnapshot = await getDocs(ventasRef);
  const batch = writeBatch(db);
  let ventasActualizadas = 0;
  
  ventasSnapshot.forEach((ventaDoc) => {
    if (ventaDoc.data().cuadrado === true) {
      batch.update(ventaDoc.ref, { cuadrado: false });
      ventasActualizadas++;
    }
  });
  
  if (ventasActualizadas > 0) {
    await batch.commit();
    console.log(`✅ ${ventasActualizadas} venta(s) desmarcada(s)`);
  }
  
  console.log("✨ ¡Limpieza completada!");
})();

*/

console.log(`
╔════════════════════════════════════════════════════════╗
║    Limpieza de Base de Datos - Finanzas v2.0          ║
╚════════════════════════════════════════════════════════╝

⚠️  Este script requiere ejecución desde la consola del navegador

Pasos a seguir:

1. Abre tu aplicación en el navegador
2. Asegúrate de estar logueado
3. Abre la consola (F12 → Console)
4. Copia y pega lo siguiente:

════════════════════════════════════════════════════════════

(async () => {
  console.log("🧹 Limpiando cierres...");
  
  // Eliminar todos los cierres
  const cierresRef = collection(db, "cierres_finanzas");
  const cierresSnapshot = await getDocs(cierresRef);
  let cierresBorrados = 0;
  
  for (const cierreDoc of cierresSnapshot.docs) {
    await deleteDoc(cierreDoc.ref);
    cierresBorrados++;
  }
  console.log(\`✅ \${cierresBorrados} cierre(s) eliminado(s)\`);
  
  // Desmarcar todas las ventas
  const ventasRef = collection(db, "VENTAS");
  const ventasSnapshot = await getDocs(ventasRef);
  const batch = writeBatch(db);
  let ventasActualizadas = 0;
  
  ventasSnapshot.forEach((ventaDoc) => {
    if (ventaDoc.data().cuadrado === true) {
      batch.update(ventaDoc.ref, { cuadrado: false });
      ventasActualizadas++;
    }
  });
  
  if (ventasActualizadas > 0) {
    await batch.commit();
    console.log(\`✅ \${ventasActualizadas} venta(s) desmarcada(s)\`);
  }
  
  console.log("✨ ¡Limpieza completada!");
})();

════════════════════════════════════════════════════════════

5. Presiona Enter
6. Espera a que aparezca el mensaje de éxito
7. Recarga la página (F5)

✨ Listo para crear tu primer cierre real!
`);

process.exit(0);
