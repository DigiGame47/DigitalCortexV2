# 👀 Vista Previa Visual - Interface de Usuario

## Cómo se ve en la Pantalla

### Antes (Inventario Original)
```
┌─────────────────────────────────────────────────────────────────┐
│ Inventario                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [Buscar...] [CATEGORÍA ▼] [CONDICIÓN ▼] [ESTADO ▼]            │
│                              [+ Nuevo] [Refrescar]              │
│                                                                 │
│ Tabla de productos...                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Después (Con CSV)
```
┌─────────────────────────────────────────────────────────────────┐
│ Inventario                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [Buscar...] [CATEGORÍA ▼] [CONDICIÓN ▼] [ESTADO ▼]            │
│                                                                 │
│  [+ Nuevo] [⬇ Plantilla] [⬆ Cargar CSV] [Refrescar]            │
│                                                                 │
│ Tabla de productos...                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔘 Botones Nuevos

### [⬇ Plantilla]
**Estado:**  `dc-btn dc-btn-ghost`  
**Tooltip:** "Descargar plantilla CSV"  
**Función:** Descarga archivo `plantilla_inventario.csv`  
**Incluye:** 3 ejemplos de productos  

### [⬆ Cargar CSV]
**Estado:**  `dc-btn dc-btn-ghost`  
**Tooltip:** "Cargar CSV"  
**Función:** Abre diálogo para seleccionar archivo  
**Valida:** Extensión .csv  

---

## 📺 Interfaz de Carga

### Step 1: Seleccionar archivo
```
Usuario hace clic en [⬆ Cargar CSV]
           ↓
Input dialog aparece
  Filtra solo archivos .csv
           ↓
Usuario selecciona archivo.csv
```

### Step 2: Vista Previa Modal
```
┌──────────────────────────────────────────────────────────────┐
│ Vista Previa del CSV (X productos)                       [✕] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  #  │ nombre        │ categoria │ sku   │ marca │ ...       │
│  ───┼───────────────┼───────────┼───────┼───────┼──...      │
│  1  │ iPhone 14 Pro │ CELULARES │ IP14P │ APPLE │           │
│  2  │ MacBook Air   │ LAPTOPS   │ MBA   │ APPLE │           │
│  3  │ AirPods Pro   │ ACCESORIOS│ AP    │ APPLE │           │
│  ... │ ... (17 más) │                                       │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                      [Cancelar] [Cargar 20 productos]        │
└──────────────────────────────────────────────────────────────┘
```

**Características:**
- Muestra hasta 20 productos
- 8 campos principales
- Contador total arriba
- Botones: Cancelar / Confirmar

### Step 3: Barra de Progreso
```
Mientras se carga:

┌─────────────────────────────────┐
│ Cargando productos...           │
│ [=======>              ] 45%    │
│ 9 / 20 productos                │
└─────────────────────────────────┘
```

**Ubicación:** Esquina inferior derecha  
**Auto-cierra:** Al terminar  

### Step 4: Resultado
```
Alert con resultado:

✓ Cargados 20 productos

⚠ Errores (2):
Fila 5: YA EXISTE UN PRODUCTO
Fila 12: NOMBRE Y CATEGORÍA obligatorios
```

---

## 🖼️ Iconos de Fotos

### En Tabla
```
┌──────┬──────────────┬──────────────┬─────────┐
│ Foto │ Nombre       │ Categoría    │ Stock   │
├──────┼──────────────┼──────────────┼─────────┤
│ 📦   │ iPhone 14    │ CELULARES    │ 5       │
│ 📦   │ MacBook Air  │ LAPTOPS      │ 3       │
│ [IMG]│ Samsung S23  │ CELULARES    │ 2       │
└──────┴──────────────┴──────────────┴─────────┘

📦 = Sin foto (placeholder)
[IMG] = Con foto
```

**Tamaño:** 32x32 pixels  
**Icono:** 📦 (emoji)  

### En Detalle del Producto
```
┌────────────────────────────────┐
│   iPhone 14 Pro                │
├────────────────────────────────┤
│                                │
│         ┌──────────────┐       │
│         │      📦      │       │
│         │   32x32px    │       │
│         └──────────────┘       │
│         Sin foto                │
│                                │
│ [Editar] [Eliminar]            │
└────────────────────────────────┘
```

**Tamaño:** 280x280 pixels  
**Icono:** 📦 (emoji centrado)  

---

## 🎨 Estilos Aplicados

### Botones
```css
.dc-btn dc-btn-ghost {
  background: transparent;
  border: 1px solid var(--stroke);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dc-btn dc-btn-ghost:hover {
  background: rgba(0,0,0,.04);
}
```

### Placeholders
```css
.dc-img-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--stroke);
  border-radius: 6px;
}

.dc-img-sm::before {
  content: "📦";
  font-size: 18px;
}
```

---

## 🔄 Flujo Visual Completo

```
┌─────────────────────────────────────────┐
│       INTERFAZ INVENTARIO               │
│  [Botones de búsqueda y filtros]        │
│  [+ Nuevo] [⬇ Plantilla] [⬆ CSV] [↻]  │
└─────────────────────────────────────────┘
            ↓ [⬇ Plantilla]
┌─────────────────────────────────────────┐
│     Descarga CSV                        │
│     plantilla_inventario.csv            │
└─────────────────────────────────────────┘
            ↓ Usuario completa
┌─────────────────────────────────────────┐
│     Excel/Editor de texto               │
│     Completa datos                      │
└─────────────────────────────────────────┘
            ↓ [⬆ Cargar CSV]
┌─────────────────────────────────────────┐
│     Input File Dialog                   │
│     Selecciona archivo.csv              │
└─────────────────────────────────────────┘
            ↓ Se parsea
┌─────────────────────────────────────────┐
│     Modal de Vista Previa                │
│     Muestra hasta 20 productos          │
│     [Cancelar] [Confirmar]              │
└─────────────────────────────────────────┘
            ↓ [Confirmar]
┌─────────────────────────────────────────┐
│     Barra de Progreso                   │
│     Cargando a Firebase                 │
│     X / Y productos                     │
└─────────────────────────────────────────┘
            ↓ Completa
┌─────────────────────────────────────────┐
│     Alert con Resultado                 │
│     ✓ Cargados X productos              │
│     ⚠ Errores: Y                        │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│     Tabla Actualizada                   │
│     Muestra nuevos productos            │
│     Lista para revisar                  │
└─────────────────────────────────────────┘
```

---

## 💬 Mensajes en Interfaz

### Tooltip de Botones
```
[⬇ Plantilla]  → "Descargar plantilla CSV"
[⬆ Cargar CSV] → "Cargar CSV"
```

### Modal
```
Título: "Vista Previa del CSV (X productos)"
Botón cierre: "✕"
```

### Barra de Progreso
```
Mensaje: "Cargando productos..."
Contador: "X / Y"
```

### Alert de Resultado
```
Éxito: "✓ Cargados 20 productos"
Errores: "⚠ Errores (2):\nFila X: Mensaje..."
```

### Validación
```
Sin datos: "No se encontraron productos en el CSV."
Duplicado: "YA EXISTE UN PRODUCTO CON LA CLAVE"
Campos vacíos: "NOMBRE Y CATEGORÍA SON OBLIGATORIOS."
```

---

## 📐 Dimensiones

### Botones
```
Ancho:     Variable (auto-fit)
Alto:      32px
Padding:   8px 12px
Margen:    10px (gap)
```

### Modal Vista Previa
```
Ancho:     90% viewport
Alto:      80vh (viewport height)
Max-width: Sin límite
Posición:  Centrada (fixed overlay)
Z-index:   9999
```

### Barra de Progreso
```
Ancho:     300px
Alto:      Auto
Posición:  Inferior derecha
Offset:    20px from edges
Z-index:   9999
```

---

## 🎯 Experiencia del Usuario

**Paso 1:** Ver dos botones nuevos (inmediato)
**Paso 2:** Hacer clic descargar plantilla (1 segundo)
**Paso 3:** Completar datos en Excel (variable)
**Paso 4:** Hacer clic cargar CSV (1 segundo)
**Paso 5:** Revisar previsualización (5 segundos)
**Paso 6:** Confirmar carga (1 segundo)
**Paso 7:** Ver barra de progreso (5-30 segundos)
**Paso 8:** Revisar resultado (2 segundos)
**Paso 9:** Tabla actualizada (automático)

**Tiempo total:** 3-5 minutos (incluye llenar datos)

---

## ✨ Detalles de Pulido

- Botones con hover effects
- Modal con scroll interno
- Barra de progreso animada
- Iconos emoji claros
- Mensajes de error contextuales
- Validaciones silenciosas
- Actualización automática sin refresh
- Responsive en móvil

---

**Todo esto está implementado y listo para usar** ✅
