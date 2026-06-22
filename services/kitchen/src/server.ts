import Fastify, { type FastifyInstance } from "fastify";
import { acceptOrder, getKitchenOrder, listActiveOrders, markOrderReady, startCooking } from "./db.ts";

// Build the server as its own function, separate from starting it — same
// split as services/order/src/server.ts, specifically so tests can import
// buildServer() and call .inject() without index.ts's connect()/consume()/
// listen() side effects ever running. Routes only ever talk to the
// database — never to the RabbitMQ channel — the outbox poller is the only
// thing that ever publishes, on its own schedule.
export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ status: "ok", service: "kitchen" }));

  // For the kitchen dashboard: every order not yet marked ready.
  server.get("/orders", async () => listActiveOrders());

  // One route per staff action: 404 if the order doesn't exist, otherwise
  // do the transition and hand back the updated row so the dashboard can
  // update optimistically without a second round trip.
  server.post("/orders/:id/accept", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getKitchenOrder(id))) return reply.code(404).send({ error: "not found" });
    await acceptOrder(id, 20); // ETA stays fixed for now — see CLAUDE.md
    return getKitchenOrder(id);
  });

  server.post("/orders/:id/start-cooking", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getKitchenOrder(id))) return reply.code(404).send({ error: "not found" });
    await startCooking(id);
    return getKitchenOrder(id);
  });

  server.post("/orders/:id/ready", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await getKitchenOrder(id))) return reply.code(404).send({ error: "not found" });
    await markOrderReady(id);
    return getKitchenOrder(id);
  });

  return server;
}
