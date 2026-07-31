import { describe, expect, test } from "bun:test";
import { getDishInfo } from "../../src/lib/dishInfo.ts";

describe("getDishInfo", () => {
  test("returns known emoji/description for a known dish", () => {
    expect(getDishInfo("Gyros")).toEqual({ emoji: "🥙", description: "Grilled meat, pita, tzatziki, tomato, onion" });
  });

  test("is case-insensitive", () => {
    expect(getDishInfo("GREEK SALAD").emoji).toBe("🥗");
  });

  test("falls back to a generic plate for an unknown dish, never throws", () => {
    expect(getDishInfo("Mystery Dish")).toEqual({ emoji: "🍽️", description: "" });
  });
});
