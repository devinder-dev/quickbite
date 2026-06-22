import { describe, expect, test } from "bun:test";
import { computeCartTotal } from "../../src/lib/cartTotal.ts";

describe("computeCartTotal", () => {
  test("sums price * quantity across multiple lines", () => {
    const total = computeCartTotal([
      { menuItemId: "1", name: "Margherita", priceCents: 1200, quantity: 2 },
      { menuItemId: "2", name: "Pepperoni", priceCents: 1400, quantity: 1 },
    ]);
    expect(total).toBe(3800);
  });

  test("handles a single line", () => {
    expect(computeCartTotal([{ menuItemId: "1", name: "Margherita", priceCents: 999, quantity: 1 }])).toBe(999);
  });

  test("returns 0 for an empty cart", () => {
    expect(computeCartTotal([])).toBe(0);
  });
});
