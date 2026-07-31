import { OrderItems } from "./lib/orderItem.ts";
import type { CartLine, KitchenOrder, MenuItem, OrderDetail, OrderSummary } from "./types.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export class OrderNotFoundError extends ApiError {
  constructor(orderId: string) {
    super(`order ${orderId} not found`, 404);
  }
}

// Step 1: Read the menu. Throws ApiError on any non-2xx response — callers
// decide how to present that (error banner + retry), this layer never
// swallows a failure silently.
export async function getMenu(): Promise<MenuItem[]> {
  const res = await fetch("/api/menu");
  if (!res.ok) throw new ApiError("failed to load menu", res.status);
  return res.json();
}

// Step 2: Place an order. Validates client-side first (friendly, fast
// feedback) using the same rules the backend enforces — see
// lib/orderItem.ts for why this is a duplicated schema, not a shared import.
// The backend's own zod validation in services/order/src/server.ts remains
// the actual source of truth; this never replaces it.
export async function placeOrder(customerId: string, items: CartLine[]): Promise<OrderSummary> {
  const payload = items.map((item) => ({
    menuItemId: item.menuItemId,
    name: item.name,
    quantity: item.quantity,
    priceCents: item.priceCents,
  }));

  const parsed = OrderItems.safeParse(payload);
  if (!parsed.success) throw new ApiError("cart contains invalid items");

  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerId, items: parsed.data }),
  });

  if (!res.ok) throw new ApiError("failed to place order", res.status);
  return res.json();
}

// Step 3: Read an order's current status. A 404 maps to OrderNotFoundError
// specifically, so useOrderPolling can tell "not found yet" (keep polling
// within the bounded window) apart from any other failure.
export async function getOrder(orderId: string, signal?: AbortSignal): Promise<OrderDetail> {
  const res = await fetch(`/api/orders/${orderId}`, { signal });
  if (res.status === 404) throw new OrderNotFoundError(orderId);
  if (!res.ok) throw new ApiError("failed to load order", res.status);
  return res.json();
}

// Step 4: Kitchen dashboard — list every order not yet ready, and the three
// staff actions. Each action returns the updated order so the dashboard
// can update optimistically without a second round trip.
export async function getKitchenOrders(signal?: AbortSignal): Promise<KitchenOrder[]> {
  const res = await fetch("/api/kitchen/orders", { signal });
  if (!res.ok) throw new ApiError("failed to load kitchen orders", res.status);
  return res.json();
}

async function postKitchenAction(orderId: string, action: string): Promise<KitchenOrder> {
  const res = await fetch(`/api/kitchen/orders/${orderId}/${action}`, { method: "POST" });
  if (res.status === 404) throw new OrderNotFoundError(orderId);
  if (!res.ok) throw new ApiError(`failed to ${action} order`, res.status);
  return res.json();
}

export function acceptOrder(orderId: string): Promise<KitchenOrder> {
  return postKitchenAction(orderId, "accept");
}

export function startCooking(orderId: string): Promise<KitchenOrder> {
  return postKitchenAction(orderId, "start-cooking");
}

export function markReady(orderId: string): Promise<KitchenOrder> {
  return postKitchenAction(orderId, "ready");
}
