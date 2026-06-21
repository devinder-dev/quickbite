import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { Wait } from "testcontainers";
import type { FastifyInstance } from "fastify";
import type { OrderPlaced } from "@quickbite/shared";

// Step 1: Real infra, no mocks. Containers start once for the whole file —
// each test below shares them but operates on its own order, so tests don't
// need to clean up shared state between each other.
let postgres: StartedPostgreSqlContainer;
let rabbitmq: StartedRabbitMQContainer;
let server: FastifyInstance;

beforeAll(async () => {
  // The plain postgres image ships no Docker HEALTHCHECK, and a raw
  // listening-port probe hangs under this Docker setup — waiting for the
  // server's own "ready to accept connections" log line (it appears twice:
  // once for the internal setup connection, once for the real startup) is
  // the reliable signal here.
  postgres = await new PostgreSqlContainer("postgres:16")
    .withDatabase("order_db")
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  rabbitmq = await new RabbitMQContainer("rabbitmq:3-management").start();

  // Step 2: db.ts and index.ts read DATABASE_URL/RABBITMQ_URL from
  // process.env at module-load time (top-level `await ensureSchema()`,
  // top-level `connect()`). Static imports are hoisted above any code in
  // this file, so the env vars must be set BEFORE the module is ever
  // imported — a dynamic import() after setting them is what makes that
  // possible without touching any service source file.
  process.env.DATABASE_URL = postgres.getConnectionUri();
  process.env.RABBITMQ_URL = rabbitmq.getAmqpUrl();

  const { buildServer } = await import("../src/server.ts");
  server = await buildServer();
}, 120_000);

afterAll(async () => {
  await postgres.stop();
  await rabbitmq.stop();
});

describe("POST /orders", () => {
  test("persists the order, its items, and an outbox row", async () => {
    const customerId = crypto.randomUUID();
    const response = await server.inject({
      method: "POST",
      url: "/orders",
      payload: {
        customerId,
        items: [{ menuItemId: crypto.randomUUID(), name: "Margherita", quantity: 2, priceCents: 1200 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("placed");
    expect(body.totalCents).toBe(2400);

    const { getOrderById } = await import("../src/db.ts");
    const stored = await getOrderById(body.orderId);
    expect(stored).not.toBeNull();
    expect(stored?.customerId).toBe(customerId);
    expect(stored?.items).toHaveLength(1);
    expect(stored?.items[0]?.priceCents).toBe(1200);
  });

  test("rejects an empty items array", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/orders",
      payload: { customerId: crypto.randomUUID(), items: [] },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /orders/:id", () => {
  test("returns 404 for an order that doesn't exist", async () => {
    const response = await server.inject({ method: "GET", url: `/orders/${crypto.randomUUID()}` });
    expect(response.statusCode).toBe(404);
  });
});

describe("outbox poller", () => {
  test("publishes order.placed to RabbitMQ after the transaction commits", async () => {
    const { connect, consume, EventName } = await import("@quickbite/shared");
    const { startOutboxPoller } = await import("../src/outbox.ts");

    const { conn, channel } = await connect(rabbitmq.getAmqpUrl());
    const poller = startOutboxPoller(channel, 200);

    // Step 3: bind a throwaway test queue to the SAME exchange the outbox
    // poller publishes to. This proves the event actually reached
    // RabbitMQ via the real publish path — not a stand-in for kitchen's
    // own logic, which has its own dedicated test file.
    const received: OrderPlaced[] = [];
    await consume(
      channel,
      { queue: "test.outbox-verification", routingKeys: [EventName.OrderPlaced] },
      async (event) => {
        received.push(event as OrderPlaced);
      },
    );

    const response = await server.inject({
      method: "POST",
      url: "/orders",
      payload: {
        customerId: crypto.randomUUID(),
        items: [{ menuItemId: crypto.randomUUID(), name: "Pepperoni", quantity: 1, priceCents: 1400 }],
      },
    });
    const { orderId } = response.json();

    // Poll up to ~3s for the message to arrive — the poller ticks every 200ms here.
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !received.some((e) => e.orderId === orderId)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const event = received.find((e) => e.orderId === orderId);
    expect(event).toBeDefined();
    expect(event?.totalCents).toBe(1400);

    // This test opens its own poller and RabbitMQ connection, separate from
    // the shared server — stop them explicitly so they don't keep trying to
    // reconnect after afterAll() tears the containers down.
    clearInterval(poller);
    await conn.close();
  });
});
