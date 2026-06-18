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
| 1e | Notification service — Postgres table (audit log) | ⏳ Pending |
| 2 | Outbox pattern — order service | ⏳ Pending |
| 3 | Redis idempotency — replace in-memory Idempotency class | ⏳ Pending |
| 4 | Retry-with-backoff in mq.ts | ⏳ Pending |
| 5 | Testcontainers integration tests | ⏳ Pending |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 1d complete, on branch `phase-1d-kitchen-postgres` (not yet merged).** Kitchen service now persists to `kitchen_db` Postgres: a single `kitchen_orders` table tracks `accepted` → `ready` status per order. `services/kitchen/src/db.ts` is new (`acceptOrder`, `markOrderReady`); `index.ts` rewritten with the `buildServer` pattern (health check only — the actual work is the RabbitMQ consumer). Persist-then-publish ordering preserved: DB write happens before `order.accepted`/`order.ready` are published, same as order service. The existing in-memory `Idempotency` Set is untouched (that's Phase 3); the new `order_id` primary key acts as a second guard against double-accepting the same order. Verified manually end-to-end: placed a real order via the order service, watched kitchen's logs and the `kitchen_orders` row go `accepted` (immediately) → `ready` (after the 3s simulated cook time, `ready_at` populated). Snyk: 0 issues. Typecheck green.

**Workflow reminder**: every phase gets its own branch off `main`, pushed with a PR via `gh pr create` — never commit straight to `main`. No Claude/Anthropic references in commits, PRs, or files (user's explicit preference). Repo: https://github.com/devinder-dev/quickbite (public).

## Next step

**Phase 1e — Notification service Postgres table (audit log).**

Files to create/modify:
- `services/notification/src/db.ts` — connect to `notification_db`, create `notifications` table (`id uuid pk, order_id uuid, event_type text, notified_at timestamptz`)
- `services/notification/src/index.ts` — on each of the 3 order events consumed, INSERT an audit row

Before starting: branch off `main` as `phase-1e-notification-postgres` (after Phase 1d's PR is merged).

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
