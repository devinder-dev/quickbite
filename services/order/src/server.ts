import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { OrderItem } from "@quickbite/shared";
import { createOrder, getOrderById } from "./db.ts";

const PlaceOrderBody = z.object({
  customerId: z.string().uuid(),
  items: z.array(OrderItem).min(1),
});

// Build the server as its own function, separate from starting it. No
// RabbitMQ channel needed here — the route handler only talks to Postgres;
// the outbox poller (outbox.ts) owns the channel. Split into its own module
// (not just its own function) so tests can import buildServer() and call
// .inject() without ever running index.ts's connect()/listen() side effects.
export async function buildServer(): Promise<FastifyInstance> {
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

    // Persist the order AND its outbox event in one transaction. No
    // publish() call here at all — the outbox poller is the only thing
    // that ever talks to RabbitMQ, on its own schedule. This is the outbox
    // pattern: the request path never blocks on, or depends on, the
    // message broker being reachable.
    await createOrder({ orderId, customerId, items, totalCents });
    server.log.info(`✅ order ${orderId} persisted`);

    return reply.code(201).send({ orderId, status: "placed", totalCents });
  });

  return server;
}
