import { loyaltyTier } from "../customer/model.js";

// Call with the current customer's invoice list. Awards come from immutable
// invoice totals, independently of delivery status and the real rewards ledger.
export function summarizeSampleRewards(orders = []) {
  const seen = new Set();
  let points = 0;
  for (const order of orders) {
    if (!order || typeof order.id !== "string" || !order.id || seen.has(order.id)) continue;
    seen.add(order.id);
    if (Number.isSafeInteger(order.points) && order.points >= 0) points += order.points;
  }
  return { points, invoiceCount: seen.size, tier: loyaltyTier(points) };
}
