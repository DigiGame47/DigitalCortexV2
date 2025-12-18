// Utilidades para compras: cálculo de nuevo costo promedio
export function computeNewCostoProm(oldStock, oldCosto, receivedQty, receivedUnitCost){
  const os = Number(oldStock || 0);
  const oc = Number(oldCosto || 0);
  const rq = Number(receivedQty || 0);
  const ruc = Number(receivedUnitCost || 0);
  const newStock = os + rq;
  if (newStock <= 0) return 0;
  const newTotalValue = (os * oc) + (rq * ruc);
  return newTotalValue / newStock;
}

// CommonJS fallback for Node tests
if (typeof module !== 'undefined' && module.exports){
  module.exports = { computeNewCostoProm };
}
