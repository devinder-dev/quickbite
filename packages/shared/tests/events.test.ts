import { expect, test } from "bun:test";
import { OrderPlaced, EventName } from "../src/events";

test("valid order.placed event passes schema", () => {
  const event = {
    type: EventName.OrderPlaced,
    eventId: "11111111-1111-1111-1111-111111111111",
    occurredAt: new Date().toISOString(),
    orderId: "22222222-2222-2222-2222-222222222222",
    customerId: "33333333-3333-3333-3333-333333333333",
    items: [
      {
        menuItemId: "44444444-4444-4444-4444-444444444444",
        name: "Margherita",
        quantity: 2,
        priceCents: 1200,
      },
    ],
    totalCents: 2400,
  };
  expect(() => OrderPlaced.parse(event)).not.toThrow();
});

test("order.placed with empty items is rejected", () => {
  const bad = {
    type: EventName.OrderPlaced,
    eventId: "11111111-1111-1111-1111-111111111111",
    occurredAt: new Date().toISOString(),
    orderId: "22222222-2222-2222-2222-222222222222",
    customerId: "33333333-3333-3333-3333-333333333333",
    items: [],
    totalCents: 0,
  };
  expect(() => OrderPlaced.parse(bad)).toThrow();
});
