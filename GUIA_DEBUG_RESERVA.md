# Guía de Debugging - Reserva Período Anterior

## Cambios Realizados

Se ha mejorado significativamente la funcionalidad de "Reserva Período Anterior" en el módulo de finanzas para asegurar que los fondos reservados en un período se hereden correctamente al siguiente.

### 1. **Corrección del Input Number**
- **Problema:** El campo `inputReservaAnterior` es de tipo `number` y se estaba asignando un valor formateado con dinero (ej: "$1,234.56"), lo cual causaba que el input rechazara el valor.
- **Solución:** Ahora se asigna solo el valor numérico al input, sin formato.

### 2. **Mejora Visual con Display Formateado**
- Se agregó un nuevo elemento `displayReservaAnterior` que muestra el valor con formato de dinero.
- El valor numérico va en el input (para cálculos).
- El valor formateado se muestra en un span visual para el usuario.

### 3. **Logging Mejorado en obtenerReservaAnterior()**
Ahora la función registra en la consola:
- Total de cierres encontrados en Firebase
- Cada comparación de fechas realizada
- Las claves de la estructura distribucion
- Si se encontró un cierre anterior
- El valor final de la reserva a retornar

### 4. **Logging Mejorado en cargarVentas()**
- Registra cuando la reserva anterior es asignada al state y al UI

## Cómo Probar

### Paso 1: Abrir la Consola del Navegador
1. Abre tu aplicación
2. Presiona `F12` para abrir las DevTools
3. Ve a la pestaña **Console**

### Paso 2: Crear el Primer Cierre
1. Navega a **Finanzas**
2. Selecciona un período (ej: 01/01/2026 - 31/01/2026)
3. Haz clic en "Cargar Ventas"
4. En la consola deberías ver logs como:
   ```
   [obtenerReservaAnterior] Total cierres encontrados: 0
   [obtenerReservaAnterior] No hay cierres anteriores
   [cargarVentas] Reserva anterior asignada: 0
   ```

5. Llena los datos reales (efectivo, ahorro, pendientes)
6. Distribuye el dinero disponible:
   - **Retiro Ganancia:** Una cantidad
   - **Fondear Inventario:** Una cantidad
   - **Reserva:** $500 o más (esto es lo importante)
   - **Resto:** Se calcula automáticamente
7. Haz clic en "Guardar Cierre"
8. Verifica en Firebase que el documento se creó en colección `cierres_finanzas`
9. Verifica que la estructura es:
   ```json
   {
     "distribucion": {
       "reserva": 500,
       "fondear_inventario": ...,
       "retiro_ganancia": ...,
       "resto": ...
     },
     "fecha_fin": "2026-01-31",
     ...
   }
   ```

### Paso 3: Crear el Segundo Cierre (Probar Herencia de Reserva)
1. Selecciona un período diferente (ej: 01/02/2026 - 28/02/2026)
2. Haz clic en "Cargar Ventas"
3. **En la consola deberías ver logs como:**
   ```
   [obtenerReservaAnterior] Total cierres encontrados: 1
   [obtenerReservaAnterior] Cierres ordenados. Buscando anterior a: 2026-02-01
   [obtenerReservaAnterior] Comparando: {
     fecha_fin_cierre: "2026-01-31",
     fecha_inicio_busqueda: "2026-02-01",
     es_anterior: true,
     distribucion_keys: ["reserva", "fondear_inventario", "retiro_ganancia", "resto"]
   }
   [obtenerReservaAnterior] ✓ Encontrado cierre anterior con reserva: 500
   [cargarVentas] Reserva anterior asignada: 500
   ```

4. **En el UI deberías ver:**
   - Campo "Saldo de Período Anterior" > "Reserva Período Anterior": **$500.00**

## Qué Observar

### Escenario de Éxito
- ✅ La consola muestra el log `✓ Encontrado cierre anterior con reserva: 500`
- ✅ El campo "Reserva Período Anterior" muestra **$500.00**
- ✅ El campo "Dinero Disponible" (en distribución) incluye $500 más que antes

### Escenario de Error/Debugging
Si no aparece la reserva:

1. **Verifica en Firebase Console:**
   - Abre https://console.firebase.google.com
   - Ve a Firestore Database
   - Abre la colección `cierres_finanzas`
   - Abre el primer documento creado
   - Busca el campo `distribucion.reserva`
   - ¿Tiene un valor? ¿Cuál es el valor exacto?

2. **Verifica las fechas en la consola:**
   - Si el log dice `es_anterior: false`, significa que la comparación de fechas falló
   - Ejemplo: `"2026-01-31" < "2026-02-01"` debería ser `true`

3. **Verifica la estructura:**
   - El log muestra `distribucion_keys`
   - ¿Incluye la clave `"reserva"`?
   - Si no, el cierre se guardó sin la reserva correctamente

4. **Revisa los logs de guardarCierreCompleto():**
   - Podrías agregar más console.logs antes de guardar para ver qué datos se envían

## Posibles Problemas y Soluciones

### Problema: "No hay cierres anteriores" siempre
- **Causa:** No se guardó el primer cierre correctamente
- **Solución:** Verifica en Firebase que exista el documento en `cierres_finanzas`

### Problema: "Comparando: es_anterior: false"
- **Causa:** Las fechas están en formato incorrecto o hay diferencia horaria
- **Solución:** Verifica que las fechas en Firebase sean strings ISO (YYYY-MM-DD)

### Problema: "distribucion_keys" no incluye "reserva"
- **Causa:** La reserva no se está guardando en el primer cierre
- **Solución:** Verifica que en `guardarCierreCompleto()` se incluya correctamente `distribucion.reserva`

### Problema: El input sigue mostrando "0.00" aunque el log dice 500
- **Causa:** El display element no existe o tiene otro ID
- **Solución:** Verifica que exista un elemento con `id="displayReservaAnterior"`

## Información Importante

### Campos Clave en Firestore
```
cierres_finanzas/{docId}
├── fecha_inicio: string (YYYY-MM-DD)
├── fecha_fin: string (YYYY-MM-DD)
├── distribucion:
│   ├── reserva: number ← ESTO ES LO IMPORTANTE
│   ├── fondear_inventario: number
│   ├── retiro_ganancia: number
│   └── resto: number
├── cuadre:
│   ├── deberia_haber: number
│   ├── tengo_realmente: number
│   ├── diferencia: number
│   └── cuadra: boolean
└── created_at: timestamp
```

### Variables Relacionadas en Estado
```javascript
finanzasState.datosReales.reserva_anterior  // Valor del período anterior
finanzasState.distribucion.reserva          // Valor a distribuir en este período
```

## Comandos de Consola Útiles

Si necesitas debuggear manualmente en la consola del navegador:

```javascript
// Ver el estado actual
console.log('Estado actual:', finanzasState);

// Ver la reserva anterior
console.log('Reserva anterior:', finanzasState.datosReales.reserva_anterior);

// Ver la distribución
console.log('Distribución:', finanzasState.distribucion);

// Ver cálculo disponible
console.log('Dinero disponible:', calcularDisponible());
```

## Flujo Esperado

```
PERÍODO 1 (Enero):
1. Cargar ventas → No hay reserva anterior (0)
2. Llenar datos: Efectivo $1000, Ahorro $500, Pendientes $0
3. Cuadre: Debería haber $500, Tengo realmente $1500, Diferencia $1000
4. Distribuir: Reserva $500 ← GUARDADA EN FIREBASE
5. Guardar cierre ✓

PERÍODO 2 (Febrero):
1. Cargar ventas → obtenerReservaAnterior() busca en Firebase
2. Encuentra cierre de enero con fecha_fin "2026-01-31"
3. Compara: "2026-01-31" < "2026-02-01" → TRUE
4. Extrae: distribucion.reserva = 500
5. Muestra en UI: "Reserva Período Anterior: $500.00" ✓
6. Dinero disponible incluye esos $500
```

## Próximos Pasos si Sigue Fallando

Si después de seguir esta guía sigue sin funcionar:

1. **Ejecuta este comando en la consola después de "Cargar Ventas":**
   ```javascript
   const snapshot = await getDocs(collection(db, "cierres_finanzas"));
   snapshot.forEach(doc => console.log('Cierre:', doc.id, doc.data()));
   ```

2. **Copia el output completo de la consola**

3. **Verifica que Firebase esté correctamente conectado:**
   ```javascript
   console.log('DB:', db);
   ```

4. **Verifica la colección en Firebase:** 
   - ¿Existe la colección `cierres_finanzas`?
   - ¿Tiene documentos?
   - ¿Tienen la estructura correcta?

## Contacto / Ayuda

Si necesitas ayuda, revisa estos archivos relacionados:
- [finanzas.js](./public/js/finanzas.js) - Lógica principal
- [finanzas.css](./public/css/finanzas.css) - Estilos
- [firebase.js](./public/js/firebase.js) - Configuración Firebase
- [GUIA_FINANZAS.md](./GUIA_FINANZAS.md) - Documentación general
