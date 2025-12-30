/* ===========================
   MÓDULO DE AJUSTES
   =========================== */

const TEMAS = {
  oscuro: {
    nombre: "Oscuro",
    description: "Tema oscuro profesional",
    colors: {
      "--bg1": "#0b1020",
      "--bg2": "#111a33",
      "--card": "rgba(255,255,255,.06)",
      "--stroke": "rgba(255,255,255,.10)",
      "--text": "#e9eefc",
      "--muted": "rgba(233,238,252,.70)"
    }
  },
  claro: {
    nombre: "Claro",
    description: "Tema claro y limpio",
    colors: {
      "--bg1": "#f5f7fa",
      "--bg2": "#ffffff",
      "--card": "rgba(0,0,0,.04)",
      "--stroke": "rgba(0,0,0,.10)",
      "--text": "#1a202c",
      "--muted": "rgba(26,32,44,.70)"
    }
  },
  multicolor: {
    nombre: "Multicolor",
    description: "Tema vibrante con gradientes",
    colors: {
      "--bg1": "#0f0f1e",
      "--bg2": "#1a1a2e",
      "--card": "rgba(110,231,183,.08)",
      "--stroke": "rgba(99,102,241,.15)",
      "--text": "#f0f4ff",
      "--muted": "rgba(240,244,255,.75)"
    }
  }
};

function applyTheme(themeName) {
  const tema = TEMAS[themeName];
  if (!tema) {
    console.warn("Tema no encontrado:", themeName);
    return;
  }

  // Aplicar colores al documento
  Object.entries(tema.colors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });

  // Guardar preferencia
  localStorage.setItem("dc_tema", themeName);
  document.body.dataset.tema = themeName;
  console.log('[ajustes] Tema aplicado:', themeName);
}

function getCurrentTheme() {
  return localStorage.getItem("dc_tema") || "oscuro";
}

function loadSavedTheme() {
  const tema = getCurrentTheme();
  applyTheme(tema);
  document.body.dataset.tema = tema;
}

function ajustesTemplate() {
  const temaActual = getCurrentTheme();
  
  return `
  <div class="ajustes-container">
    <div class="ajustes-section">
      <h2>Preferencias de Tema</h2>
      <p class="ajustes-description">Selecciona tu tema preferido para cambiar la apariencia de la aplicación</p>
      
      <div class="temas-grid">
        ${Object.entries(TEMAS).map(([key, tema]) => `
          <div class="tema-card ${temaActual === key ? 'active' : ''}" data-tema="${key}">
            <div class="tema-preview">
              <div class="preview-color" style="background: ${tema.colors['--bg1']}"></div>
              <div class="preview-color" style="background: ${tema.colors['--bg2']}"></div>
            </div>
            <h3>${tema.nombre}</h3>
            <p>${tema.description}</p>
            <button class="tema-btn dc-btn ${temaActual === key ? 'active' : ''}" data-tema="${key}">
              ${temaActual === key ? '✓ Activo' : 'Seleccionar'}
            </button>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="ajustes-section">
      <h2>Información</h2>
      <div class="info-item">
        <span>Versión:</span>
        <strong>2.0.0</strong>
      </div>
      <div class="info-item">
        <span>Última actualización:</span>
        <strong>${new Date().toLocaleDateString('es-ES')}</strong>
      </div>
    </div>
  </div>
  `;
}

function bindThemeEvents(container) {
  container.querySelectorAll(".tema-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tema = btn.dataset.tema;
      applyTheme(tema);
      
      // Actualizar UI
      container.querySelectorAll(".tema-card").forEach(card => {
        card.classList.toggle("active", card.dataset.tema === tema);
      });
      
      container.querySelectorAll(".tema-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.tema === tema);
        b.textContent = b.dataset.tema === tema ? "✓ Activo" : "Seleccionar";
      });
    });
  });
}

export async function mountAjustes(container) {
  container.innerHTML = ajustesTemplate();
  bindThemeEvents(container);
}

// Cargar tema guardado al iniciar
loadSavedTheme();
