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
| 4 | Retry-with-backoff in mq.ts | ✅ Done |
| 5 | Testcontainers integration tests | ✅ Done |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 5 complete, on branch `phase-5-testcontainers` (not yet merged).** Every service now has a real Testcontainers-backed integration test (no mocks for Postgres/RabbitMQ/Redis): `services/order/tests/place-order.test.ts`, `services/kitchen/tests/order-events.test.ts`, `services/notification/tests/order-events.test.ts`, `services/menu/tests/menu.test.ts`. Root `bunfig.toml` sets `[test] timeout = 60000` (container startup exceeds bun's 5s default).

**Key technique**: every service's `db.ts` reads `DATABASE_URL`/`RABBITMQ_URL`/`REDIS_URL` from `process.env` at module-load time (top-level `await ensureSchema()`). Static imports are hoisted before test code runs, so each test sets env vars in `beforeAll` *then* uses a dynamic `await import(...)` to load the module — no service source changes needed for this part. Order's route handler did need one small refactor: `buildServer()` was extracted out of `index.ts` into its own `services/order/src/server.ts`, so tests can `server.inject()` against it without triggering `index.ts`'s real `connect()`+`listen()` startup chain. Kitchen/notification's tests don't need this — they dynamically import the whole `index.ts` (with `PORT=0` for an ephemeral port) precisely because they DO want the real consumer wiring to run.

**Three real bugs found while getting these tests to actually pass, not implementation choices**:
1. `@testcontainers/postgresql`'s default wait strategy ANDs `Wait.forHealthCheck()` with `Wait.forListeningPorts()` — but the plain `postgres:16` image has no Docker `HEALTHCHECK` (that's exactly why `docker-compose.yml` manually adds a `pg_isready` one), so it hung forever waiting for a health status that would never appear. Fixed in every Postgres-using test by overriding with `Wait.forLogMessage(/database system is ready to accept connections/, 2)`.
2. `RecoveringChannelModel` (amqplib's recovery wrapper, Phase 2) emits its own `'error'` event separate from `'disconnect'` — an EventEmitter `'error'` with no listener crashes the whole process in Node/Bun. `connect()` in `packages/shared/src/mq.ts` only listened for `'connect'`/`'disconnect'`/`'reconnect-failed'`; added an `'error'` handler. This is a real production hardening fix, not just a test fix — a service could have crashed on certain connection failures before this.
3. Notification's first integration test initially asserted exact event-arrival order (`["order.placed", "order.accepted", "order.ready"]`) — flaky, because the test publishes all 3 events back-to-back with no delay (unlike the real flow, where kitchen naturally waits ~3s between accepted and ready), so concurrent handler completions can race. Fixed to assert presence via a sorted comparison instead of arrival order.

Also: a cleanup command using a broad `ancestor=postgres:16` Docker filter accidentally removed the actual running `quickbite-postgres-1` container mid-session — caught immediately, no data lost (named volume `pgdata` persisted), container restored via `docker compose up -d postgres`. Worth remembering: never filter Docker cleanup commands by image name when other real containers share that image — scope to the specific container ID instead.

Snyk: 0 issues across all 5 changed packages. Typecheck green. Full `bun test` from the repo root: 12 pass, 0 fail, confirmed stable across repeated runs, exit code 0, no orphaned Testcontainers left running afterward (Ryuk reaper confirmed clean).

**Workflow reminder**: every phase gets its own branch off `main`, pushed with a PR via `gh pr create` — never commit straight to `main`. No Claude/Anthropic references in commits, PRs, or files (user's explicit preference). Repo: https://github.com/devinder-dev/quickbite (public).

## Next step

**Phase 6 — End-to-end test.** Goal: one test spanning the real happy path across all services together: place an order → kitchen accepts → kitchen marks ready → notification logs all 3 events — this is the last item on CLAUDE.md's testing pyramid.

Likely approach: a new top-level `tests/e2e/order-flow.test.ts` (not inside any single service), spinning up Postgres + RabbitMQ + Redis containers once, dynamically importing all 4 services' entrypoints against those containers (same technique as Phase 5), then driving the flow via a real `POST /orders` and asserting the final state across all 3 databases.

Before starting: branch off `main` as `phase-6-e2e` (after Phase 5's PR is merged).

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
