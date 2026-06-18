import Fastify from "fastify";
import { z } from "zod";
import { connect, publish, EventName, OrderItem } from "@quickbite/shared";

const PORT = Number(process.env.PORT ?? 3002);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

const { channel } = await connect(RABBITMQ_URL);

// TODO: replace this in-memory map with the order service's own Postgres DB.
type StoredOrder = { orderId: string; status: string; totalCents: number };
const orders = new Map<string, StoredOrder>();

const PlaceOrderBody = z.object({
  customerId: z.string().uuid(),
  items: z.array(OrderItem).min(1),
});

const app = Fastify({ logger: true });
app.get("/health", async () => ({ status: "ok", service: "order" }));

app.get("/orders/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const found = orders.get(id);
  if (!found) return reply.code(404).send({ error: "not found" });
  return found;
});

app.post("/orders", async (req, reply) => {
  const parsed = PlaceOrderBody.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const { customerId, items } = parsed.data;
  const orderId = crypto.randomUUID();
  const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

  // 1) Persist locally (commit) ... then 2) publish. Never the other way round.
  orders.set(orderId, { orderId, status: "placed", totalCents });

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

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => app.log.info(`order on ${PORT}`));
