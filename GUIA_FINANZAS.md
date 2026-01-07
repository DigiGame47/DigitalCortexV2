# Módulo de Finanzas v2.0 - Guía de Uso

## 🎯 Objetivo del Módulo

El módulo de finanzas permite cuadrar la caja comparando el dinero que debería tener (según sistema) vs el dinero que realmente tienes (efectivo físico).

**Flujo principal:**
1. **Cargar ventas** del período que quieres cuadrar
2. **Ingresar dinero físico** (efectivo, cuenta, pendientes)
3. **Validar que cuadre** (diferencia = $0.00)
4. **Distribuir fondos** (retiro, fondeo, reserva)
5. **Guardar cierre** (marca las ventas como cuadradas)

---

## 📋 Conceptos Clave

### Criterios de Filtro para Ventas
Las ventas a cuadrar deben cumplir **3 criterios**:
- ✓ `estado_venta` = **"VENTA FINALIZADA"**
- ✓ `estado_liquidacion` = **"SI"**
- ✓ `cuadrado` = **false** (nueva columna)

### Campos de VENTAS en Firebase
- `precio_producto`: Valor neto de la venta (sin envío)
- `ganancia`: Utilidad por venta
- `costo_producto`: Valor que costó el producto (inventario)
- `estado_venta`: Estado de la venta
- `estado_liquidacion`: SI/NO - si el proveedor ya depositó
- `cuadrado`: boolean - si ya fue incluido en un cierre

### Dinero Físico (Inputs)
- **Efectivo en caja**: Dinero en mano
- **Cuenta de Ahorro**: Dinero en banco
- **Pendientes en Tránsito**: Dinero que te deben
- **Reserva Período Anterior**: Dinero guardado en la distribución anterior (auto calculado)

**Total Físico** = Efectivo + Ahorro + Pendientes
**Dinero Disponible para Distribuir** = Total Físico + Reserva Anterior

### Cuadre
- **Debería Haber** = Total Facturado (según sistema)
- **Tengo Realmente** = Total Físico (manual)
- **Diferencia** = Tengo - Debería (debe ser ~$0.00)

### Distribución de Fondos
El dinero disponible (físico + reserva anterior) se distribuye en:
- **Retiro de Ganancia**: Dinero que sacas del negocio
- **Fondear Inventario**: Dinero para comprar más productos
- **Reserva**: Dinero guardado para emergencias (se usará en el siguiente período)
- **Resto**: Lo que queda sin distribuir

**Importante**: La reserva que guardes en este período se mostrará automáticamente como "Reserva Período Anterior" al siguiente período.

---

## 🔄 Flujo de Cierre

### Etapa 1: Seleccionar Período
- Por defecto: primer al último día del mes actual
- Puedes cambiar las fechas manualmente
- Click en "Cargar Ventas del Período"

### Etapa 2: Ingresar Dinero Físico
Una vez cargadas las ventas:
- Ingresa el efectivo en caja
- Ingresa el dinero en cuenta de ahorro
- Ingresa pendientes en tránsito
- **Reserva período anterior se auto-calcula** (solo lectura)

El sistema calcula automáticamente:
- Total facturado
- Ganancia total
- Costo total
- Diferencia del cuadre
- Dinero disponible (físico + reserva anterior)

### Etapa 3: Validar Cuadre
- Si **diferencia = $0.00** → ✓ CUADRA
- Si **diferencia ≠ $0.00** → ✗ NO CUADRA

**Acciones si no cuadra:**
- Revisa que los montos ingresados sean correctos
- Valida facturas y recaudos
- Busca depósitos o gastos faltantes

### Etapa 4: Distribuir Fondos
Una vez cuadrado:
- Ingresa el retiro de ganancia
- Ingresa fondeo para inventario
- Ingresa reserva
- El "Resto" se calcula automáticamente

### Etapa 5: Guardar Cierre
- Click en "✓ Guardar Cierre"
- El sistema:
  - Crea documento en `cierres_finanzas`
  - Marca todas las ventas cuadradas con `cuadrado: true`
  - Guarda distribución de fondos

---

## 📊 Historial de Cierres

En la vista principal puedes ver:
- **Tabla de todos los cierres** realizados
- **Información de cada cierre**: fechas, montos, estado
- **Acciones**: Ver detalles completos

---

## 🛠️ Cambios en Base de Datos

### Nueva Columna en VENTAS
```javascript
cuadrado: boolean  // true si fue incluida en algún cierre
```

### Nueva Colección: cierres_finanzas
```javascript
{
  fecha_inicio: "2026-01-01",
  fecha_fin: "2026-01-31",
  totales: {
    total_facturado: "1000.00",
    ganancia_total: "200.00",
    costo_total: "800.00",
    cantidad_ventas: 15
  },
  dinero_fisico: {
    efectivo: "500.00",
    cuenta_ahorro: "300.00",
    pendientes: "200.00",
    total: "1000.00"
  },
  cuadre: {
    deberia_haber: "1000.00",
    tengo_realmente: "1000.00",
    diferencia: "0.00",
    cuadra: true
  },
  distribucion: {
    retiro_ganancia: "150.00",
    fondear_inventario: "400.00",
    reserva: "300.00",
    resto: "150.00"
  },
  created_at: timestamp,
  updated_at: timestamp
}
```

---

## 🎨 Diseño

- **Minimalista**: Colores limpios, espacios blancos
- **Responsive**: Funciona en desktop, tablet y mobile
- **Intuitivo**: Flujo paso a paso con validaciones
- **Colores por referencia**:
  - 🔵 Azul: valores del sistema
  - 🟢 Verde: ganancia, cuadre exitoso
  - 🔴 Rojo: costos, errores
  - 🟡 Amarillo: pendientes, información

---

## ⚠️ Notas Importantes

1. **Solo cuadras VENTA FINALIZADA + liquidadas + no cuadradas**
   - No puedes cuadrar nuevamente las mismas ventas

2. **El cuadre debe balancear**
   - Si hay diferencia, revisa los datos antes de guardar

3. **Se guardan todos los cierres**
   - Puedes consultar histórico de cuadres anteriores

4. **Transacciones atómicas**
   - Si algo falla, nada se guarda

5. **Distribución es informativa**
   - El sistema registra cómo distribuiste el dinero
   - Es útil para auditoría y análisis

---

## 🚀 Próximas Mejoras (Futuro)

- [ ] Exportar cierres a PDF
- [ ] Gráficos de tendencias de ganancia
- [ ] Comparativa mes anterior
- [ ] Alertas de incoherencias
- [ ] Firma digital del cuadre
- [ ] Integración con reportes contables

---

**Versión**: 2.0  
**Última actualización**: Enero 2026  
**Estado**: Producción ✓
