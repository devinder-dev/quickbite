import { afterAll, beforeAll, expect, test } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { Wait } from "testcontainers";
import { connect, consume, publish, EventName, type OrderAccepted, type OrderCooking, type OrderReady } from "@quickbite/shared";
import type { FastifyInstance } from "fastify";

let postgresC: StartedPostgreSqlContainer;
let rabbitmq: StartedRabbitMQContainer;
let redis: StartedRedisContainer;
let server: FastifyInstance;

beforeAll(async () => {
  postgresC = await new PostgreSqlContainer("postgres:16")
    .withDatabase("kitchen_db")
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  rabbitmq = await new RabbitMQContainer("rabbitmq:3-management").start();
  redis = await new RedisContainer("redis:7-alpine").start();

  process.env.DATABASE_URL = postgresC.getConnectionUri();
  process.env.RABBITMQ_URL = rabbitmq.getAmqpUrl();
  process.env.REDIS_URL = redis.getConnectionUrl();

  // index.ts is the real entrypoint for the EVENT side (connect, consume,
  // outbox poller) — importing it runs that exactly as production does.
  // server.ts is imported separately so the HTTP routes can be exercised
  // via .inject() without needing a real listening port.
  process.env.PORT = "0";
  await import("../src/index.ts");
  const { buildServer } = await import("../src/server.ts");
  server = await buildServer();
}, 120_000);

afterAll(async () => {
  await postgresC.stop();
  await rabbitmq.stop();
  await redis.stop();
});

function buildOrderPlaced(orderId: string, eventId: string) {
  return {
    type: EventName.OrderPlaced,
    eventId,
    occurredAt: new Date().toISOString(),
    orderId,
    customerId: crypto.randomUUID(),
    items: [{ menuItemId: crypto.randomUUID(), name: "Gyros", quantity: 1, priceCents: 1100 }],
    totalCents: 1100,
  };
}

async function waitForPendingOrder(orderId: string) {
  const { getKitchenOrder } = await import("../src/db.ts");
  const deadline = Date.now() + 3000;
  let row = await getKitchenOrder(orderId);
  while (Date.now() < deadline && !row) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    row = await getKitchenOrder(orderId);
  }
  return row;
}

test("order.placed creates a pending order, with no automatic accept/ready", async () => {
  const { channel, conn } = await connect(rabbitmq.getAmqpUrl());
  const orderId = crypto.randomUUID();
  publish(channel, EventName.OrderPlaced, buildOrderPlaced(orderId, crypto.randomUUID()));

  const row = await waitForPendingOrder(orderId);
  expect(row?.status).toBe("pending");
  expect(row?.etaMinutes).toBeNull();
  expect(row?.acceptedAt).toBeNull();

  await conn.close();
});

test("staff actions (accept -> start cooking -> ready) drive the real HTTP routes and publish the matching events", async () => {
  const orderId = crypto.randomUUID();
  const { channel: publishChannel, conn: publishConn } = await connect(rabbitmq.getAmqpUrl());
  publish(publishChannel, EventName.OrderPlaced, buildOrderPlaced(orderId, crypto.randomUUID()));
  await waitForPendingOrder(orderId);

  // Listen for kitchen's own outbox-published events so we can assert they
  // actually went out, not just that the database changed.
  const seen: Record<string, unknown> = {};
  const { channel: listenChannel, conn: listenConn } = await connect(rabbitmq.getAmqpUrl());
  await consume(
    listenChannel,
    { queue: `test.kitchen-events.${orderId}`, routingKeys: [EventName.OrderAccepted, EventName.OrderCooking, EventName.OrderReady] },
    async (event) => {
      const e = event as OrderAccepted | OrderCooking | OrderReady;
      if (e.orderId === orderId) seen[e.type] = e;
    },
  );

  const acceptRes = await server.inject({ method: "POST", url: `/orders/${orderId}/accept` });
  expect(acceptRes.statusCode).toBe(200);
  expect(acceptRes.json().status).toBe("accepted");
  expect(acceptRes.json().etaMinutes).toBe(20);

  const cookingRes = await server.inject({ method: "POST", url: `/orders/${orderId}/start-cooking` });
  expect(cookingRes.statusCode).toBe(200);
  expect(cookingRes.json().status).toBe("cooking");

  const readyRes = await server.inject({ method: "POST", url: `/orders/${orderId}/ready` });
  expect(readyRes.statusCode).toBe(200);
  expect(readyRes.json().status).toBe("ready");
  expect(readyRes.json().readyAt).not.toBeNull();

  // The outbox poller runs on its own 1s interval — give it a few ticks to
  // actually drain and publish all three events before asserting.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && Object.keys(seen).length < 3) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  expect(Object.keys(seen).sort()).toEqual([EventName.OrderAccepted, EventName.OrderCooking, EventName.OrderReady].sort());

  await publishConn.close();
  await listenConn.close();
});

test("accepting an unknown order id returns 404, not a crash", async () => {
  const res = await server.inject({ method: "POST", url: `/orders/${crypto.randomUUID()}/accept` });
  expect(res.statusCode).toBe(404);
});

test("a redelivered order.placed (same eventId) does not double-insert (Redis idempotency)", async () => {
  const { channel, conn } = await connect(rabbitmq.getAmqpUrl());
  const orderId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const payload = buildOrderPlaced(orderId, eventId);

  // Publish the SAME event twice — if idempotency failed, the second
  // delivery would attempt a second INSERT against the order_id primary
  // key and throw, dead-lettering the message instead of no-op-ing.
  publish(channel, EventName.OrderPlaced, payload);
  publish(channel, EventName.OrderPlaced, payload);

  const row = await waitForPendingOrder(orderId);
  expect(row).not.toBeNull();
  expect(row?.status).toBe("pending");

  await conn.close();
});
