import Fastify, { type FastifyInstance } from "fastify";
import { getMenuItems } from "./db.ts";
import { getCachedMenu, setCachedMenu } from "./cache.ts";

const PORT = Number(process.env.PORT ?? 3001);

// Step 1: Build the server as its own function, separate from starting it.
// WHY: lets tests import buildServer() and call .inject() without binding
// a real port, and keeps "construct the app" separate from "run the app".
async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ status: "ok", service: "menu" }));

  // Step 2: Cache-aside read. Check Redis first; only touch Postgres on a miss.
  server.get("/menu", async () => {
    const cached = await getCachedMenu();
    if (cached) {
      server.log.info("✅ menu cache hit");
      return cached;
    }

    server.log.info("⚠️ menu cache miss — querying Postgres");
    const items = await getMenuItems();
    await setCachedMenu(items);
    return items;
  });

  return server;
}

// Step 3: Start the server. Errors here are startup failures (bad port,
// failed DB connection in db.ts's top-level await) — log and exit loudly
// rather than running in a half-initialized state.
buildServer()
  .then((server) => server.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => console.log(`🚀 menu on ${PORT}`))
  .catch((err) => {
    console.error("❌ menu failed to start", err);
    process.exit(1);
  });
