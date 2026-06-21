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
| 2 | Outbox pattern — order service | ⏳ Pending |
| 3 | Redis idempotency — replace in-memory Idempotency class | ⏳ Pending |
| 4 | Retry-with-backoff in mq.ts | ⏳ Pending |
| 5 | Testcontainers integration tests | ⏳ Pending |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 1e complete, on branch `phase-1e-notification-postgres` (not yet merged) — this closes out all of Phase 1.** Notification service now persists every consumed event to its own `notifications` table in `notification_db` (append-only audit log: `id, order_id, event_type, notified_at`). `services/notification/src/db.ts` is new (`recordNotification`); `index.ts` rewritten with `buildServer`. Ordering note: this service doesn't publish anything downstream, so the "persist before you act" discipline becomes "record the attempt before logging/sending the notification" rather than "persist before publish." Verified manually end-to-end: placed a real order, confirmed all 3 events (`order.placed`, `order.accepted`, `order.ready`) landed as rows in `notifications` with timestamps matching kitchen's ~3s cook delay. Snyk: 0 issues. Typecheck green.

**All 4 services (menu, order, kitchen, notification) now have real Postgres persistence — every in-memory stub from the original scaffold is gone.** Remaining in-memory piece: the `Idempotency` Set in `packages/shared/src/mq.ts`, used by order/kitchen/notification — that's explicitly Phase 3's job (Redis-backed).

**Workflow reminder**: every phase gets its own branch off `main`, pushed with a PR via `gh pr create` — never commit straight to `main`. No Claude/Anthropic references in commits, PRs, or files (user's explicit preference). Repo: https://github.com/devinder-dev/quickbite (public).

## Next step

**Phase 2 — Outbox pattern (order service).** Goal: publish `order.placed` only after the local DB transaction commits, formalized as an outbox table rather than today's "insert, then call publish() right after" (which already happens post-commit, but isn't yet resilient to a crash between commit and publish).

Likely files:
- `services/order/src/db.ts` — add an `outbox` table (`id uuid pk, routing_key text, payload jsonb, published_at timestamptz nullable`); `createOrder` inserts an outbox row in the same transaction as the order
- A poller (in-process `setInterval` or similar) that reads unpublished outbox rows and calls `publish()`, then marks them published

Before starting: branch off `main` as `phase-2-outbox` (after Phase 1e's PR is merged).

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
