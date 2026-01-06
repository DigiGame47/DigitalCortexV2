#!/usr/bin/env node

/**
 * Script para ELIMINAR todos los documentos de la colección "productos"
 * Uso: node limpiar_inventario.js
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

// Cargar credenciales
const credentialsPath = path.join(process.cwd(), "serviceAccountKey.json");

if (!fs.existsSync(credentialsPath)) {
  console.error("❌ Error: No se encontró serviceAccountKey.json");
  console.error(`   Busca en: ${credentialsPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

// Inicializar Firebase
const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

async function limpiarInventario() {
  try {
    console.log("🔍 Buscando documentos en colección 'productos'...");
    
    const snapshot = await db.collection("productos").get();
    const totalDocs = snapshot.size;
    
    if (totalDocs === 0) {
      console.log("✅ La colección 'productos' ya está vacía.");
      process.exit(0);
    }
    
    console.log(`⚠️  Encontrados ${totalDocs} documentos`);
    console.log("🗑️  Eliminando...\n");
    
    let eliminados = 0;
    
    // Eliminar en batches de 500 (límite de Firestore)
    for (const doc of snapshot.docs) {
      await db.collection("productos").doc(doc.id).delete();
      eliminados++;
      
      if (eliminados % 10 === 0) {
        process.stdout.write(`\r   ${eliminados}/${totalDocs} documentos eliminados`);
      }
    }
    
    console.log(`\r✅ ${eliminados}/${totalDocs} documentos eliminados correctamente`);
    console.log("\n📝 La colección 'productos' está lista para nueva carga.");
    
    process.exit(0);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Ejecutar
limpiarInventario();
