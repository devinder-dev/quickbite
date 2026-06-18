import Fastify from "fastify";
import { connect, consume, Idempotency, EventName } from "@quickbite/shared";

const PORT = Number(process.env.PORT ?? 3004);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

const { channel } = await connect(RABBITMQ_URL);
const idem = new Idempotency();

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
    if (idem.alreadyProcessed(e.eventId)) return;
    // TODO: send real email/push (e.g. Resend). For now, log it.
    console.log(`[notify] order ${e.orderId}: ${raw.fields.routingKey}`);
  },
);

const app = Fastify({ logger: true });
app.get("/health", async () => ({ status: "ok", service: "notification" }));
app.listen({ port: PORT, host: "0.0.0.0" }).then(() => app.log.info(`notification on ${PORT}`));
