import Fastify from "fastify";

const PORT = Number(process.env.PORT ?? 3001);
const app = Fastify({ logger: true });

// TODO: replace this static list with the menu's own Postgres database.
const MENU = [
  { menuItemId: "44444444-4444-4444-4444-444444444444", name: "Margherita", priceCents: 1200 },
  { menuItemId: "55555555-5555-5555-5555-555555555555", name: "Pepperoni", priceCents: 1400 },
];

app.get("/health", async () => ({ status: "ok", service: "menu" }));
app.get("/menu", async () => MENU);

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => app.log.info(`menu on ${PORT}`));
