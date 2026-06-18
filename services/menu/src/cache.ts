import Redis from "ioredis";
import type { MenuItem } from "./db.ts";

// Step 1: Connect to the shared Redis instance. Same instance will later be
// reused for event idempotency (Phase 3) — one client per service, one
// Redis deployment for the whole platform.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(REDIS_URL);

const MENU_CACHE_KEY = "menu:all";
const MENU_CACHE_TTL_SECONDS = 60;

// Step 2: Read-through lookup. Returns null on a cache miss so the caller
// knows to fall back to Postgres — this is the "cache-aside" pattern: the
// application (not Redis) owns the decision of when to populate the cache.
export async function getCachedMenu(): Promise<MenuItem[] | null> {
  const cached = await redis.get(MENU_CACHE_KEY);
  return cached ? (JSON.parse(cached) as MenuItem[]) : null;
}

// Step 3: Populate the cache after a Postgres read, with a short TTL.
// WHY a TTL instead of caching forever: the menu can change (new items,
// price updates) and this service has no cache-invalidation event yet —
// a 60s TTL bounds staleness without needing one.
export async function setCachedMenu(items: MenuItem[]): Promise<void> {
  await redis.setex(MENU_CACHE_KEY, MENU_CACHE_TTL_SECONDS, JSON.stringify(items));
}
