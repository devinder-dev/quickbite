import Fastify, { type FastifyInstance } from "fastify";
import {
  connect, consume, publish, Idempotency,
  EventName, type OrderPlaced,
} from "@quickbite/shared";
import { acceptOrder, markOrderReady } from "./db.ts";

const PORT = Number(process.env.PORT ?? 3003);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

// Step 1: Build the server as its own function, separate from starting it.
async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: true });
  server.get("/health", async () => ({ status: "ok", service: "kitchen" }));
  return server;
}

// Step 2: Connect to RabbitMQ, then subscribe to order.placed.
const { channel } = await connect(RABBITMQ_URL);
const idem = new Idempotency();

// Kitchen reacts to placed orders: persist + accept, then mark ready a bit later.
await consume(
  channel,
  { queue: "kitchen.order-events", routingKeys: [EventName.OrderPlaced] },
  async (event) => {
    const e = event as OrderPlaced;
    if (idem.alreadyProcessed(e.eventId)) return; // safe on redelivery

    const etaMinutes = 20;

    // Step 3: Persist the acceptance, then publish — same persist-then-publish
    // ordering the order service uses, so a downstream consumer never reacts
    // to a kitchen decision that isn't actually recorded here yet.
    await acceptOrder(e.orderId, etaMinutes);
    console.log(`✅ kitchen accepted order ${e.orderId}`);

    publish(channel, EventName.OrderAccepted, {
      type: EventName.OrderAccepted,
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId: e.orderId,
      etaMinutes,
    });

    // Simulate cooking time, then mark ready and announce it.
    setTimeout(async () => {
      await markOrderReady(e.orderId);
      console.log(`✅ kitchen marked order ${e.orderId} ready`);

      publish(channel, EventName.OrderReady, {
        type: EventName.OrderReady,
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        orderId: e.orderId,
      });
    }, 3000);
  },
);

// Step 4: Build and start the HTTP server (health check only).
buildServer()
  .then((server) => server.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => console.log(`🚀 kitchen on ${PORT}`))
  .catch((err) => {
    console.error("❌ kitchen failed to start", err);
    process.exit(1);
  });
