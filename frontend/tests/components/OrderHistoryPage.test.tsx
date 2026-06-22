import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OrderHistoryPage } from "../../src/pages/OrderHistoryPage.tsx";
import { addOrderToHistory } from "../../src/lib/orderHistory.ts";

describe("OrderHistoryPage", () => {
  test("shows a message when there's no history yet", () => {
    localStorage.clear();
    render(<OrderHistoryPage />, { wrapper: MemoryRouter });
    expect(screen.getByText("No past orders yet on this browser.")).toBeDefined();
  });

  test("shows a readable summary instead of a raw UUID", () => {
    localStorage.clear();
    addOrderToHistory({
      orderId: "11111111-2222-3333-4444-555555555555",
      placedAt: "2026-01-01T12:00:00Z",
      items: [
        { menuItemId: "1", name: "Gyros", priceCents: 1100, quantity: 2 },
        { menuItemId: "2", name: "Greek Salad", priceCents: 900, quantity: 1 },
      ],
      totalCents: 3100,
    });

    render(<OrderHistoryPage />, { wrapper: MemoryRouter });

    // Shortened order number, not the full UUID.
    expect(screen.getByText("Order #11111111")).toBeDefined();
    expect(screen.queryByText("11111111-2222-3333-4444-555555555555")).toBeNull();

    expect(screen.getByText("2× Gyros, 1× Greek Salad")).toBeDefined();
    expect(screen.getByText(/\$31\.00/)).toBeDefined();
  });
});
