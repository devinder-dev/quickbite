import Fastify from "fastify";
import {
  connect, consume, publish, Idempotency,
  EventName, type OrderPlaced,
} from "@quickbite/shared";

const PORT = Number(process.env.PORT ?? 3003);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

const { channel } = await connect(RABBITMQ_URL);
const idem = new Idempotency();

// Kitchen reacts to placed orders: accept, then mark ready a bit later.
await consume(
  channel,
  { queue: "kitchen.order-events", routingKeys: [EventName.OrderPlaced] },
  async (event) => {
    const e = event as OrderPlaced;
    if (idem.alreadyProcessed(e.eventId)) return; // safe on redelivery

    publish(channel, EventName.OrderAccepted, {
      type: EventName.OrderAccepted,
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId: e.orderId,
      etaMinutes: 20,
    });

    // Simulate cooking time, then announce ready.
    setTimeout(() => {
      publish(channel, EventName.OrderReady, {
        type: EventName.OrderReady,
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        orderId: e.orderId,
      });
    }, 3000);
  },
);

const app = Fastify({ logger: true });
app.get("/health", async () => ({ status: "ok", service: "kitchen" }));
app.listen({ port: PORT, host: "0.0.0.0" }).then(() => app.log.info(`kitchen on ${PORT}`));
