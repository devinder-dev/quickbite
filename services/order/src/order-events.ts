import {
  consume,
  EventName,
  RedisIdempotency,
  type OrderAccepted,
  type OrderCooking,
  type OrderReady,
  type ResilientChannel,
} from "@quickbite/shared";
import { markOrderAccepted, markOrderCooking, markOrderReady } from "./db.ts";

// Kitchen owns the cooking workflow but only ever writes to its OWN
// database (kitchen_db). Without subscribing to its events here, order's
// own row — the one GET /orders/:id actually reads — would stay "placed"
// forever. Extracted into its own function (same pattern as
// startOutboxPoller) so both index.ts and tests can wire it up identically.
export async function startOrderEventConsumer(channel: ResilientChannel): Promise<void> {
  const idem = new RedisIdempotency("order");

  await consume(
    channel,
    {
      queue: "order.order-events",
      routingKeys: [EventName.OrderAccepted, EventName.OrderCooking, EventName.OrderReady],
      // prefetch: 1 — these three events for the SAME order must be applied
      // in the order they happened, and each handler's UPDATE has no
      // ordering/version check of its own. The default prefetch (10) lets
      // RabbitMQ deliver multiple unacked messages concurrently, so two
      // concurrent async handlers for the same order could finish their
      // UPDATEs out of order — e.g. "ready" committing before "cooking"
      // does, leaving the row permanently stuck on "cooking" even though
      // every event was actually delivered and handled. Forcing strictly
      // sequential processing (ack one before the next is even delivered)
      // is the simplest correct fix — this consumer's whole job is to
      // mirror a sequence, so there's no benefit to concurrency here, only
      // risk.
      prefetch: 1,
    },
    async (event) => {
      const e = event as OrderAccepted | OrderCooking | OrderReady;
      if (await idem.alreadyProcessed(e.eventId)) return;

      if (e.type === EventName.OrderAccepted) {
        await markOrderAccepted(e.orderId);
        console.log(`✅ order ${e.orderId} synced to accepted`);
      } else if (e.type === EventName.OrderCooking) {
        await markOrderCooking(e.orderId);
        console.log(`✅ order ${e.orderId} synced to cooking`);
      } else {
        await markOrderReady(e.orderId);
        console.log(`✅ order ${e.orderId} synced to ready`);
      }
    },
  );
}
