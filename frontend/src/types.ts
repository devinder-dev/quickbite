// Mirrors the gateway's actual response/request shapes (verified directly
// against services/menu/src/index.ts, services/order/src/server.ts, and
// services/order/src/db.ts — not guessed). Kept local to the frontend
// rather than imported from @quickbite/shared: that package's barrel
// (packages/shared/src/index.ts) re-exports mq.ts/idempotency.ts, which
// pull in amqplib/ioredis — Node-only libraries that aren't browser-safe
// and would otherwise get dragged into the frontend's bundle.

export type MenuItem = {
  id: string;
  name: string;
  price_cents: number;
};

export type CartLine = {
  menuItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
};

export type OrderStatus = "placed" | "accepted" | "ready";

export type OrderSummary = {
  orderId: string;
  status: OrderStatus | string;
  totalCents: number;
};

export type OrderDetail = {
  orderId: string;
  customerId: string;
  status: OrderStatus | string;
  totalCents: number;
  items: CartLine[];
};
