# 📤 Cargar Ventas desde CSV - Guía Rápida

## Pasos

### 1️⃣ Descargar Plantilla
```
Abre Ventas → [⬇ Plantilla]
Se descarga: plantilla_ventas.csv
```

### 2️⃣ Completar datos en Excel/Spreadsheet
- Copia la plantilla
- Llena con tus ventas
- Usa separador: punto y coma (;)
- Formato de fecha: YYYY-MM-DD

### 3️⃣ Cargar el CSV
```
Abre Ventas → [⬆ Cargar CSV]
Selecciona tu archivo
```

### 4️⃣ Revisar previsualización
- Verifica que los datos se ven correctos
- Haz clic en [Cargar X ventas]
- Espera la barra de progreso

### 5️⃣ ¡Listo!
- La tabla se actualiza automáticamente
- Los datos están en Firebase

---

## 📋 Estructura del CSV

**Separador:** Punto y coma (;)

| Campo | Requerido | Ejemplo |
|-------|-----------|---------|
| cliente | ✓ | Juan Pérez |
| direccion | | Calle 123 |
| telefono | | 04121234567 |
| fecha | ✓ | 2025-01-02 |
| producto_id | ✓ | IPHONE14P128GB |
| precio_producto | ✓ | 1000.00 |
| precio_envio | | 50.00 |
| tipo_recaudo | | EFECTIVO |
| estado_venta | | VENTA FINALIZADA |
| estado_liquidacion | | SI |
| origen_venta | | INSTAGRAM |
| nombre_campana | | Black Friday |
| gasto_publicidad | | 20.00 |
| hora_entrega | | 14:30 |
| imagen_url | | https://... |
| notas | | Entrega mañana |

---

## ⚙️ Validaciones

✓ Cliente requerido  
✓ Fecha requerida (YYYY-MM-DD)  
✓ Producto ID requerido (debe estar en inventario)  
✓ Automáticamente calcula total: precio_producto + precio_envio  

---

## 🎯 Ejemplo de CSV

```csv
cliente;direccion;telefono;fecha;producto_id;precio_producto;precio_envio;tipo_recaudo;estado_venta;estado_liquidacion;origen_venta;nombre_campana;gasto_publicidad;hora_entrega;imagen_url;notas
Juan Pérez;Calle Principal 123;04121234567;2025-01-02;IPHONE14P128GB;1000.00;50.00;EFECTIVO;VENTA FINALIZADA;SI;INSTAGRAM;Campaña iPhone;20.00;14:30;;
María García;Avenida Central 456;04149876543;2025-01-02;MBA-M2-256;1500.00;100.00;TRANSFERENCIA;VENTA FINALIZADA;SI;FACEBOOK;Black Friday;30.00;09:15;;
```

---

## ✨ Tipos de Datos Válidos

**tipo_recaudo:**  
- EFECTIVO
- PAYPAL
- TRANSFERENCIA
- CHIVO WALLET
- WOMPY TC
- OTRO

**estado_venta:**  
- VENTA FINALIZADA
- PEDIDO PROGRAMADO
- CANCELADO POR CLIENTE
- DEVOLUCION

**estado_liquidacion:**  
- SI
- NO

**origen_venta:**  
- INSTAGRAM
- FACEBOOK
- WHATSAPP
- OTRO

---

## 🐛 Troubleshooting

**Error: No se encontraron ventas**
→ Verifica que haya cabecera en primera fila y datos en filas siguientes

**Producto no se carga**
→ El `producto_id` debe coincidir con el SKU del inventario

**Errores en algunas filas**
→ Asegúrate que Cliente, Fecha y Producto sean obligatorios

---

**Versión:** 1.0  
**Creado:** 2 de enero de 2026  
**Estado:** ✅ Listo para usar
