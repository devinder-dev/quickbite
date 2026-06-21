import { afterAll, beforeAll, expect, test } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { Wait } from "testcontainers";
import { connect, publish, EventName } from "@quickbite/shared";

let postgresC: StartedPostgreSqlContainer;
let rabbitmq: StartedRabbitMQContainer;
let redis: StartedRedisContainer;

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
  process.env.PORT = "0"; // ephemeral port — this test never touches kitchen's HTTP layer

  // Importing index.ts is the real entrypoint: it runs the actual connect()
  // + consume() + idempotency wiring exactly as production does, not a
  // reimplementation of kitchen's logic in test code.
  await import("../src/index.ts");
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
    items: [{ menuItemId: crypto.randomUUID(), name: "Margherita", quantity: 1, priceCents: 1200 }],
    totalCents: 1200,
  };
}

test("accepts an order.placed event and marks it ready after the simulated cook time", async () => {
  const { getKitchenOrder } = await import("../src/db.ts");

  const { channel, conn } = await connect(rabbitmq.getAmqpUrl());
  const orderId = crypto.randomUUID();
  publish(channel, EventName.OrderPlaced, buildOrderPlaced(orderId, crypto.randomUUID()));

  // Should be accepted almost immediately.
  const acceptedDeadline = Date.now() + 3000;
  let row = await getKitchenOrder(orderId);
  while (Date.now() < acceptedDeadline && !row) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    row = await getKitchenOrder(orderId);
  }
  expect(row?.status).toBe("accepted");
  expect(row?.etaMinutes).toBe(20);

  // Then ready after the ~3s simulated cook time.
  const readyDeadline = Date.now() + 6000;
  while (Date.now() < readyDeadline && row?.status !== "ready") {
    await new Promise((resolve) => setTimeout(resolve, 200));
    row = await getKitchenOrder(orderId);
  }
  expect(row?.status).toBe("ready");
  expect(row?.readyAt).not.toBeNull();

  await conn.close();
});

test("redelivering the same eventId does not double-process (Redis idempotency)", async () => {
  const { getKitchenOrder } = await import("../src/db.ts");

  const { channel, conn } = await connect(rabbitmq.getAmqpUrl());
  const orderId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const payload = buildOrderPlaced(orderId, eventId);

  // Publish the SAME event twice in a row, simulating a RabbitMQ
  // redelivery. If idempotency failed, the second delivery would attempt a
  // second INSERT against the order_id primary key and throw — which would
  // dead-letter the message rather than silently succeed.
  publish(channel, EventName.OrderPlaced, payload);
  publish(channel, EventName.OrderPlaced, payload);

  const deadline = Date.now() + 3000;
  let row = await getKitchenOrder(orderId);
  while (Date.now() < deadline && !row) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    row = await getKitchenOrder(orderId);
  }
  expect(row).not.toBeNull();
  expect(row?.status).toBe("accepted");

  await conn.close();
});
