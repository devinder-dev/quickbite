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
| 1c | Order service — Postgres tables | ⏳ Pending |
| 1d | Kitchen service — Postgres table | ⏳ Pending |
| 1e | Notification service — Postgres table (audit log) | ⏳ Pending |
| 2 | Outbox pattern — order service | ⏳ Pending |
| 3 | Redis idempotency — replace in-memory Idempotency class | ⏳ Pending |
| 4 | Retry-with-backoff in mq.ts | ⏳ Pending |
| 5 | Testcontainers integration tests | ⏳ Pending |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 1b complete (not yet committed).** Menu service now reads from `menu_db` Postgres with a Redis cache-aside layer (60s TTL on key `menu:all`). `services/menu/src/db.ts` and `services/menu/src/cache.ts` are new; `index.ts` rewritten with the `buildServer` pattern. Verified manually: cache miss → Postgres query → cache hit on second call (confirmed via logs and curl). Snyk scan: 0 issues. Typecheck green across all services.

Also fixed along the way:
- `tsconfig.base.json` — added `allowImportingTsExtensions: true` (needed for the project's `.ts`-extension import convention to typecheck)
- `.env.example` — corrected per-service DB URL comments to all use `DATABASE_URL` (matches what docker-compose actually injects; the old `MENU_DATABASE_URL` / `KITCHEN_DATABASE_URL` names below were never real env vars services read)

## Next step

**Phase 1c — Order service Postgres tables.**

Files to create/modify:
- `services/order/src/db.ts` — connect to `order_db`, create `orders` + `order_items` tables
- `services/order/src/index.ts` — replace in-memory `Map` with DB INSERT (POST /orders) and SELECT (GET /orders/:id)

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
