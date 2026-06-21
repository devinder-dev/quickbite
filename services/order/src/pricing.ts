import type { OrderItem } from "@quickbite/shared";

// Pure logic, no I/O — the order's total is always derived from its items
// server-side, never trusted from client input. Extracted into its own
// function (rather than left inline in the route handler) specifically so
// it has a real unit test, separate from the integration tests that exercise
// the full HTTP + DB path.
export function computeTotalCents(items: Pick<OrderItem, "priceCents" | "quantity">[]): number {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}
