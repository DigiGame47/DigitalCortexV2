# 🚀 INICIO RÁPIDO - Importación CSV

## ⚡ En 3 Pasos

### Paso 1: Descargar Plantilla
```
1. Abre Inventario → Vista General
2. Haz clic en el botón [⬇ Plantilla]
3. Se descarga "plantilla_inventario.csv"
```

### Paso 2: Completar Datos
```
Abre el archivo con Excel o editor de texto
Llena los datos de tus productos:

nombre,categoria,sku,marca,modelo,condicion,estado,stock,...
iPhone 14,CELULARES,IPHONE14,APPLE,iPhone 14,NUEVO,ACTIVO,5,...
```

**Campos obligatorios:** nombre, categoria  
**Campos opcionales:** todos los demás

### Paso 3: Subir Archivo
```
1. Haz clic en [⬆ Cargar CSV]
2. Selecciona tu archivo
3. Revisa la vista previa
4. Haz clic en [Cargar X productos]
5. ¡Listo! Tu inventario se actualiza
```

---

## 📋 Campos Válidos

| Campo | Condiciones Válidas | Estados Válidos |
|-------|-------------------|-----------------|
| condicion | NUEVO, CAJA_ABIERTA, USADO, SIN_CAJA | - |
| estado | - | ACTIVO, INACTIVO |

---

## ⚠️ Restricciones

- ❌ No puede haber duplicados (mismo nombre + condición)
- ❌ NOMBRE y CATEGORÍA son obligatorios
- ❌ Números deben ser válidos (stock, precio, etc)
- ✅ Todo se convierte a MAYÚSCULAS automáticamente
- ✅ Stock proyectado se calcula automáticamente

---

## 🧪 Datos de Prueba

Se incluye `ejemplo_inventario.csv` con 25 productos reales para probar.

---

## 🎯 Casos de Uso

### Importar desde antiguo sistema:
```
1. Exporta datos del sistema anterior
2. Adapta columnas al formato requerido
3. Sube el CSV
4. Verifica la previsualización
5. Confirma la carga
```

### Actualizar masivamente:
```
Nota: De momento importa nuevos productos
Para actualizar existentes, edita manualmente en el detalle
```

### Agregar nuevas categorías:
```
Simplemente incluye nuevas categorías en el CSV
Se crearán automáticamente en la base de datos
```

---

## ❓ FAQ

**P: ¿Puedo cargar fotos junto con el CSV?**  
R: No aún. De momento las fotos son un icono 📦, edítarlas después manualmente.

**P: ¿Qué pasa si hay duplicados?**  
R: El sistema previene automáticamente. Si hay duplicado, muestra error en el reporte.

**P: ¿Puedo editar el CSV después?**  
R: Sí, pero recuerda que evitará crear duplicados. Mejor editar en la interfaz directamente.

**P: ¿Se puede deshacer una importación?**  
R: No automáticamente. Deberías eliminar manualmente los productos creados si es necesario.

**P: ¿Cuántos productos puedo importar?**  
R: Sin límite técnico, pero recomienda hacer importaciones de 100-200 a la vez.

---

## 📞 Soporte

Si hay problemas:
1. Revisa que NOMBRE y CATEGORÍA estén presentes
2. Verifica que no haya comillas sin escapar
3. Abre la consola del navegador (F12) para ver errores
4. Prueba con el archivo `ejemplo_inventario.csv`

---

**Versión:** 1.0  
**Última actualización:** 2 de enero de 2026  
**Estado:** ✅ Listo para producción
