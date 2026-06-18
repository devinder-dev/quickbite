# QuickBite — Session Context

> Claude reads this at the start of every session. Update the "Current state" and "Next step" sections at the end of each phase.

## Project

Event-driven food-ordering platform. Graded assignment for Kvalitetssäkring systemnivå (System-Level QA).

Working directory: `~/quickbite/quickbite/`

Full plan: `~/.claude/plans/lets-read-the-files-unified-galaxy.md`

## Build phases

| Phase | Goal | Status |
|---|---|---|
| 0 | Bootstrap — unzip, git, CLAUDE.md, CONTEXT.md, hooks, Redis in compose | ✅ In progress |
| 1a | Postgres init.sql — create per-service databases | ⏳ Pending |
| 1b | Menu service — Postgres table + Redis cache | ⏳ Pending |
| 1c | Order service — Postgres tables | ⏳ Pending |
| 1d | Kitchen service — Postgres table | ⏳ Pending |
| 1e | Notification service — Postgres table (audit log) | ⏳ Pending |
| 2 | Outbox pattern — order service | ⏳ Pending |
| 3 | Redis idempotency — replace in-memory Idempotency class | ⏳ Pending |
| 4 | Retry-with-backoff in mq.ts | ⏳ Pending |
| 5 | Testcontainers integration tests | ⏳ Pending |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 0 in progress.** Scaffold unzipped, git initialized on `main`. CLAUDE.md updated. Hooks and Redis not yet added.

## Next step

Complete Phase 0:
- Add typecheck hook to `.claude/settings.json`
- Add custom commands: `new-migration.md`, `run-tests.md`
- Add Redis to `docker-compose.yml`
- Run `bun install` and `bun run typecheck` — must be green

Then start **Phase 1a**: create `docker/init.sql` to initialize per-service databases.

## Key files to know

| File | Purpose |
|---|---|
| `packages/shared/src/events.ts` | Single source of truth for all event Zod schemas |
| `packages/shared/src/mq.ts` | RabbitMQ connect/publish/consume helpers |
| `docker-compose.yml` | All infra — Postgres, RabbitMQ, Redis, Nginx, services |
| `.env.example` | Template for all env vars — copy to `.env` |

## Environment

```bash
RABBITMQ_URL=amqp://guest:guest@localhost:5672
ORDER_DATABASE_URL=postgres://quickbite:quickbite@localhost:5432/order_db
MENU_DATABASE_URL=postgres://quickbite:quickbite@localhost:5432/menu_db
KITCHEN_DATABASE_URL=postgres://quickbite:quickbite@localhost:5432/kitchen_db
REDIS_URL=redis://localhost:6379
```
