# Guía: Cuadre con Reserva Acumulada

## Cambio Importante

Se ha actualizado la lógica del cuadre de caja para incluir correctamente la reserva de períodos anteriores en el cálculo. Esto asegura que los fondos acumulados de períodos previos se consideren parte del dinero que "debería tener".

## Nueva Fórmula de Cuadre

### Antes (Incorrecto)
```
Lo que DEBERÍA tener = Total Facturado del Período
Lo que TENGO realmente = Efectivo + Ahorro + Pendientes
Diferencia = Tengo - Debería
```

**Problema:** Si en el período anterior reservé $500, ese dinero no se contaba en lo que "debería tener", resultando en un cuadre incorrecto.

### Ahora (Correcto)
```
Lo que DEBERÍA tener = Total Facturado del Período + Reserva Período Anterior
Lo que TENGO realmente = Efectivo + Ahorro + Pendientes
Diferencia = Tengo - Debería
```

**Beneficio:** El cuadre ahora es matemáticamente correcto incluyendo fondos acumulados.

## Ejemplo Práctico

### Período 1 (Enero)
```
Ventas totales: $1,000
Dinero físico: $1,500 (fue ganancia acumulada de periodos previos)

Cuadre:
- Debería tener: $1,000
- Tengo realmente: $1,500
- Diferencia: +$500 (dinero extra que distribuo)

Distribución:
- Retiro de ganancia: $200
- Fondear inventario: $100
- Reserva: $200 ← GUARDADO EN FIRESTORE
- Resto: $0
```

### Período 2 (Febrero)
```
Ventas totales: $800
Dinero físico: $1,000

Cuadre ANTIGUO (INCORRECTO):
- Debería tener: $800
- Tengo realmente: $1,000
- Diferencia: +$200

❌ Pero falta el $200 de reserva del período anterior,
   lo que generaría confusión

Cuadre NUEVO (CORRECTO):
- Total facturado: $800
- Reserva período anterior: $200
- Debería tener: $1,000 ← SUMA AMBOS
- Tengo realmente: $1,000
- Diferencia: $0

✅ Ahora cuadra perfectamente
```

## Cómo Funciona

### Paso 1: Cargar Ventas
Cuando seleccionas un período:
1. Se carga el total facturado de ese período
2. Se busca la reserva guardada del período anterior
3. Esta reserva se suma automáticamente al "debería tener"

### Paso 2: Ver el Cuadre
El resultado ahora muestra:
- **Total facturado (período):** solo de este período
- **Reserva período anterior:** lo que guardaste antes
- **= Debería tener (total):** suma de ambos

### Paso 3: Dinero Disponible para Distribuir
El dinero disponible para distribuir es:
```
Disponible = Dinero Físico (Efectivo + Ahorro + Pendientes)
```

No se suma la reserva anterior aquí porque ya está contabilizada en lo que "debería tener". El dinero físico QUE TIENES ya incluye tanto la venta nueva como la reserva anterior.

### Paso 4: Guardar Cierre
Cuando guardas, se almacena:
```json
{
  "distribucion": {
    "reserva": 200,           ← Tu nueva reserva para próximo período
    "retiro_ganancia": 300,
    "fondear_inventario": 500,
    "resto": 0
  },
  "fecha_fin": "2026-02-28"
}
```

## Visualización en la Interfaz

### Resultado del Cuadre
```
✅ RESULTADO DEL CUADRE

Lo que DEBERÍA tener:
  Total facturado (período)    $800.00
  + Reserva período anterior   $200.00
  = Debería tener (total)    $1,000.00

Lo que REALMENTE tengo:
  Dinero físico                $1,000.00
  Diferencia                       $0.00

✓ CUADRA
```

## Casos Especiales

### Primer Período (Sin Reserva Anterior)
```
Período 1:
- Reserva período anterior: $0.00 (no hay cierre anterior)
- Debería tener: Total facturado + $0 = Total facturado
- Cuadre normal
```

### Cambio de Período Sin Crear Cierre
```
Si haces cierre en Enero, pero luego creas otro cierre en Febrero:
- La reserva se hereda correctamente
- El sistema busca automáticamente la más reciente

Si haces TWO cierres en Febrero:
- El segundo cierre hereda la reserva del primero (si la tiene)
```

### Períodos No Consecutivos
```
Ejemplo: Cierre en Enero, siguiente en Abril
- El sistema encuentra el cierre de Enero
- Hereda su reserva para Abril
- Correctamente cuenta el dinero acumulado
```

## Lógica de Cálculo en el Código

```javascript
// En calcularCuadre()
const deberiaHaber = totales.total_facturado + reservaAnterior;
// Ahora incluye AMBOS componentes

// En calcularDisponible()
const disponible = tengoRealmente;
// Sigue siendo solo el dinero físico porque la reserva 
// anterior ya está contabilizada en lo que "debería tener"
```

## Verificación en Firestore

Para verificar que tu reserva se heredó correctamente:

1. Abre Firebase Console
2. Ve a Firestore → `cierres_finanzas`
3. Abre el cierre anterior
4. Busca el campo `distribucion.reserva`
5. Ejemplo:
```json
{
  "distribucion": {
    "reserva": 200,
    "fondear_inventario": 500,
    "retiro_ganancia": 300,
    "resto": 0
  }
}
```

## FAQ

### ¿Por qué el disponible no incluye la reserva anterior?
El disponible es el dinero FÍSICO que tienes. La reserva anterior ya está incluida en la fórmula "Debería tener", así que si la sumáramos aquí, estaríamos contándola dos veces.

### ¿Qué pasa si tengo una reserva muy grande?
Funciona igual. Si tienes $5,000 en reserva y ventas nuevas de $1,000:
- Debería tener: $6,000
- Si tengo $6,000 físicos: Cuadra
- Distribúyelos como quieras

### ¿Puedo cambiar la reserva heredada?
No, es auto-calculada y read-only. Se hereda automáticamente del cierre anterior. Si necesitas ajustar, crea una nueva distribución con los valores que quieras para THIS período.

### ¿Se pierde la reserva si no creo cierre?
Si cargás ventas pero NO guardás el cierre, la distribución no se guarda, así que no hay nueva reserva. El próximo cierre seguirá mostrando la reserva del anterior cierre guardado.

### ¿Qué pasa con decimales y redondeo?
El sistema usa números exactos hasta $0.01. La comparación de cuadre permite diferencia menor a $0.01 para tolerancia por redondeo.

## Ejemplo Completo Paso a Paso

### Período 1: Enero 2026
```
CARGAR VENTAS:
- Período: 01/01/2026 - 31/01/2026
- Reserva anterior: $0.00 (primer período)
- Total facturado: $1,000.00

LLENAR DATOS REALES:
- Efectivo: $1,500.00
- Ahorro: $0.00
- Pendientes: $0.00

CUADRE MUESTRA:
- Total facturado: $1,000.00
- Reserva anterior: $0.00
- Debería tener: $1,000.00
- Tengo realmente: $1,500.00
- Diferencia: +$500.00 ✓ CUADRA (con $ extra)

DISTRIBUIR:
- Retiro ganancia: $250.00
- Fondear inventario: $250.00
- Reserva: $300.00 ← IMPORTANTE
- Resto: $0.00

GUARDAR CIERRE → Se guarda la reserva de $300 en Firebase
```

### Período 2: Febrero 2026
```
CARGAR VENTAS:
- Período: 01/02/2026 - 28/02/2026
- Reserva anterior: $300.00 ← HEREDADA AUTOMÁTICAMENTE
- Total facturado: $1,200.00

CUADRE MUESTRA:
- Total facturado: $1,200.00
- Reserva anterior: $300.00
- Debería tener: $1,500.00 ← SUMA AMBOS

LLENAR DATOS REALES:
- Efectivo: $1,500.00
- Ahorro: $0.00
- Pendientes: $0.00

CUADRE MUESTRA:
- Tengo realmente: $1,500.00
- Diferencia: $0.00 ✓ CUADRA PERFECTO

Dinero disponible para distribuir: $1,500.00
(Que distribuyes como quieras, guardando lo que necesites en reserva)
```

## Resumen

La nueva lógica de cuadre:
- ✅ Incluye reserva anterior en lo que "debería tener"
- ✅ Calcula disponible sin duplicar la reserva anterior
- ✅ Hereda automáticamente las reservas entre períodos
- ✅ Permite cuadre matemáticamente correcto con fondos acumulados
- ✅ Mantiene transparencia en la visualización desglosada
