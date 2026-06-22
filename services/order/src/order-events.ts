import { consume, EventName, RedisIdempotency, type OrderAccepted, type OrderReady, type ResilientChannel } from "@quickbite/shared";
import { markOrderAccepted, markOrderReady } from "./db.ts";

// Kitchen owns the cooking workflow but only ever writes to its OWN
// database (kitchen_db). Without subscribing to its events here, order's
// own row — the one GET /orders/:id actually reads — would stay "placed"
// forever. Extracted into its own function (same pattern as
// startOutboxPoller) so both index.ts and tests can wire it up identically.
export async function startOrderEventConsumer(channel: ResilientChannel): Promise<void> {
  const idem = new RedisIdempotency("order");

  await consume(
    channel,
    { queue: "order.order-events", routingKeys: [EventName.OrderAccepted, EventName.OrderReady] },
    async (event) => {
      const e = event as OrderAccepted | OrderReady;
      if (await idem.alreadyProcessed(e.eventId)) return;

      if (e.type === EventName.OrderAccepted) await markOrderAccepted(e.orderId);
      else await markOrderReady(e.orderId);
    },
  );
}
