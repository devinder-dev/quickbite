import { describe, expect, test } from "bun:test";
import { addOrderToHistory, getOrderHistory } from "../../src/lib/orderHistory.ts";

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
  test("adds the most recent order to the front", () => {
    const storage = fakeStorage();
    addOrderToHistory({ orderId: "a", placedAt: "2026-01-01T00:00:00Z" }, storage);
    const updated = addOrderToHistory({ orderId: "b", placedAt: "2026-01-02T00:00:00Z" }, storage);
    expect(updated.map((e) => e.orderId)).toEqual(["b", "a"]);
  });

  test("de-duplicates by orderId, moving the existing entry to the front", () => {
    const storage = fakeStorage();
    addOrderToHistory({ orderId: "a", placedAt: "2026-01-01T00:00:00Z" }, storage);
    addOrderToHistory({ orderId: "b", placedAt: "2026-01-02T00:00:00Z" }, storage);
    const updated = addOrderToHistory({ orderId: "a", placedAt: "2026-01-03T00:00:00Z" }, storage);
    expect(updated).toEqual([
      { orderId: "a", placedAt: "2026-01-03T00:00:00Z" },
      { orderId: "b", placedAt: "2026-01-02T00:00:00Z" },
    ]);
  });

  test("caps history at 10 entries", () => {
    const storage = fakeStorage();
    for (let i = 0; i < 12; i++) {
      addOrderToHistory({ orderId: `order-${i}`, placedAt: new Date().toISOString() }, storage);
    }
    expect(getOrderHistory(storage)).toHaveLength(10);
  });
});
