import { describe, expect, test } from "bun:test";
import { OrderItem, OrderItems } from "../../src/lib/orderItem.ts";

const VALID = {
  menuItemId: "44444444-4444-4444-4444-444444444444",
  name: "Margherita",
  quantity: 1,
  priceCents: 1200,
};

describe("OrderItem", () => {
  test("accepts a valid item", () => {
    expect(OrderItem.safeParse(VALID).success).toBe(true);
  });

  test("rejects a non-uuid menuItemId", () => {
    expect(OrderItem.safeParse({ ...VALID, menuItemId: "not-a-uuid" }).success).toBe(false);
  });

  test("rejects a zero quantity", () => {
    expect(OrderItem.safeParse({ ...VALID, quantity: 0 }).success).toBe(false);
  });

  test("rejects a negative priceCents", () => {
    expect(OrderItem.safeParse({ ...VALID, priceCents: -1 }).success).toBe(false);
  });
});

describe("OrderItems", () => {
  test("rejects an empty array", () => {
    expect(OrderItems.safeParse([]).success).toBe(false);
  });

  test("accepts a non-empty array of valid items", () => {
    expect(OrderItems.safeParse([VALID]).success).toBe(true);
  });
});
