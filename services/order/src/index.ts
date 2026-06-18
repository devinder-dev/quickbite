import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { connect, publish, EventName, OrderItem } from "@quickbite/shared";
import { createOrder, getOrderById } from "./db.ts";

const PORT = Number(process.env.PORT ?? 3002);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

// connect()'s return type isn't re-exported by @quickbite/shared, so derive
// the channel type locally instead of importing amqplib directly here.
type Channel = Awaited<ReturnType<typeof connect>>["channel"];

const PlaceOrderBody = z.object({
  customerId: z.string().uuid(),
  items: z.array(OrderItem).min(1),
});

// Step 1: Build the server as its own function, separate from starting it.
// The RabbitMQ channel is connected before buildServer runs and passed in,
// since both the route handler and the startup sequence need it.
async function buildServer(channel: Channel): Promise<FastifyInstance> {
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ status: "ok", service: "order" }));

  server.get("/orders/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = await getOrderById(id);
    if (!found) return reply.code(404).send({ error: "not found" });
    return found;
  });

  server.post("/orders", async (req, reply) => {
    const parsed = PlaceOrderBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { customerId, items } = parsed.data;
    const orderId = crypto.randomUUID();
    const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

    // Step 2: Persist (commit the transaction) ... then publish.
    // Never the other way round — a customer should never see an
    // order.placed-triggered notification for an order that doesn't
    // actually exist in our own database.
    await createOrder({ orderId, customerId, items, totalCents });
    server.log.info(`✅ order ${orderId} persisted`);

    publish(channel, EventName.OrderPlaced, {
      type: EventName.OrderPlaced,
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId,
      customerId,
      items,
      totalCents,
    });

    return reply.code(201).send({ orderId, status: "placed", totalCents });
  });

  return server;
}

// Step 3: Connect to RabbitMQ, build the server, then start listening.
connect(RABBITMQ_URL)
  .then(({ channel }) => buildServer(channel))
  .then((server) => server.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => console.log(`🚀 order on ${PORT}`))
  .catch((err) => {
    console.error("❌ order failed to start", err);
    process.exit(1);
  });
