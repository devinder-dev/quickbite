import { describe, expect, test } from "bun:test";
import { computeTotalCents } from "../src/pricing.ts";

// Pure unit test — no containers, no I/O, no network. Separate from
// place-order.test.ts's integration coverage of the full HTTP + DB path.
describe("computeTotalCents", () => {
  test("sums price * quantity across multiple items", () => {
    const total = computeTotalCents([
      { priceCents: 1200, quantity: 2 },
      { priceCents: 1400, quantity: 1 },
    ]);
    expect(total).toBe(3800);
  });

  test("handles a single item", () => {
    expect(computeTotalCents([{ priceCents: 999, quantity: 1 }])).toBe(999);
  });

  test("returns 0 for an empty list", () => {
    expect(computeTotalCents([])).toBe(0);
  });
});
