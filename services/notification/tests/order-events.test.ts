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
    .withDatabase("notification_db")
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  rabbitmq = await new RabbitMQContainer("rabbitmq:3-management").start();
  redis = await new RedisContainer("redis:7-alpine").start();

  process.env.DATABASE_URL = postgresC.getConnectionUri();
  process.env.RABBITMQ_URL = rabbitmq.getAmqpUrl();
  process.env.REDIS_URL = redis.getConnectionUrl();
  process.env.PORT = "0";

  // Real entrypoint, same reasoning as kitchen's test: exercises the actual
  // connect() + consume() + idempotency wiring, not a reimplementation.
  await import("../src/index.ts");
}, 120_000);

afterAll(async () => {
  await postgresC.stop();
  await rabbitmq.stop();
  await redis.stop();
});

test("logs an audit row for every order event it consumes", async () => {
  const { getNotificationsForOrder } = await import("../src/db.ts");

  const { channel, conn } = await connect(rabbitmq.getAmqpUrl());
  const orderId = crypto.randomUUID();
  const customerId = crypto.randomUUID();

  publish(channel, EventName.OrderPlaced, {
    type: EventName.OrderPlaced,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    orderId,
    customerId,
    items: [{ menuItemId: crypto.randomUUID(), name: "Margherita", quantity: 1, priceCents: 1200 }],
    totalCents: 1200,
  });
  publish(channel, EventName.OrderAccepted, {
    type: EventName.OrderAccepted,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    orderId,
    etaMinutes: 20,
  });
  publish(channel, EventName.OrderReady, {
    type: EventName.OrderReady,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    orderId,
  });

  const deadline = Date.now() + 5000;
  let rows = await getNotificationsForOrder(orderId);
  while (Date.now() < deadline && rows.length < 3) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    rows = await getNotificationsForOrder(orderId);
  }

  // This test publishes all 3 events back-to-back with no delay (unlike
  // the real flow, where kitchen naturally waits ~3s between accepted and
  // ready) — concurrent handler completions can race, so don't assert
  // arrival order, only that all 3 were recorded exactly once each.
  expect(rows.map((r) => r.eventType).sort()).toEqual(["order.accepted", "order.placed", "order.ready"]);

  await conn.close();
});

test("redelivering the same eventId does not log a duplicate row", async () => {
  const { getNotificationsForOrder } = await import("../src/db.ts");

  const { channel, conn } = await connect(rabbitmq.getAmqpUrl());
  const orderId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const payload = {
    type: EventName.OrderPlaced,
    eventId,
    occurredAt: new Date().toISOString(),
    orderId,
    customerId: crypto.randomUUID(),
    items: [{ menuItemId: crypto.randomUUID(), name: "Pepperoni", quantity: 1, priceCents: 1400 }],
    totalCents: 1400,
  };

  publish(channel, EventName.OrderPlaced, payload);
  publish(channel, EventName.OrderPlaced, payload);

  const deadline = Date.now() + 3000;
  let rows = await getNotificationsForOrder(orderId);
  while (Date.now() < deadline && rows.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    rows = await getNotificationsForOrder(orderId);
  }

  // Give a redelivered duplicate a moment to (incorrectly) land, if it were going to.
  await new Promise((resolve) => setTimeout(resolve, 500));
  rows = await getNotificationsForOrder(orderId);
  expect(rows).toHaveLength(1);

  await conn.close();
});
