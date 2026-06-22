import { describe, expect, test } from "bun:test";
import { getOrCreateCustomerId } from "../../src/lib/customerId.ts";

// A minimal in-memory Storage fake — keeps this a true "no I/O" unit test,
// no real DOM/localStorage needed even though happy-dom is registered for
// component tests elsewhere in this package.
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

describe("getOrCreateCustomerId", () => {
  test("generates a UUID on first call", () => {
    const id = getOrCreateCustomerId(fakeStorage());
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("returns the same id on subsequent calls with the same storage", () => {
    const storage = fakeStorage();
    const first = getOrCreateCustomerId(storage);
    const second = getOrCreateCustomerId(storage);
    expect(second).toBe(first);
  });

  test("generates a different id for a fresh storage", () => {
    const a = getOrCreateCustomerId(fakeStorage());
    const b = getOrCreateCustomerId(fakeStorage());
    expect(a).not.toBe(b);
  });
});
