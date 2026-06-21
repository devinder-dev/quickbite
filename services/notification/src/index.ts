import Fastify, { type FastifyInstance } from "fastify";
import { connect, consume, RedisIdempotency, EventName } from "@quickbite/shared";
import { recordNotification } from "./db.ts";

const PORT = Number(process.env.PORT ?? 3004);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

// Step 1: Build the server as its own function, separate from starting it.
async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: true });
  server.get("/health", async () => ({ status: "ok", service: "notification" }));
  return server;
}

// Step 2: Connect to RabbitMQ and subscribe to every order event.
const { channel } = await connect(RABBITMQ_URL);
const idem = new RedisIdempotency("notification");

// Notification listens to ALL order events and tells the customer.
// Adding this service required ZERO changes to order or kitchen — that's the point.
await consume(
  channel,
  {
    queue: "notification.order-events",
    routingKeys: [EventName.OrderPlaced, EventName.OrderAccepted, EventName.OrderReady],
  },
  async (event, raw) => {
    const e = event as { eventId: string; orderId: string };
    if (await idem.alreadyProcessed(e.eventId)) return; // safe on redelivery, durable across restarts

    // Step 3: Record the audit row, then "notify" (still a console.log).
    await recordNotification(e.orderId, raw.fields.routingKey);
    // TODO: send real email/push (e.g. Resend). For now, log it.
    console.log(`✅ [notify] order ${e.orderId}: ${raw.fields.routingKey}`);
  },
);

// Step 4: Build and start the HTTP server (health check only).
buildServer()
  .then((server) => server.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => console.log(`🚀 notification on ${PORT}`))
  .catch((err) => {
    console.error("❌ notification failed to start", err);
    process.exit(1);
  });
