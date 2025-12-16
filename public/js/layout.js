// public/js/layout.js
const sidebar = document.getElementById("sidebar");
const btnToggleSidebar = document.getElementById("btnToggleSidebar");
const pageTitle = document.getElementById("pageTitle");

/* =========================
   SIDEBAR: COLAPSAR / EXPANDIR
   ========================= */
btnToggleSidebar?.addEventListener("click", () => {
  const isCollapsed = sidebar.classList.toggle("collapsed");
  btnToggleSidebar.title = isCollapsed ? "Mostrar menú" : "Ocultar menú";

  // al colapsar, cerramos submenus para evitar "quedarse abiertos"
  if (isCollapsed) {
    document.querySelectorAll(".menu-group .submenu").forEach((sm) => {
      sm.style.display = "none";
    });
  }
});

/* =========================
   SUBMENÚS (solo si NO está colapsado)
   ========================= */
document.querySelectorAll(".menu-item.has-sub").forEach((item) => {
  item.addEventListener("click", () => {
    if (sidebar.classList.contains("collapsed")) return;

    const group = item.closest(".menu-group");
    const submenu = group?.querySelector(".submenu");
    if (!submenu) return;

    // cerrar otros submenus
    document.querySelectorAll(".menu-group .submenu").forEach((sm) => {
      if (sm !== submenu) sm.style.display = "none";
    });

    // toggle submenu actual
    submenu.style.display = submenu.style.display === "flex" ? "none" : "flex";
  });
});

/* =========================
   ACTIVO + TÍTULO + CARGA DE VISTA
   ========================= */
function setActive(el) {
  document.querySelectorAll(".menu-item, .submenu-item").forEach((x) => x.classList.remove("active"));
  el.classList.add("active");

  const title = el.dataset.title || el.textContent.trim();
  pageTitle.textContent = title;

  // si existe router simple, cargar vista
  const key = el.dataset.key;
  if (window.DC?.openView && key) {
    window.DC.openView(key, title);
  }
}

/* Clicks en items "finales" (no grupos) + subitems */
document
  .querySelectorAll(".menu-item:not(.has-sub), .submenu-item")
  .forEach((item) => item.addEventListener("click", () => setActive(item)));

/* =========================
   AL ENTRAR: tooltips + estado inicial
   ========================= */
function applyTitles() {
  document.querySelectorAll(".menu-item, .submenu-item").forEach((el) => {
    const text = el.dataset.title || el.textContent.trim();
    el.title = text;
  });
}
applyTitles();

/* =========================
   EXTRA: Mantener sección padre activa cuando se elige un submenú
   (opcional, pero útil)
   ========================= */
document.querySelectorAll(".submenu-item").forEach((sub) => {
  sub.addEventListener("click", () => {
    const group = sub.closest(".menu-group");
    const parent = group?.querySelector(".menu-item.has-sub");
    // Solo para "look": abre el submenu del padre si no está colapsado
    if (!sidebar.classList.contains("collapsed")) {
      const submenu = group?.querySelector(".submenu");
      if (submenu) submenu.style.display = "flex";
    }
    // Si quieres resaltar también el padre, descomenta:
    // parent?.classList.add("active");
  });
});

/* =========================
   VISTA INICIAL (si tienes DC router)
   ========================= */
(function boot() {
  const active = document.querySelector(".menu-item.active, .submenu-item.active");
  if (!active) return;

  const title = active.dataset.title || active.textContent.trim();
  pageTitle.textContent = title;

  const key = active.dataset.key;
  if (window.DC?.openView && key) {
    window.DC.openView(key, title);
  }
})();
