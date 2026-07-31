import { publish, type EventName } from "@quickbite/shared";
import { getUnpublishedOutboxRows, markOutboxPublished } from "./db.ts";

type Channel = Parameters<typeof publish>[0];

// Identical pattern to services/order/src/outbox.ts — see that file for the
// full rationale. Kitchen's accept/start-cooking/ready actions are now
// HTTP-triggered just like order's POST /orders, so they get the same
// outbox durability guarantee.
async function drainOnce(channel: Channel): Promise<void> {
  const rows = await getUnpublishedOutboxRows();

  for (const row of rows) {
    try {
      publish(channel, row.routingKey as EventName, row.payload);
      await markOutboxPublished(row.id);
    } catch (err) {
      console.error(`❌ outbox: failed to publish ${row.id} (${row.routingKey})`, err);
    }
  }
}

export function startOutboxPoller(channel: Channel, intervalMs = 1000): ReturnType<typeof setInterval> {
  let draining = false;

  const timer = setInterval(() => {
    if (draining) return;
    draining = true;
    drainOnce(channel)
      .catch((err) => console.error("❌ outbox: drain tick failed", err))
      .finally(() => {
        draining = false;
      });
  }, intervalMs);

  console.log(`🚀 outbox poller started (every ${intervalMs}ms)`);
  return timer;
}
