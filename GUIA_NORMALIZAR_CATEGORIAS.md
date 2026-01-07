# Normalizar Categorías de Estado de Venta

## Problema
Las categorías de estado de venta están duplicadas:
- **Mayúsculas (incorrectas)**: PEDIDO PROGRAMADO, VENTA FINALIZADA, CANCELADO POR CLIENTE
- **Minúsculas (correctas)**: pedido programado, venta finalizada, cancelado por cliente

Esto ocurrió porque:
- Los históricos se guardaron en **minúscula** ✓
- Las nuevas ventas de enero 2026 se guardaron en **MAYÚSCULA** ✗

## Solución Completada

### Parte 1: Código Actualizado ✅
Se han actualizado los siguientes archivos:

**1. [/public/js/ventas.js](public/js/ventas.js#L43)** - Constante V_ESTADO_VENTA
```javascript
const V_ESTADO_VENTA = ["pedido programado","venta finalizada","cancelado por cliente","devolucion"];
```

**2. Valores por defecto** - Actualizado en 3 ubicaciones:
- [Línea 925](public/js/ventas.js#L925): `estado_venta: "pedido programado"`
- [Línea 1007](public/js/ventas.js#L1007): `estado_venta: "pedido programado"`
- [Línea 1294](public/js/ventas.js#L1294): `estado_venta: "pedido programado"`

✅ **Resultado**: Las nuevas ventas se crearán automáticamente con valores en minúscula.

### Parte 2: Normalizar Datos Históricos en Firestore

Los datos antiguos en Firestore todavía tienen valores en mayúscula. Para normalizarlos:

#### Opción A: Script Automático (RECOMENDADO)

1. **Abre la consola del navegador**
   - Presiona `F12` en tu navegador
   - Selecciona la pestaña "Console" (Consola)

2. **Copia y ejecuta este comando**
   ```javascript
   (async () => {
     console.log("🔄 Iniciando normalización de estados de venta...\n");
     
     const ventasRef = collection(db, "VENTAS");
     const snapshot = await getDocs(ventasRef);
     
     const mappeo = {
       "PEDIDO PROGRAMADO": "pedido programado",
       "VENTA FINALIZADA": "venta finalizada",
       "CANCELADO POR CLIENTE": "cancelado por cliente",
       "DEVOLUCION": "devolucion",
       "Venta finalizada": "venta finalizada",
       "Cancelado por cliente": "cancelado por cliente",
       "Pedido programado": "pedido programado"
     };
     
     let actualizadas = 0;
     const batch = writeBatch(db);
     
     snapshot.forEach((ventaDoc) => {
       const venta = ventaDoc.data();
       const estadoActual = venta.estado_venta || "";
       
       if (mappeo[estadoActual]) {
         const estadoNuevo = mappeo[estadoActual];
         
         if (estadoActual !== estadoNuevo) {
           console.log(`Actualizando: "${estadoActual}" → "${estadoNuevo}"`);
           batch.update(ventaDoc.ref, {
             estado_venta: estadoNuevo,
             updated_at: serverTimestamp()
           });
           actualizadas++;
         }
       }
     });
     
     if (actualizadas > 0) {
       console.log(`\n✓ Se actualizarán ${actualizadas} venta(s)\n`);
       await batch.commit();
       console.log("✅ Normalización completada!\n");
     } else {
       console.log("ℹ️  No había registros que normalizar\n");
     }
   })();
   ```

3. **Presiona Enter y espera**
   - Verás un listado de todas las actualizaciones
   - Al final aparecerá ✅ "Normalización completada!"

4. **Recarga la página** (F5)
   - Los dropdowns ahora mostrarán solo opciones en minúscula
   - Los datos antiguos estarán normalizados

#### Opción B: Manual por Documento

Si solo quieres actualizar algunos documentos específicos, puedes desde el Firebase Console:
1. Ve a Firestore
2. Abre la colección VENTAS
3. Edita cada documento que tenga `estado_venta` en mayúscula
4. Cambia el valor a minúscula
5. Guarda

## Validación

Después de ejecutar la normalización:

### ✅ Verificaciones
- [ ] Abre un módulo de Ventas
- [ ] El dropdown de "Estado de Venta" muestra solo opciones en minúscula
- [ ] Creas una nueva venta → se guarda automáticamente con estado en minúscula
- [ ] Abre una venta antigua → el estado aparece en minúscula

### 🔍 Verificación en Consola
Para ver todas las ventas y sus estados:
```javascript
getDocs(collection(db, "VENTAS")).then(snapshot => {
  snapshot.forEach(doc => {
    console.log(`${doc.id}: ${doc.data().estado_venta}`);
  });
});
```

## Resumen de Cambios

| Aspecto | Estado |
|--------|--------|
| Código - Constante V_ESTADO_VENTA | ✅ Actualizado a minúscula |
| Código - Valores por defecto | ✅ 3x actualizado a minúscula |
| Datos nuevos | ✅ Se crean en minúscula automáticamente |
| Datos históricos | ⏳ Necesita script de normalización (Parte 2) |
| UI - Dropdown | ✅ Solo muestra minúsculas |

## Preguntas Frecuentes

**P: ¿Se pierden datos al normalizar?**
A: No. Solo se cambia mayúscula a minúscula. Los datos permanecen exactamente igual, solo que con formato correcto.

**P: ¿Puedo deshacer la normalización?**
A: No es necesario. Cambiar a minúscula es la normalización correcta. Pero técnicamente podrías cambiar manualmente en Firestore si necesitas.

**P: ¿El script actualiza automáticamente los reportes?**
A: Sí. Los cuadres (cierres_finanzas) buscan ventas por estado. Ahora buscarán correctamente en minúscula.

**P: ¿Necesito hacer esto en otros navegadores?**
A: No, los cambios se guardan en Firestore. Solo una vez por usuario/sesión.

---

**Última actualización**: Enero 2026
**Versión**: 2.0
