import { publish, type EventName } from "@quickbite/shared";
import { getUnpublishedOutboxRows, markOutboxPublished } from "./db.ts";

type Channel = Parameters<typeof publish>[0];

// Step 1: Drain whatever's unpublished right now. Each row is published and
// marked independently — one row failing (e.g. a payload that somehow fails
// schema validation) must not block the rows after it.
async function drainOnce(channel: Channel): Promise<void> {
  const rows = await getUnpublishedOutboxRows();

  for (const row of rows) {
    try {
      publish(channel, row.routingKey as EventName, row.payload);
      await markOutboxPublished(row.id);
    } catch (err) {
      // Leave it unpublished — the next tick retries it. This is exactly
      // what makes the outbox resilient to a RabbitMQ outage: nothing here
      // gives up after one failure.
      console.error(`❌ outbox: failed to publish ${row.id} (${row.routingKey})`, err);
    }
  }
}

// Step 2: Poll on an interval, forever, for the lifetime of the process.
// WHY a poller instead of publishing inline right after commit: a poller
// also recovers a row that NEVER got an initial publish attempt at all —
// e.g. the process crashed between commit and the inline publish call.
// There is no equivalent recovery path for a purely inline drain.
// Returns the interval handle so callers (in practice, only tests) can stop
// it with clearInterval — production code runs this for the life of the
// process and never needs to.
export function startOutboxPoller(channel: Channel, intervalMs = 1000): ReturnType<typeof setInterval> {
  let draining = false;

  const timer = setInterval(() => {
    if (draining) return; // skip this tick if the previous one is still running
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
