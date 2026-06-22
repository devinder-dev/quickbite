import { afterAll, beforeAll, expect, test } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { Wait } from "testcontainers";
import postgres from "postgres";
import { connect } from "@quickbite/shared";
import type { FastifyInstance } from "fastify";

let postgresC: StartedPostgreSqlContainer;
let rabbitmq: StartedRabbitMQContainer;
let redis: StartedRedisContainer;
let orderServer: FastifyInstance;
let kitchenServer: FastifyInstance;

function dbUrl(container: StartedPostgreSqlContainer, database: string): string {
  return `postgres://${container.getUsername()}:${container.getPassword()}@${container.getHost()}:${container.getPort()}/${database}`;
}

beforeAll(async () => {
  // Step 1: One Postgres container, three databases — exactly the shape
  // production gets from docker/init.sql (one Postgres instance, one
  // database per service, never shared). The container's own default
  // database is just the admin connection used to create the other three.
  postgresC = await new PostgreSqlContainer("postgres:16")
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  rabbitmq = await new RabbitMQContainer("rabbitmq:3-management").start();
  redis = await new RedisContainer("redis:7-alpine").start();

  const admin = postgres(postgresC.getConnectionUri());
  await admin.unsafe('CREATE DATABASE "order_db"');
  await admin.unsafe('CREATE DATABASE "kitchen_db"');
  await admin.unsafe('CREATE DATABASE "notification_db"');
  await admin.end();

  process.env.RABBITMQ_URL = rabbitmq.getAmqpUrl();
  process.env.REDIS_URL = redis.getConnectionUrl();

  // Step 2: Bring each service's real entrypoint up, one at a time,
  // pointing DATABASE_URL at ITS OWN database right before that service's
  // module is ever imported — db.ts reads the env var once, at import time.
  process.env.DATABASE_URL = dbUrl(postgresC, "order_db");
  const orderServerModule = await import("../../services/order/src/server.ts");
  const orderOutbox = await import("../../services/order/src/outbox.ts");
  const orderEvents = await import("../../services/order/src/order-events.ts");

  // kitchen/src/index.ts itself uses a top-level await for connect()+
  // consume() (not a .then() chain) specifically so this import only
  // resolves once its consumer is actually registered — otherwise the
  // order.placed event published in the test below could be published
  // before kitchen's queue binding exists and be silently dropped.
  process.env.DATABASE_URL = dbUrl(postgresC, "kitchen_db");
  process.env.PORT = "0";
  await import("../../services/kitchen/src/index.ts");
  const kitchenServerModule = await import("../../services/kitchen/src/server.ts");
  kitchenServer = await kitchenServerModule.buildServer();

  process.env.DATABASE_URL = dbUrl(postgresC, "notification_db");
  process.env.PORT = "0";
  await import("../../services/notification/src/index.ts");

  // Step 3: order's own outbox poller AND its event consumer need their own
  // RabbitMQ channel, exactly like its real startup chain in index.ts.
  process.env.DATABASE_URL = dbUrl(postgresC, "order_db");
  const { channel } = await connect(rabbitmq.getAmqpUrl());
  orderOutbox.startOutboxPoller(channel, 200);
  await orderEvents.startOrderEventConsumer(channel);

  orderServer = await orderServerModule.buildServer();
}, 120_000);

afterAll(async () => {
  await postgresC.stop();
  await rabbitmq.stop();
  await redis.stop();
});

test("place order -> kitchen staff accept/cook/ready -> order syncs -> notification logs all 4 events", async () => {
  // Step 4: Drive the flow exactly the way a real customer would — one
  // HTTP request to the order service.
  const response = await orderServer.inject({
    method: "POST",
    url: "/orders",
    payload: {
      customerId: crypto.randomUUID(),
      items: [{ menuItemId: crypto.randomUUID(), name: "Gyros", quantity: 1, priceCents: 1100 }],
    },
  });
  expect(response.statusCode).toBe(201);
  const { orderId } = response.json();

  process.env.DATABASE_URL = dbUrl(postgresC, "kitchen_db");
  const { getKitchenOrder } = await import("../../services/kitchen/src/db.ts");

  // Step 5: Wait for kitchen to actually receive the order.placed event
  // (via order's outbox poller -> RabbitMQ) before driving the manual
  // workflow — there's no automatic timer anymore, a human (this test,
  // standing in for one) has to act at every step.
  const pendingDeadline = Date.now() + 5000;
  let kitchenRow = await getKitchenOrder(orderId);
  while (Date.now() < pendingDeadline && !kitchenRow) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    kitchenRow = await getKitchenOrder(orderId);
  }
  expect(kitchenRow?.status).toBe("pending");

  // Step 6: Drive the real HTTP routes kitchen's dashboard would call.
  const acceptRes = await kitchenServer.inject({ method: "POST", url: `/orders/${orderId}/accept` });
  expect(acceptRes.statusCode).toBe(200);

  const cookingRes = await kitchenServer.inject({ method: "POST", url: `/orders/${orderId}/start-cooking` });
  expect(cookingRes.statusCode).toBe(200);

  const readyRes = await kitchenServer.inject({ method: "POST", url: `/orders/${orderId}/ready` });
  expect(readyRes.statusCode).toBe(200);

  process.env.DATABASE_URL = dbUrl(postgresC, "notification_db");
  const { getNotificationsForOrder } = await import("../../services/notification/src/db.ts");

  // Step 7: Poll for the end state across notification's own database —
  // the actual proof the chain worked, not an assumption about timing.
  const deadline = Date.now() + 10_000;
  let notifications = await getNotificationsForOrder(orderId);
  while (Date.now() < deadline && notifications.length < 4) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    notifications = await getNotificationsForOrder(orderId);
  }
  expect(notifications.map((n) => n.eventType).sort()).toEqual(
    ["order.accepted", "order.cooking", "order.placed", "order.ready"].sort(),
  );

  // Step 8: The actual customer-facing check — order's OWN status via the
  // real public endpoint, not an internal database. Proves order's
  // consumer actually synced all the way through "cooking" to "ready".
  // Polled, not a one-shot check: notification and order are two
  // INDEPENDENT consumers reacting to the same broadcast events, with no
  // ordering guarantee between them — notification finishing first (which
  // the wait above just confirmed) says nothing about whether order's own
  // consumer has caught up to the last event yet.
  const statusDeadline = Date.now() + 5000;
  let statusResponse = await orderServer.inject({ method: "GET", url: `/orders/${orderId}` });
  while (Date.now() < statusDeadline && statusResponse.json().status !== "ready") {
    await new Promise((resolve) => setTimeout(resolve, 200));
    statusResponse = await orderServer.inject({ method: "GET", url: `/orders/${orderId}` });
  }
  expect(statusResponse.json().status).toBe("ready");
});
