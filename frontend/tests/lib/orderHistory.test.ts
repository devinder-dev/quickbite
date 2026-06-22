import { describe, expect, test } from "bun:test";
import { addOrderToHistory, getOrderHistory } from "../../src/lib/orderHistory.ts";
import type { CartLine } from "../../src/types.ts";

const ITEMS: CartLine[] = [{ menuItemId: "1", name: "Gyros", priceCents: 1100, quantity: 2 }];

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("getOrderHistory", () => {
  test("returns an empty array when nothing is stored", () => {
    expect(getOrderHistory(fakeStorage())).toEqual([]);
  });

  test("returns an empty array for corrupt storage content, never throws", () => {
    const storage = fakeStorage();
    storage.setItem("quickbite.orderHistory", "{not json");
    expect(getOrderHistory(storage)).toEqual([]);
  });
});

describe("addOrderToHistory", () => {
  test("adds the most recent order to the front, keeping its items/total snapshot", () => {
    const storage = fakeStorage();
    addOrderToHistory({ orderId: "a", placedAt: "2026-01-01T00:00:00Z", items: ITEMS, totalCents: 2200 }, storage);
    const updated = addOrderToHistory(
      { orderId: "b", placedAt: "2026-01-02T00:00:00Z", items: ITEMS, totalCents: 2200 },
      storage,
    );
    expect(updated.map((e) => e.orderId)).toEqual(["b", "a"]);
    expect(updated[0]?.items).toEqual(ITEMS);
    expect(updated[0]?.totalCents).toBe(2200);
  });

  test("de-duplicates by orderId, moving the existing entry to the front", () => {
    const storage = fakeStorage();
    addOrderToHistory({ orderId: "a", placedAt: "2026-01-01T00:00:00Z", items: ITEMS, totalCents: 2200 }, storage);
    addOrderToHistory({ orderId: "b", placedAt: "2026-01-02T00:00:00Z", items: ITEMS, totalCents: 2200 }, storage);
    const updated = addOrderToHistory(
      { orderId: "a", placedAt: "2026-01-03T00:00:00Z", items: ITEMS, totalCents: 2200 },
      storage,
    );
    expect(updated.map((e) => e.orderId)).toEqual(["a", "b"]);
    expect(updated[0]?.placedAt).toBe("2026-01-03T00:00:00Z");
  });

  test("caps history at 10 entries", () => {
    const storage = fakeStorage();
    for (let i = 0; i < 12; i++) {
      addOrderToHistory(
        { orderId: `order-${i}`, placedAt: new Date().toISOString(), items: ITEMS, totalCents: 2200 },
        storage,
      );
    }
    expect(getOrderHistory(storage)).toHaveLength(10);
  });
});
