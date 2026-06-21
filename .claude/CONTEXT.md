# QuickBite — Session Context

> Claude reads this at the start of every session. Update the "Current state" and "Next step" sections at the end of each phase.

## Project

Event-driven food-ordering platform. Graded assignment for Kvalitetssäkring systemnivå (System-Level QA).

Working directory: `~/quickbite/quickbite/`

Full plan: `~/.claude/plans/lets-read-the-files-unified-galaxy.md`

## Build phases

| Phase | Goal | Status |
|---|---|---|
| 0 | Bootstrap — unzip, git, CLAUDE.md, CONTEXT.md, hooks, Redis in compose | ✅ Done |
| 1a | Postgres init.sql — create per-service databases | ✅ Done |
| 1b | Menu service — Postgres table + Redis cache | ✅ Done |
| 1c | Order service — Postgres tables | ✅ Done |
| 1d | Kitchen service — Postgres table | ✅ Done |
| 1e | Notification service — Postgres table (audit log) | ✅ Done |
| 2 | Outbox pattern — order service | ✅ Done |
| 3 | Redis idempotency — replace in-memory Idempotency class | ✅ Done |
| 4 | Retry-with-backoff in mq.ts | ⏳ Pending |
| 5 | Testcontainers integration tests | ⏳ Pending |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 3 complete, on branch `phase-3-redis-idempotency` (not yet merged).** The in-memory `Idempotency` class is deleted from `packages/shared/src/mq.ts`; replaced by `RedisIdempotency` in the new `packages/shared/src/idempotency.ts`, using an atomic `SET event:{namespace}:{eventId} 1 EX 86400 NX`. Kitchen and notification (the only two consumers — order never consumed anything) each construct their own instance with a distinct namespace: `new RedisIdempotency("kitchen")` / `new RedisIdempotency("notification")`.

**Real bug caught by manual testing, fixed in the same PR**: the first version of `RedisIdempotency` keyed purely on `event:{eventId}`, with no namespace. Since kitchen and notification both consume the SAME `order.placed` event (same `eventId`, two separate queues), whichever service's idempotency check ran first would mark the bare eventId as seen — and the other service's check would then see a false duplicate and silently skip an event it never actually processed. Caught immediately because kitchen's `kitchen_orders` table had no row for a manually-placed test order. The old in-memory `Set` never had this problem because each service held its own private Set; Redis accidentally made the key space global. Fixed by namespacing the key per consumer.

Verified manually: normal order flow still works (kitchen accepted→ready, notification logged all 3 events) with correctly-namespaced Redis keys (`event:kitchen:<id>` and `event:notification:<id>` both exist independently for the same eventId); confirmed a second `SET ... NX` for the same key genuinely returns nothing (no overwrite); killed kitchen mid-flight to force a RabbitMQ redelivery and confirmed exactly one `kitchen_orders` row resulted, no duplicate-insert errors. Snyk: 0 issues across `packages/shared`, `services/kitchen`, `services/notification`. Typecheck green.

**Workflow reminder**: every phase gets its own branch off `main`, pushed with a PR via `gh pr create` — never commit straight to `main`. No Claude/Anthropic references in commits, PRs, or files (user's explicit preference). Repo: https://github.com/devinder-dev/quickbite (public).

## Next step

**Phase 4 — Retry-with-backoff in `mq.ts`.** Goal: don't dead-letter a message on the very first handler failure — retry a bounded number of times with exponential backoff first. Today, `consume()`'s try/catch (`packages/shared/src/mq.ts`) nacks straight to the DLQ on any throw, including transient failures like a brief Redis hiccup during the idempotency check just built in Phase 3.

Likely approach: track retry count via message headers (`x-retry-count`), republish to a delayed queue (or use a per-queue dead-letter TTL trick) up to `MAX_RETRIES`, then dead-letter only after that's exhausted.

Before starting: branch off `main` as `phase-4-retry-backoff` (after Phase 3's PR is merged).

## Key files to know

| File | Purpose |
|---|---|
| `packages/shared/src/events.ts` | Single source of truth for all event Zod schemas |
| `packages/shared/src/mq.ts` | RabbitMQ connect/publish/consume helpers |
| `docker-compose.yml` | All infra — Postgres, RabbitMQ, Redis, Nginx, services |
| `.env.example` | Template for all env vars — copy to `.env` |

## Environment

Each service reads the same env var name, `DATABASE_URL` — docker-compose.yml sets a different value per container:

```bash
RABBITMQ_URL=amqp://guest:guest@localhost:5672
DATABASE_URL=postgres://quickbite:quickbite@localhost:5432/<service>_db   # order_db | menu_db | kitchen_db | notification_db
REDIS_URL=redis://localhost:6379
```
