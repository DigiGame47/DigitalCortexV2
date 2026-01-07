/**
 * Script para limpiar la base de datos de cierres y resetear ventas
 * Borra todos los documentos de cierres_finanzas y desmarcar ventas (cuadrado=false)
 * 
 * Uso: node scripts/limpiar_cierres.js
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  deleteDoc, 
  doc,
  updateDoc,
  writeBatch 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAmIU2nZbql0pJLxeRfu0bIAzGqzT20cbM",
  authDomain: "digitalcortex.firebaseapp.com",
  projectId: "digitalcortex",
  storageBucket: "digitalcortex.firebasestorage.app",
  messagingSenderId: "72517856030",
  appId: "1:72517856030:web:eb33af90645c56efdff70f",
  measurementId: "G-HRMBNQN7BD"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function limpiarCierres() {
  try {
    console.log("🧹 Iniciando limpieza de base de datos...\n");

    // 1. Eliminar todos los cierres
    console.log("📋 Borrando documentos de cierres_finanzas...");
    const cierresRef = collection(db, "cierres_finanzas");
    const cierresSnapshot = await getDocs(cierresRef);
    
    let cierresBorrados = 0;
    for (const doc of cierresSnapshot.docs) {
      await deleteDoc(doc.ref);
      cierresBorrados++;
    }
    
    console.log(`✅ ${cierresBorrados} cierre(s) borrado(s)\n`);

    // 2. Desmarcar todas las ventas (cuadrado = false)
    console.log("💰 Desmarcando ventas (cuadrado = false)...");
    const ventasRef = collection(db, "VENTAS");
    const ventasSnapshot = await getDocs(ventasRef);
    
    if (ventasSnapshot.size > 0) {
      const batch = writeBatch(db);
      let ventasActualizadas = 0;
      
      ventasSnapshot.forEach((ventaDoc) => {
        const venta = ventaDoc.data();
        // Solo actualizar si está marcada como cuadrado
        if (venta.cuadrado === true) {
          batch.update(ventaDoc.ref, { cuadrado: false });
          ventasActualizadas++;
        }
      });
      
      if (ventasActualizadas > 0) {
        await batch.commit();
        console.log(`✅ ${ventasActualizadas} venta(s) desmarcada(s)\n`);
      } else {
        console.log(`ℹ️  No había ventas marcadas\n`);
      }
    } else {
      console.log(`ℹ️  No se encontraron ventas\n`);
    }

    console.log("✨ ¡Limpieza completada exitosamente!");
    console.log("\n📊 Estado después de la limpieza:");
    console.log(`   • Cierres: 0 documentos`);
    console.log(`   • Ventas: Todas desmarcadas (cuadrado=false)`);
    console.log("\n🎯 Ya puedes crear el primer cierre real.\n");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error durante la limpieza:", error);
    process.exit(1);
  }
}

limpiarCierres();
