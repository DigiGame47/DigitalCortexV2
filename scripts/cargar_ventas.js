#!/usr/bin/env node

/**
 * Script para cargar ventas desde CSV a Firebase
 * Uso: node cargar_ventas.js archivo_ventas.csv
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, serverTimestamp } from "firebase-admin/firestore";
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

// Parser CSV simple
function parseCSVLine(line, separator = ";") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };

  const headerLine = lines[0];
  const separator = headerLine.includes(";") ? ";" : ",";
  const headers = parseCSVLine(headerLine, separator).map(h => h.toLowerCase());

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const values = parseCSVLine(line, separator);
    const obj = {};

    headers.forEach((h, idx) => {
      obj[h] = values[idx] || "";
    });

    if (obj.cliente && obj.cliente.trim()) {
      rows.push(obj);
    }
  }

  return { headers, rows };
}

async function cargarVentas(csvPath) {
  try {
    // Validar archivo
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ Archivo no encontrado: ${csvPath}`);
      process.exit(1);
    }

    console.log(`📂 Leyendo: ${csvPath}\n`);

    const csvText = fs.readFileSync(csvPath, "utf8");
    const { headers, rows } = parseCSV(csvText);

    if (rows.length === 0) {
      console.error("❌ No se encontraron ventas en el CSV");
      process.exit(1);
    }

    console.log(`✅ Parseadas ${rows.length} ventas\n`);
    console.log("📤 Cargando a Firebase...\n");

    let cargadas = 0;
    let errores = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        // Validar campos requeridos
        if (!row.cliente || !row.cliente.trim()) {
          throw new Error("Cliente requerido");
        }
        if (!row.fecha || !row.fecha.trim()) {
          throw new Error("Fecha requerida");
        }
        if (!row.producto_id || !row.producto_id.trim()) {
          throw new Error("Producto ID requerido");
        }

        // Preparar datos
        const payload = {
          cliente: row.cliente.trim(),
          direccion: row.direccion?.trim() || "",
          telefono: row.telefono?.trim() || "",
          fecha: row.fecha.trim(),
          producto_id: row.producto_id.trim(),
          producto_key: row.producto_id.trim(), // SKU como key
          nombre_producto: "",
          precio_producto: Math.max(0, Number(row.precio_producto) || 0),
          precio_envio: Math.max(0, Number(row.precio_envio) || 0),
          tipo_recaudo: row.tipo_recaudo?.trim() || "",
          estado_venta: row.estado_venta?.trim() || "",
          estado_liquidacion: row.estado_liquidacion?.trim() || "NO",
          origen_venta: row.origen_venta?.trim() || "",
          nombre_campana: row.nombre_campana?.trim() || "",
          gasto_publicidad: Math.max(0, Number(row.gasto_publicidad) || 0),
          hora_entrega: row.hora_entrega?.trim() || "",
          imagen_url: row.imagen_url?.trim() || "",
          notas: row.notas?.trim() || "",
          costo_producto: 0, // Se puede calcular después
          ganancia: 0, // Se puede calcular después
          total_pago_cliente: Math.max(0, Number(row.precio_producto) || 0) + Math.max(0, Number(row.precio_envio) || 0),
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        };

        // Agregar a Firebase
        const docRef = await db.collection("VENTAS").add(payload);

        cargadas++;
        process.stdout.write(`\r   ${cargadas}/${rows.length} ventas cargadas`);

      } catch (err) {
        errores.push(`Fila ${i + 2}: ${err.message}`);
      }
    }

    console.log(`\n\n✅ RESULTADO:`);
    console.log(`   Cargadas: ${cargadas} ventas`);

    if (errores.length > 0) {
      console.log(`\n⚠️  ERRORES (${errores.length}):`);
      errores.slice(0, 10).forEach(e => console.log(`   - ${e}`));
      if (errores.length > 10) console.log(`   ... y ${errores.length - 10} más`);
    }

    console.log(`\n✨ Operación completada\n`);

    process.exit(0);

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Obtener archivo de argumentos
const csvPath = process.argv[2];

if (!csvPath) {
  console.log("📋 Uso: node cargar_ventas.js <archivo_ventas.csv>\n");
  console.log("Ejemplo: node cargar_ventas.js ventas.csv\n");
  process.exit(1);
}

cargarVentas(csvPath);
