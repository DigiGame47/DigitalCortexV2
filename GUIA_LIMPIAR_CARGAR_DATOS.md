# 🚀 Guía para Limpiar Inventario y Cargar Ventas

## Paso 1: Limpiar la colección "productos"

```bash
cd c:\Users\codav\Documents\DigitalCortexV2
node scripts/limpiar_inventario.js
```

Verás algo como:
```
🔍 Buscando documentos en colección 'productos'...
⚠️  Encontrados 25 documentos
🗑️  Eliminando...
✅ 25/25 documentos eliminados correctamente

📝 La colección 'productos' está lista para nueva carga.
```

## Paso 2: Preparar tu CSV de inventario

1. Descarga la plantilla desde la app: [⬇ Plantilla]
2. Completa los datos
3. Guarda como CSV (separado por comas o punto y coma)

## Paso 3: Cargar nuevo inventario desde la app

1. Abre Inventario → Vista General
2. Haz clic en [⬆ Cargar CSV]
3. Selecciona tu archivo
4. Revisa la previsualización
5. Confirma la carga

## Paso 4: Cargar ventas desde CSV

Cuando tengas tus datos de ventas listos en CSV:

```bash
node scripts/cargar_ventas.js tu_archivo_ventas.csv
```

Ejemplo:
```bash
node scripts/cargar_ventas.js ventas.csv
```

### Resultado esperado:
```
📂 Leyendo: ventas.csv

✅ Parseadas 15 ventas

📤 Cargando a Firebase...

   15/15 ventas cargadas

✅ RESULTADO:
   Cargadas: 15 ventas

✨ Operación completada
```

---

## 📋 Estructura del CSV de Ventas

Campo | Requerido | Ejemplo | Notas
------|-----------|---------|-------
cliente | ✓ | Juan Pérez | Nombre del cliente
direccion | | Calle 123, Apt 5 | Dirección de entrega
telefono | | 04121234567 | Teléfono
fecha | ✓ | 2025-01-02 | Formato: YYYY-MM-DD
producto_id | ✓ | IPHONE14P128GB | SKU del inventario
precio_producto | ✓ | 1000.00 | Precio pagado
precio_envio | | 50.00 | Costo envío
tipo_recaudo | | EFECTIVO | EFECTIVO, PAYPAL, TRANSFERENCIA, CHIVO WALLET, WOMPY TC, OTRO
estado_venta | | VENTA FINALIZADA | VENTA FINALIZADA, PEDIDO PROGRAMADO, CANCELADO POR CLIENTE, DEVOLUCION
estado_liquidacion | | SI | SI o NO
origen_venta | | INSTAGRAM | INSTAGRAM, FACEBOOK, WHATSAPP, OTRO
nombre_campana | | Black Friday | Nombre de la campaña
gasto_publicidad | | 20.00 | Costo publicidad
hora_entrega | | 14:30 | HH:MM
imagen_url | | https://... | URL de imagen
notas | | Entrega mañana | Notas libres

---

## ⚙️ Requisitos

- Node.js instalado
- Archivo `serviceAccountKey.json` en la carpeta raíz del proyecto
- CSV con estructura correcta

---

## 🐛 Troubleshooting

### Error: "No se encontró serviceAccountKey.json"
**Solución:** Coloca el archivo de credenciales en la raíz del proyecto

### Error: "No se encontraron ventas en el CSV"
**Solución:** Asegúrate que el CSV tiene:
1. Cabecera en primera fila
2. Al menos una fila de datos
3. Campo "cliente" no vacío

### Algunos productos no se cargan
**Solución:** Verifica que el `producto_id` (SKU) existe en tu inventario

---

## 📝 Ejemplo de Flujo Completo

```
1. Limpiar inventario antiguo
   └─> node scripts/limpiar_inventario.js

2. Cargar nuevo inventario
   └─> App → Inventario → [⬆ Cargar CSV] → tu_inventario.csv

3. Cargar ventas
   └─> node scripts/cargar_ventas.js tu_ventas.csv

4. Verificar en Firebase
   └─> Abrir Ventas → Ver datos cargados
```

---

## ✅ Checklist

- [ ] `serviceAccountKey.json` en carpeta raíz
- [ ] Node.js instalado (`node --version`)
- [ ] CSV de inventario preparado
- [ ] CSV de ventas preparado
- [ ] Separador correcto (coma o punto y coma)
- [ ] Formato de fechas: YYYY-MM-DD
- [ ] producto_id coincide con SKU del inventario

---

**Creado:** 2 de enero de 2026
**Estado:** ✅ Listo para usar
