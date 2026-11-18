import { connect, consume, EventName, RedisIdempotency, type OrderPlaced } from "@quickbite/shared";
import { createPendingOrder } from "./db.ts";
import { startOutboxPoller } from "./outbox.ts";
import { buildServer } from "./server.ts";

const PORT = Number(process.env.PORT ?? 3003);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

// Step 1: Connect to RabbitMQ, start the outbox poller, subscribe to
// order.placed. Top-level await, not a .then() chain — a test (or anything
// else) that imports this module needs the consumer to actually be
// registered by the time the import resolves, or an event published right
// after import has nowhere to land (a topic exchange silently drops a
// message with no matching binding yet — not a retryable failure, a lost
// one). Only the HTTP listen below is allowed to stay fire-and-forget,
// since nothing's timing depends on it.
const { channel } = await connect(RABBITMQ_URL);
startOutboxPoller(channel);

const idem = new RedisIdempotency("kitchen");

// Kitchen no longer decides anything automatically — it just records that
// an order arrived. A human (via the dashboard's HTTP routes in server.ts)
// accepts it, starts cooking, and marks it ready.
await consume(
  channel,
  { queue: "kitchen.order-events", routingKeys: [EventName.OrderPlaced] },
  async (event) => {
    const e = event as OrderPlaced;
    if (await idem.alreadyProcessed(e.eventId)) return; // safe on redelivery, durable across restarts

    await createPendingOrder(e.orderId, e.customerId, e.items, e.totalCents);
    console.log(`✅ kitchen received order ${e.orderId}, awaiting staff action`);
  },
);

// Step 2: Build and start the HTTP server.
buildServer()
  .then((server) => server.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => console.log(`🚀 kitchen on ${PORT}`))
  .catch((err) => {
    console.error("❌ kitchen failed to start", err);
    process.exit(1);
  });
