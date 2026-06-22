import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KitchenDashboardPage } from "../../src/pages/KitchenDashboardPage.tsx";

const PENDING_ORDER = {
  orderId: "11111111-1111-1111-1111-111111111111",
  customerId: "cust-1",
  items: [{ menuItemId: "1", name: "Gyros", priceCents: 1100, quantity: 1 }],
  totalCents: 1100,
  etaMinutes: null,
  status: "pending",
  createdAt: new Date().toISOString(),
  acceptedAt: null,
  readyAt: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("KitchenDashboardPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("shows the order and the right action button for its status", async () => {
    global.fetch = (async () => jsonResponse([PENDING_ORDER])) as typeof fetch;

    render(<KitchenDashboardPage />);

    await waitFor(() => expect(screen.getByText("Accept")).toBeDefined());
    expect(screen.getByText("#11111111")).toBeDefined();
    expect(screen.getByText("1 × Gyros")).toBeDefined();
  });

  test("clicking Accept calls the accept endpoint", async () => {
    let acceptCalled = false;
    global.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/accept")) {
        acceptCalled = true;
        return jsonResponse({ ...PENDING_ORDER, status: "accepted" });
      }
      return jsonResponse([PENDING_ORDER]);
    }) as typeof fetch;

    render(<KitchenDashboardPage />);
    await waitFor(() => expect(screen.getByText("Accept")).toBeDefined());

    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(acceptCalled).toBe(true));
  });

  test("shows an error message if loading orders fails, never a blank page", async () => {
    global.fetch = (async () => jsonResponse({ error: "boom" }, 500)) as typeof fetch;

    render(<KitchenDashboardPage />);

    await waitFor(() => expect(screen.getByText(/Something went wrong/)).toBeDefined());
  });

  test("shows a message when there are no active orders", async () => {
    global.fetch = (async () => jsonResponse([])) as typeof fetch;

    render(<KitchenDashboardPage />);

    await waitFor(() => expect(screen.getByText("No active orders.")).toBeDefined());
  });
});
