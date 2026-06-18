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
| 1d | Kitchen service — Postgres table | ⏳ Pending |
| 1e | Notification service — Postgres table (audit log) | ⏳ Pending |
| 2 | Outbox pattern — order service | ⏳ Pending |
| 3 | Redis idempotency — replace in-memory Idempotency class | ⏳ Pending |
| 4 | Retry-with-backoff in mq.ts | ⏳ Pending |
| 5 | Testcontainers integration tests | ⏳ Pending |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 1c complete, on branch `phase-1c-order-postgres` (not yet merged).** Order service now persists to `order_db` Postgres: `orders` + `order_items` tables, written together in a single `sql.begin` transaction so an order is never half-saved. `services/order/src/db.ts` is new; `index.ts` rewritten with the `buildServer` pattern, same as menu. Verified manually: `POST /orders` → `201` with persisted data, `GET /orders/:id` returns the order with its items, unknown id → `404`. `order.placed` still publishes only after the transaction commits. Snyk scan: 0 issues. Typecheck green across all services.

Note: `Channel` type isn't actually re-exported by `@quickbite/shared` (it's a type-only import in `mq.ts`, and `export *` doesn't carry those through) — `services/order/src/index.ts` derives it locally via `Awaited<ReturnType<typeof connect>>["channel"]` instead. Worth revisiting if more services need this type.

**Workflow change as of this phase**: every phase now gets its own branch off `main`, pushed with a PR opened via `gh pr create` — no more direct commits to `main`. Also: no Claude/Anthropic references in any commit message, PR description, or file content (user's explicit preference for this repo). Repo: https://github.com/devinder-dev/quickbite (public).

## Next step

**Phase 1d — Kitchen service Postgres table.**

Files to create/modify:
- `services/kitchen/src/db.ts` — connect to `kitchen_db`, create `kitchen_orders` table (`order_id uuid pk, eta_minutes int, status text, accepted_at timestamptz`)
- `services/kitchen/src/index.ts` — replace in-memory idempotency/state with DB INSERT when accepting an order, UPDATE when ready

Before starting: branch off `main` as `phase-1d-kitchen-postgres` (after Phase 1c's PR is merged, per the new one-branch-per-phase workflow).

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
