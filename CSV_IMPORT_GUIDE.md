# Guía de Importación de CSV - Inventario

## Funcionalidades Agregadas

Se han añadido dos botones nuevos en la vista de Inventario:

### 1. **⬇ Plantilla** (Descargar Plantilla)
- Descarga un archivo CSV con la estructura correcta
- Incluye 3 ejemplos para referencia
- Listo para ser completado con tus productos

### 2. **⬆ Cargar CSV** (Subir Datos)
- Permite seleccionar un archivo CSV
- Muestra una vista previa de los datos antes de cargar
- Valida los datos y muestra errores
- Indica el progreso de carga

## Estructura del CSV

El archivo CSV debe tener las siguientes columnas (en este orden):

| Campo | Tipo | Obligatorio | Ejemplo |
|-------|------|-------------|---------|
| nombre | Texto | ✓ | iPhone 14 Pro |
| categoria | Texto | ✓ | CELULARES |
| sku | Texto | ✗ | IPHONE14P128GB |
| marca | Texto | ✗ | APPLE |
| modelo | Texto | ✗ | iPhone 14 Pro |
| condicion | Texto | ✗ | NUEVO |
| estado | Texto | ✗ | ACTIVO |
| stock | Número | ✗ | 5 |
| stock_transito | Número | ✗ | 2 |
| stock_reservado | Número | ✗ | 1 |
| costo_prom | Decimal | ✗ | 800.00 |
| precio | Decimal | ✗ | 1200.00 |
| garantia_meses | Número | ✗ | 12 |
| ubicacion | Texto | ✗ | ESTANTE A1 |
| notas | Texto | ✗ | Sin accesorios |

## Condiciones Válidas
- NUEVO
- CAJA_ABIERTA
- USADO
- SIN_CAJA

## Estados Válidos
- ACTIVO
- INACTIVO

## Notas Importantes

✓ **Validaciones que se aplican:**
- NOMBRE y CATEGORÍA son obligatorios
- Se previenen duplicados por combinación "nombre|condición"
- Los campos numéricos se convierten automáticamente
- Los campos de texto se normalizan a MAYÚSCULAS
- Stock proyectado se calcula automáticamente

✓ **Foto:**
- De momento se asigna el icono 📦 como placeholder
- Puedes actualizar las fotos manualmente después en la vista de detalle del producto

✓ **Flujo:**
1. Descarga la plantilla
2. Completa con tus productos
3. Sube el archivo
4. Visualiza la previa
5. Confirma la carga
6. Monitorea el progreso

## Ejemplo de CSV

```csv
nombre,categoria,sku,marca,modelo,condicion,estado,stock,stock_transito,stock_reservado,costo_prom,precio,garantia_meses,ubicacion,notas
iPhone 14 Pro,CELULARES,IPHONE14P128GB,APPLE,iPhone 14 Pro,NUEVO,ACTIVO,5,2,1,800.00,1200.00,12,ESTANTE A1,Sin accesorios
MacBook Air M2,LAPTOPS,MBA-M2-256,APPLE,MacBook Air,NUEVO,ACTIVO,3,1,0,1200.00,1800.00,12,ESTANTE B2,Incluye cargador
AirPods Pro,ACCESORIOS,AIRPODS-PRO,APPLE,AirPods Pro,NUEVO,ACTIVO,10,0,2,200.00,350.00,12,ESTANTE C1,
```

## Errores Comunes

| Error | Solución |
|-------|----------|
| NOMBRE y CATEGORÍA obligatorios | Verifica que ambos campos están presentes en cada fila |
| YA EXISTE UN PRODUCTO | Cambia el NOMBRE o la CONDICIÓN para hacerlo único |
| Stock transito > stock proyectado | Asegúrate de que los números sean consistentes |

## Tips

💡 **Recomendaciones:**
- Usa todas las MAYÚSCULAS para consistencia
- Guarda la plantilla descargada como referencia
- Prueba primero con 5-10 productos
- Revisa los detalles después en la vista de detalle
- Las fotos pueden agregarse manualmente después
