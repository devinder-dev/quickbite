import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { connect, OrderItem } from "@quickbite/shared";
import { createOrder, getOrderById } from "./db.ts";
import { startOutboxPoller } from "./outbox.ts";

const PORT = Number(process.env.PORT ?? 3002);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

const PlaceOrderBody = z.object({
  customerId: z.string().uuid(),
  items: z.array(OrderItem).min(1),
});

// Step 1: Build the server as its own function, separate from starting it.
// No RabbitMQ channel needed here anymore — the route handler only talks to
// Postgres; the outbox poller (started separately, below) owns the channel.
async function buildServer(): Promise<FastifyInstance> {
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

    // Step 2: Persist the order AND its outbox event in one transaction.
    // No publish() call here at all — the outbox poller (outbox.ts) is the
    // only thing that ever talks to RabbitMQ, on its own schedule. This is
    // the outbox pattern: the request path never blocks on, or depends on,
    // the message broker being reachable.
    await createOrder({ orderId, customerId, items, totalCents });
    server.log.info(`✅ order ${orderId} persisted`);

    return reply.code(201).send({ orderId, status: "placed", totalCents });
  });

  return server;
}

// Step 3: Connect to RabbitMQ (the poller needs the channel), start the
// poller, build the server, then start listening. The HTTP server and the
// poller run concurrently for the lifetime of this process.
connect(RABBITMQ_URL)
  .then(({ channel }) => {
    startOutboxPoller(channel);
    return buildServer();
  })
  .then((server) => server.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => console.log(`🚀 order on ${PORT}`))
  .catch((err) => {
    console.error("❌ order failed to start", err);
    process.exit(1);
  });
