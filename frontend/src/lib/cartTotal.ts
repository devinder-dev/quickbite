import type { CartLine } from "../types.ts";

// A client-side PREVIEW total only — the server always recomputes the
// authoritative total itself (services/order/src/pricing.ts#computeTotalCents).
// Deliberately not shared/imported across that boundary: the client must
// never be the source of truth for what a customer is charged.
export function computeCartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
}
