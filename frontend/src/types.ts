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

export type OrderStatus = "placed" | "accepted" | "cooking" | "ready";

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

// Mirrors services/kitchen/src/db.ts#KitchenOrder exactly — its routes
// return the already-camelCased object from db.ts's own fromRow(), not the
// raw snake_case Postgres columns, so this is camelCase too (unlike
// MenuItem above, which IS the raw row shape since menu's route returns
// straight from sql<MenuItem[]>` with no transform step).
export type KitchenOrder = {
  orderId: string;
  customerId: string;
  items: CartLine[];
  totalCents: number;
  etaMinutes: number | null;
  status: "pending" | "accepted" | "cooking" | "ready" | string;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
};
