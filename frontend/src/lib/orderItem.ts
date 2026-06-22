import { z } from "zod";

// Intentionally duplicates packages/shared/src/events.ts#OrderItem rather
// than importing it — that package's barrel re-exports mq.ts/idempotency.ts,
// which pull in amqplib/ioredis (Node-only, not browser-safe). This is a
// client-side PREVIEW check only, same "client previews, server stays
// authoritative" reasoning as cartTotal.ts: the backend's own zod
// validation in services/order/src/server.ts is the real source of truth,
// this just gives the user a friendly error before the request even leaves
// the browser.
export const OrderItem = z.object({
  menuItemId: z.string().uuid(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
});

export const OrderItems = z.array(OrderItem).min(1);
