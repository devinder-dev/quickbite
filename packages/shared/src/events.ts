import { z } from "zod";

/**
 * The single source of truth for cross-service events.
 * Add a new event here FIRST (name + schema), then implement it.
 * See the event catalog in CLAUDE.md.
 */

export const EXCHANGE = "quickbite.events";

export const EventName = {
  OrderPlaced: "order.placed",
  OrderAccepted: "order.accepted",
  OrderCooking: "order.cooking",
  OrderReady: "order.ready",
} as const;
export type EventName = (typeof EventName)[keyof typeof EventName];

// Every event carries this envelope. eventId is used for idempotent consumers.
const envelope = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
});

export const OrderItem = z.object({
  menuItemId: z.string().uuid(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
});
export type OrderItem = z.infer<typeof OrderItem>;

export const OrderPlaced = envelope.extend({
  type: z.literal(EventName.OrderPlaced),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  items: z.array(OrderItem).min(1),
  totalCents: z.number().int().nonnegative(),
});
export type OrderPlaced = z.infer<typeof OrderPlaced>;

export const OrderAccepted = envelope.extend({
  type: z.literal(EventName.OrderAccepted),
  orderId: z.string().uuid(),
  etaMinutes: z.number().int().positive(),
});
export type OrderAccepted = z.infer<typeof OrderAccepted>;

export const OrderCooking = envelope.extend({
  type: z.literal(EventName.OrderCooking),
  orderId: z.string().uuid(),
});
export type OrderCooking = z.infer<typeof OrderCooking>;

export const OrderReady = envelope.extend({
  type: z.literal(EventName.OrderReady),
  orderId: z.string().uuid(),
});
export type OrderReady = z.infer<typeof OrderReady>;

// Routing key -> schema. mq.ts uses this to validate on publish and consume.
export const eventSchemas = {
  [EventName.OrderPlaced]: OrderPlaced,
  [EventName.OrderAccepted]: OrderAccepted,
  [EventName.OrderCooking]: OrderCooking,
  [EventName.OrderReady]: OrderReady,
} as const;
