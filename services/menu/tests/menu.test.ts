import { afterAll, beforeAll, expect, test } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { Wait } from "testcontainers";

let postgresC: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;

beforeAll(async () => {
  postgresC = await new PostgreSqlContainer("postgres:16")
    .withDatabase("menu_db")
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  redis = await new RedisContainer("redis:7-alpine").start();

  process.env.DATABASE_URL = postgresC.getConnectionUri();
  process.env.REDIS_URL = redis.getConnectionUrl();
}, 120_000);

afterAll(async () => {
  await postgresC.stop();
  await redis.stop();
});

test("getMenuItems returns the seeded items from Postgres", async () => {
  const { getMenuItems } = await import("../src/db.ts");
  const items = await getMenuItems();
  expect(items).toHaveLength(2);
  expect(items.map((i) => i.name).sort()).toEqual(["Margherita", "Pepperoni"]);
});

test("cache-aside: a miss populates Redis, and the cached value matches Postgres", async () => {
  const { getMenuItems } = await import("../src/db.ts");
  const { getCachedMenu, setCachedMenu } = await import("../src/cache.ts");

  // Nothing cached yet for this fresh Redis container.
  expect(await getCachedMenu()).toBeNull();

  const fromDb = await getMenuItems();
  await setCachedMenu(fromDb);

  const cached = await getCachedMenu();
  expect(cached).toEqual(fromDb);
});
