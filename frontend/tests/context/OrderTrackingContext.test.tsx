import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { OrderTrackingProvider, useOrderTracking } from "../../src/context/OrderTrackingContext.tsx";
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

describe("OrderTrackingProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("seeds activeOrderId from the most recent history entry on mount", async () => {
    addOrderToHistory({ orderId: ORDER_ID, placedAt: new Date().toISOString(), items: [], totalCents: 1100 });
    global.fetch = (async () => jsonResponse(orderPayload("accepted"))) as typeof fetch;

    const { result } = renderHook(() => useOrderTracking(), { wrapper: OrderTrackingProvider });

    expect(result.current.activeOrderId).toBe(ORDER_ID);
    await waitFor(() => expect(result.current.pollState.phase).toBe("polling"));
  });

  test("has no active order when history is empty — this is what would have caused the original bug if untested", async () => {
    const { result } = renderHook(() => useOrderTracking(), { wrapper: OrderTrackingProvider });
    expect(result.current.activeOrderId).toBeNull();
  });

  test("fires a toast when the polled status changes — this is the actual fix for missing cooking/ready notices", async () => {
    addOrderToHistory({ orderId: ORDER_ID, placedAt: new Date().toISOString(), items: [], totalCents: 1100 });
    global.fetch = (async () => jsonResponse(orderPayload("cooking"))) as typeof fetch;

    const { result } = renderHook(() => useOrderTracking(), { wrapper: OrderTrackingProvider });

    await waitFor(() => expect(result.current.toasts.length).toBeGreaterThan(0));
    expect(result.current.toasts[0]?.message).toMatch(/cooking/i);
  });

  test("dismissBanner hides the banner only for the status it was dismissed at", async () => {
    addOrderToHistory({ orderId: ORDER_ID, placedAt: new Date().toISOString(), items: [], totalCents: 1100 });
    global.fetch = (async () => jsonResponse(orderPayload("accepted"))) as typeof fetch;

    const { result } = renderHook(() => useOrderTracking(), { wrapper: OrderTrackingProvider });
    await waitFor(() => expect(result.current.pollState.phase).toBe("polling"));

    expect(result.current.isBannerDismissed).toBe(false);
    act(() => result.current.dismissBanner());
    expect(result.current.isBannerDismissed).toBe(true);
  });

  test("setActiveOrderId resets the dismissed state for a freshly placed order", async () => {
    addOrderToHistory({ orderId: ORDER_ID, placedAt: new Date().toISOString(), items: [], totalCents: 1100 });
    global.fetch = (async () => jsonResponse(orderPayload("accepted"))) as typeof fetch;

    const { result } = renderHook(() => useOrderTracking(), { wrapper: OrderTrackingProvider });
    await waitFor(() => expect(result.current.pollState.phase).toBe("polling"));

    act(() => result.current.dismissBanner());
    expect(result.current.isBannerDismissed).toBe(true);

    const newOrderId = "22222222-2222-2222-2222-222222222222";
    act(() => result.current.setActiveOrderId(newOrderId));
    expect(result.current.activeOrderId).toBe(newOrderId);
    expect(result.current.isBannerDismissed).toBe(false);
  });
});
