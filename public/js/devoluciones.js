// Módulo de Devoluciones - En Construcción

export async function mountDevoluciones(container){
  if(!container) throw new Error("mountDevoluciones: container no recibido");

  document.body.classList.remove("page-ventas","page-compras","page-inventario");
  document.body.classList.add("page-ventas");

  container.innerHTML = `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;">
      <div style="text-align:center;max-width:500px;">
        <div style="font-size:120px;margin-bottom:20px;">🚧</div>
        <h1 style="margin:0 0 16px 0;font-size:32px;font-weight:700;color:#1a1a1a;">
          Módulo en Construcción
        </h1>
        <p style="margin:0 0 24px 0;font-size:16px;color:#666666;line-height:1.6;">
          El módulo de <strong>Devoluciones</strong> está siendo desarrollado y pronto estará disponible con todas las funcionalidades necesarias para gestionar tus devoluciones de manera eficiente.
        </p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <div style="background:#f5f5f5;padding:16px;border-radius:8px;flex:1;min-width:150px;border-left:4px solid #667eea;">
            <div style="font-size:24px;margin-bottom:8px;">📋</div>
            <div style="font-size:12px;font-weight:600;color:#1a1a1a;">Gestión completa</div>
            <div style="font-size:11px;color:#666666;margin-top:4px;">de devoluciones</div>
          </div>
          <div style="background:#f5f5f5;padding:16px;border-radius:8px;flex:1;min-width:150px;border-left:4px solid #667eea;">
            <div style="font-size:24px;margin-bottom:8px;">💰</div>
            <div style="font-size:12px;font-weight:600;color:#1a1a1a;">Reembolsos</div>
            <div style="font-size:11px;color:#666666;margin-top:4px;">y seguimiento</div>
          </div>
          <div style="background:#f5f5f5;padding:16px;border-radius:8px;flex:1;min-width:150px;border-left:4px solid #667eea;">
            <div style="font-size:24px;margin-bottom:8px;">📊</div>
            <div style="font-size:12px;font-weight:600;color:#1a1a1a;">Reportes</div>
            <div style="font-size:11px;color:#666666;margin-top:4px;">detallados</div>
          </div>
        </div>
        <p style="margin:24px 0 0 0;font-size:13px;color:#999999;">
          Estamos trabajando en brindarte la mejor experiencia. ¡Pronto lanzaremos esta funcionalidad!
        </p>
      </div>
    </div>
  `;
}
