import { expect, test } from "bun:test";

// Unit-level example: the total is derived from items, not trusted from input.
function computeTotalCents(items: { priceCents: number; quantity: number }[]): number {
  return items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
}

test("order total is computed from items", () => {
  const total = computeTotalCents([
    { priceCents: 1200, quantity: 2 },
    { priceCents: 1400, quantity: 1 },
  ]);
  expect(total).toBe(3800);
});
