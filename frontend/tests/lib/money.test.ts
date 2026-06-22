import { describe, expect, test } from "bun:test";
import { formatCents } from "../../src/lib/money.ts";

describe("formatCents", () => {
  test("formats whole dollar amounts", () => {
    expect(formatCents(1200)).toBe("12.00");
  });

  test("formats amounts with cents", () => {
    expect(formatCents(1299)).toBe("12.99");
  });

  test("formats zero", () => {
    expect(formatCents(0)).toBe("0.00");
  });
});
