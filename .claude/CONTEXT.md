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
| 3 | Redis idempotency — replace in-memory Idempotency class | ⏳ Pending |
| 4 | Retry-with-backoff in mq.ts | ⏳ Pending |
| 5 | Testcontainers integration tests | ⏳ Pending |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 2 complete, on branch `phase-2-outbox` (not yet merged).** Order service now writes an `outbox` row in the same transaction as the order (`services/order/src/db.ts`), and a background poller (`services/order/src/outbox.ts`, `setInterval` every 1s) is the ONLY thing that ever calls `publish()` for `order.placed` — the `POST /orders` route no longer touches RabbitMQ at all. `eventId` is generated once at insert time so poller retries republish the same event identity, collapsing safely under existing idempotency checks.

**Bigger-than-planned addendum, done in the same PR**: manually testing the crash-gap scenario (stop RabbitMQ, place an order, restart RabbitMQ) revealed `connect()` in `packages/shared/src/mq.ts` never recovered the connection — amqplib doesn't auto-reconnect, so the poller would retry forever and never actually succeed without a full process restart. Fixed by rewriting `mq.ts` to use amqplib's opt-in `recovery` option (bumped `amqplib` `^0.10.4` → `^2.0.0`, which is when this feature reached the version actually usable here — confirmed by inspecting the real published type defs, not just docs). A new `createResilientChannel()` wrapper holds a mutable reference to the current real amqplib `Channel`; `connect()`'s `setup()` callback recreates the channel and replays every registered consumer after each reconnect. **No changes needed to kitchen/notification/order's `index.ts` files** — they all keep calling `publish(channel, ...)` / `consume(channel, ...)` exactly as before; the resilience is entirely inside `mq.ts`. Re-verified the crash-gap test end-to-end: with the SAME order process (no restart), stopping and restarting RabbitMQ now self-heals — logs show `⚠️ [mq] disconnected, will retry` then `✅ [mq] connected`, and the stuck outbox row drains automatically, reaching kitchen.

Snyk: 0 issues (both `services/order` and `packages/shared`). Typecheck green across all services.

**Workflow reminder**: every phase gets its own branch off `main`, pushed with a PR via `gh pr create` — never commit straight to `main`. No Claude/Anthropic references in commits, PRs, or files (user's explicit preference). Repo: https://github.com/devinder-dev/quickbite (public).

## Next step

**Phase 3 — Redis idempotency.** Goal: replace the in-memory `Idempotency` Set in `packages/shared/src/mq.ts` (lost on every restart) with a Redis-backed `SETNX event:{eventId} 1 EX 86400` check, shared across order/kitchen/notification.

Likely files:
- `packages/shared/src/idempotency.ts` (new) — `RedisIdempotency` class using `ioredis` (already a menu service dependency; would move to shared or be added fresh here)
- `services/order/src/index.ts`, `services/kitchen/src/index.ts`, `services/notification/src/index.ts` — swap `new Idempotency()` for the Redis-backed version

Before starting: branch off `main` as `phase-3-redis-idempotency` (after Phase 2's PR is merged).

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
