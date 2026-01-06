# Guía de Configuración - Impresora Térmica Brother PT-210

## Características de la Impresora PT-210

- **Ancho de impresión**: 24mm (aproximadamente 80 caracteres en fuente monoespaciada)
- **Resolución**: 203 DPI (puntos por pulgada)
- **Tecnología**: Impresión térmica directa (sin tinta)
- **Velocidad**: Hasta 150mm/segundo

## Configuración en el Sistema

### 1. Conexión Física
- Conectar la impresora PT-210 vía USB al equipo
- Instalar drivers de Brother desde: https://support.brother.com/
- Verificar en "Dispositivos e Impresoras" que aparezca como disponible

### 2. Configuración de Impresión en Windows

**Pasos:**
1. Ir a **Configurar página** (Print Setup)
2. Establecer los siguientes parámetros:

| Parámetro | Valor |
|-----------|-------|
| Orientación | Vertical |
| Ajuste de escala | 100% |
| Tamaño del papel | Personalizado (80mm x Auto) |
| Calidad | 203 ppp |
| Márgenes | 0mm en todos los lados |

### 3. Configuración CSS (app.css)

Para impresoras térmicas, usamos:
```css
@media print {
  @page {
    size: 80mm auto;
    margin: 0;
    padding: 0;
  }
  
  body {
    margin: 0;
    padding: 0;
    background: white;
  }
}
```

## Características del Ticket Digital

### Layout del Ticket
```
┌──────────────────────┐
│    DIGITAL CORTEX    │
│  Tienda de Auriculares
├──────────────────────┤
│ VENTA #: XXXXX       │
│ Fecha: DD/MM/YYYY    │
│ Hora: HH:MM          │
├──────────────────────┤
│ CLIENTE              │
│ Nombre Cliente       │
│ Tel: +XXXXXXXXX      │
│ Dir: Calle Número    │
├──────────────────────┤
│ PRODUCTO             │
│ Nombre del Producto  │
├──────────────────────┤
│ Precio:       $XXX.XX│
│ Envío:         $XX.XX│
├──────────────────────┤
│ TOTAL:        $XXX.XX│
├──────────────────────┤
│ Pago: EFECTIVO       │
│ Envío: Provedor      │
├──────────────────────┤
│      [CÓDIGO QR]     │
│      (150x150)       │
├──────────────────────┤
│ GRACIAS POR SU       │
│ COMPRA               │
│   Vuelva pronto      │
└──────────────────────┘
```

### Elementos Incluidos

1. **Encabezado Personalizado**
   - Nombre de la tienda: DIGITAL CORTEX
   - Subtítulo: Tienda de Auriculares

2. **Información de Venta**
   - Número de ticket (primeros 8 caracteres del ID)
   - Fecha y hora

3. **Datos del Cliente**
   - Nombre completo
   - Teléfono (opcional)
   - Dirección (opcional)

4. **Producto Vendido**
   - Nombre del producto

5. **Detalles Financieros**
   - Precio del producto
   - Costo de envío (si aplica)
   - **Total a pagar** (destacado)

6. **Método de Pago y Envío**
   - Tipo de recaudo (Efectivo, Tarjeta, Transferencia)
   - Proveedor de envío

7. **Código QR**
   - Contiene: ID de venta, cliente, total, fecha
   - Tamaño: 150x150 píxeles
   - Generado dinámicamente desde https://api.qrserver.com/

8. **Pie de Página**
   - Mensaje de agradecimiento
   - Invitación a volver

## Uso en la Aplicación

### Vista Previa (Antes de Imprimir)

1. **Ir a módulo VENTAS**
2. **Abrir un detalle de venta** (hacer clic en una venta)
3. **Botón "🖨️ Imprimir"** aparece en el panel de detalles
4. Se abre una **vista previa en nueva ventana**
5. Botones disponibles:
   - 🖨️ **Imprimir**: Abre el diálogo de impresión
   - ❌ **Cerrar**: Cierra la ventana

### Impresión Final

1. En la vista previa, hacer clic en **"🖨️ Imprimir"**
2. Se abre el diálogo de impresión del navegador
3. Seleccionar:
   - **Impresora**: Brother PT-210
   - **Tamaño de página**: Personalizado 80mm
   - **Márgenes**: Ninguno
   - **Escala**: 100%
4. Hacer clic en **"Imprimir"**

## Especificaciones Técnicas

### Código QR
- **API**: QR Server (qrserver.com)
- **Datos codificados**: JSON con ID, cliente, total, fecha
- **Tamaño URL**: ~300-400 caracteres (depende de los datos)
- **Generación**: Dinámica, una por cada impresión

### Fuente
- **Font primaria**: Courier New (monoespaciada)
- **Fallback**: Monospace del sistema
- **Tamaño base**: 13px en vista previa
- **Ajustado para impresión**: 11-12px en papel

### Responsive Widths
- **Vista previa en pantalla**: 80mm de ancho fijo
- **Al imprimir**: Se ajusta al tamaño del papel configurado
- **CSS Media Print**: Oculta controles, mantiene solo el ticket

## Troubleshooting

### El ticket no cabe en el ancho
**Solución**: Verificar que el tamaño de papel esté configurado en 80mm y no se esté ampliando

### El código QR no aparece
**Solución**: 
- Verificar conexión a internet
- Comprobar que qrserver.com esté accesible
- Verificar que los datos de la venta contengan valores válidos

### Márgenes aparecen en la impresión
**Solución**:
1. En Windows, ir a **Opciones...** en el diálogo de impresión
2. Establecer **todos los márgenes en 0mm**
3. Desactivar **"Encabezados y pies"**

### Texto se ve pequeño
**Solución**:
- Aumentar escala de impresión a 110-120%
- Las fuentes están optimizadas para 80mm de ancho

## Customización

### Cambiar Nombre de la Tienda
Editar en `ventas.js`, función `generarTicketHTML()`, línea ~1771:
```javascript
<div class="store-name">MI TIENDA</div>
<div class="store-subtitle">Mi subtítulo</div>
```

### Cambiar Tamaño de QR
En `ventas.js`, línea ~1768, cambiar `size=150x150`:
```javascript
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${...}`;
```

### Agregar Logo o Imagen
En `ventas.js`, después del encabezado (línea ~1780), agregar:
```html
<div class="logo-section">
  <img src="logo.png" alt="Logo" style="width: 60px;">
</div>
```

## Notas Importantes

- ✅ El ticket se genera en **HTML/CSS**, no en texto plano
- ✅ El código QR se genera **dinámicamente** desde API externa
- ✅ Optimizado para **80mm de ancho** (estándar de térmicas)
- ✅ Compatible con cualquier impresora térmica estándar
- ⚠️ Requiere **conexión a internet** para generar el código QR
- ⚠️ El tamaño final depende de la **configuración de la impresora Windows**

## Referencias

- [Brother Support PT-210](https://support.brother.com/)
- [QR Server API](https://qrserver.com)
- [Especificaciones térmicas 80mm](https://es.wikipedia.org/wiki/Papel_t%C3%A9rmico)
