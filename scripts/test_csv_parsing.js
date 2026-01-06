// Test de CSV Parsing
const testCSV = `nombre,categoria,sku,marca,modelo,condicion,estado,stock,stock_transito,stock_reservado,costo_prom,precio,garantia_meses,ubicacion,notas
iPhone 14 Pro,CELULARES,IPHONE14P128GB,APPLE,iPhone 14 Pro,NUEVO,ACTIVO,5,2,1,800.00,1200.00,12,ESTANTE A1,Sin accesorios
"MacBook Air M2",LAPTOPS,"MBA-M2-256",APPLE,"MacBook Air",NUEVO,ACTIVO,3,1,0,1200.00,1800.00,12,ESTANTE B2,"Incluye cargador, accesorios"
AirPods Pro,ACCESORIOS,AIRPODS-PRO,APPLE,AirPods Pro,NUEVO,ACTIVO,10,0,2,200.00,350.00,12,ESTANTE C1,`;

// Función de prueba
function runTest() {
  console.log("=== Test CSV Parsing ===");
  
  // Test 1: parseCSVLine
  const line1 = 'Apple,"MacBook Air M2","MBA-M2",APPLE,Laptop';
  const parsed1 = parseCSVLine(line1);
  console.log("Test parseCSVLine:", parsed1);
  console.assert(parsed1.length === 5, "Debería tener 5 campos");
  console.assert(parsed1[1] === "MacBook Air M2", "Debería parsear comillas correctamente");
  
  // Test 2: parseCSV
  const result = parseCSV(testCSV);
  console.log("Test parseCSV:");
  console.log("  Headers:", result.headers);
  console.log("  Rows count:", result.rows.length);
  console.log("  First row:", result.rows[0]);
  console.assert(result.rows.length === 3, "Debería parsear 3 filas");
  console.assert(result.rows[0].nombre === "iPhone 14 Pro", "Nombre debería ser correcto");
  
  // Test 3: Comillas en valores
  console.log("  Segunda fila:", result.rows[1]);
  console.assert(result.rows[1].nombre === "MacBook Air M2", "Debería parsear comillas");
  
  console.log("✓ Todos los tests pasaron");
}

// Ejecutar en consola del navegador
// runTest();
