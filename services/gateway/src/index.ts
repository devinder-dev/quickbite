import Fastify from "fastify";
import proxy from "@fastify/http-proxy";

const PORT = Number(process.env.PORT ?? 3000);
const MENU_URL = process.env.MENU_URL ?? "http://localhost:3001";
const ORDER_URL = process.env.ORDER_URL ?? "http://localhost:3002";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", service: "gateway" }));

// The gateway is the only public entry point. It proxies user-facing READS
// to the owning service. The order WORKFLOW happens over events, not here.
await app.register(proxy, { upstream: MENU_URL, prefix: "/api/menu", rewritePrefix: "/menu" });
await app.register(proxy, { upstream: ORDER_URL, prefix: "/api/orders", rewritePrefix: "/orders" });

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`gateway listening on ${PORT}`);
});
