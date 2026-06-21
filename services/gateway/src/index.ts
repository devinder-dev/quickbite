import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

const PORT = Number(process.env.PORT ?? 3000);
const MENU_URL = process.env.MENU_URL ?? "http://localhost:3001";
const ORDER_URL = process.env.ORDER_URL ?? "http://localhost:3002";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", service: "gateway" }));

// Step 1: A small hand-rolled proxy via Bun's native fetch(), instead of
// @fastify/http-proxy. That plugin's underlying @fastify/reply-from forwards
// requests through a Node-style undici Pool whose .request() method isn't
// implemented the same way under Bun's runtime — it throws
// "pool.request is not a function" on every forwarded call. fetch() is a
// first-class, fully-supported Bun API, so this avoids the incompatibility
// entirely rather than working around it.
function proxyTo(prefix: string, upstreamBase: string, rewriteTo: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const suffix = req.url.slice(prefix.length);
    const targetUrl = `${upstreamBase}${rewriteTo}${suffix}`;

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: { "content-type": "application/json" },
      body: hasBody ? JSON.stringify(req.body) : undefined,
    });

    const text = await upstreamRes.text();
    reply.code(upstreamRes.status);
    reply.header("content-type", upstreamRes.headers.get("content-type") ?? "application/json");
    return reply.send(text);
  };
}

// The gateway is the only public entry point. It proxies user-facing READS
// (and order placement) to the owning service. The order WORKFLOW after
// that happens over events, not here.
const menuProxy = proxyTo("/api/menu", MENU_URL, "/menu");
app.get("/api/menu", menuProxy);
app.all("/api/menu/*", menuProxy);

const orderProxy = proxyTo("/api/orders", ORDER_URL, "/orders");
app.all("/api/orders", orderProxy);
app.all("/api/orders/*", orderProxy);

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`gateway listening on ${PORT}`);
});
