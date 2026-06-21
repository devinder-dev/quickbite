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

  process.env.DATABASE_URL = dbUrl(postgresC, "kitchen_db");
  process.env.PORT = "0";
  await import("../../services/kitchen/src/index.ts");

  process.env.DATABASE_URL = dbUrl(postgresC, "notification_db");
  process.env.PORT = "0";
  await import("../../services/notification/src/index.ts");

  // Step 3: order's own outbox poller needs its own RabbitMQ channel,
  // exactly like its real startup chain in index.ts.
  const { channel } = await connect(rabbitmq.getAmqpUrl());
  orderOutbox.startOutboxPoller(channel, 200);

  orderServer = await orderServerModule.buildServer();
}, 120_000);

afterAll(async () => {
  await postgresC.stop();
  await rabbitmq.stop();
  await redis.stop();
});

test("place order -> kitchen accepts and readies -> notification logs all 3 events", async () => {
  // Step 4: Drive the flow exactly the way a real customer would — one
  // HTTP request to the order service. Everything after this point (outbox
  // -> RabbitMQ -> kitchen -> RabbitMQ -> notification) happens on its own,
  // through the real production code paths for all three services.
  const response = await orderServer.inject({
    method: "POST",
    url: "/orders",
    payload: {
      customerId: crypto.randomUUID(),
      items: [{ menuItemId: crypto.randomUUID(), name: "Margherita", quantity: 1, priceCents: 1200 }],
    },
  });
  expect(response.statusCode).toBe(201);
  const { orderId } = response.json();

  process.env.DATABASE_URL = dbUrl(postgresC, "kitchen_db");
  const { getKitchenOrder } = await import("../../services/kitchen/src/db.ts");

  process.env.DATABASE_URL = dbUrl(postgresC, "notification_db");
  const { getNotificationsForOrder } = await import("../../services/notification/src/db.ts");

  // Step 5: Poll for the end state across BOTH services' own databases —
  // the actual proof that the chain worked, not an assumption about timing.
  const deadline = Date.now() + 10_000;
  let kitchenRow = await getKitchenOrder(orderId);
  let notifications = await getNotificationsForOrder(orderId);
  while (Date.now() < deadline && (kitchenRow?.status !== "ready" || notifications.length < 3)) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    kitchenRow = await getKitchenOrder(orderId);
    notifications = await getNotificationsForOrder(orderId);
  }

  expect(kitchenRow?.status).toBe("ready");
  expect(kitchenRow?.readyAt).not.toBeNull();
  expect(notifications.map((n) => n.eventType).sort()).toEqual(["order.accepted", "order.placed", "order.ready"]);
});
