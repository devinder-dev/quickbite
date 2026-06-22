import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActiveOrderBanner } from "../../src/components/ActiveOrderBanner.tsx";
import { OrderTrackingProvider } from "../../src/context/OrderTrackingContext.tsx";
import { addOrderToHistory } from "../../src/lib/orderHistory.ts";

const ORDER_ID = "11111111-1111-1111-1111-111111111111";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function orderPayload(status: string) {
  return {
    orderId: ORDER_ID,
    customerId: "cust-1",
    status,
    totalCents: 1100,
    items: [{ menuItemId: "1", name: "Gyros", priceCents: 1100, quantity: 1 }],
  };
}

function renderBanner() {
  return render(
    <MemoryRouter>
      <OrderTrackingProvider>
        <ActiveOrderBanner />
      </OrderTrackingProvider>
    </MemoryRouter>,
  );
}

describe("ActiveOrderBanner", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("renders nothing when there's no active order", () => {
    renderBanner();
    expect(screen.queryByText(/Order #/)).toBeNull();
  });

  test("shows the current stage for the active order — visible regardless of which page hosts it", async () => {
    addOrderToHistory({ orderId: ORDER_ID, placedAt: new Date().toISOString(), items: [], totalCents: 1100 });
    global.fetch = (async () => jsonResponse(orderPayload("cooking"))) as typeof fetch;

    renderBanner();

    await waitFor(() => expect(screen.getByText(`Order #${ORDER_ID.slice(0, 8)}`)).toBeDefined());
    expect(screen.getByText("cooking").getAttribute("aria-current")).toBe("true");
  });

  test("clicking dismiss hides it", async () => {
    addOrderToHistory({ orderId: ORDER_ID, placedAt: new Date().toISOString(), items: [], totalCents: 1100 });
    global.fetch = (async () => jsonResponse(orderPayload("accepted"))) as typeof fetch;

    renderBanner();
    await waitFor(() => expect(screen.getByText(`Order #${ORDER_ID.slice(0, 8)}`)).toBeDefined());

    fireEvent.click(screen.getByLabelText("Dismiss order tracker"));
    expect(screen.queryByText(`Order #${ORDER_ID.slice(0, 8)}`)).toBeNull();
  });
});
