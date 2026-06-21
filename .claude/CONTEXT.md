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
| 5 | Testcontainers integration tests | ⏳ Pending |
| 6 | End-to-end test | ⏳ Pending |

## Current state

**Phase 4 complete, on branch `phase-4-retry-backoff` (not yet merged) — this closes out the cross-cutting resilience work (Phases 2-4).** `setupConsumer()` in `packages/shared/src/mq.ts` no longer dead-letters on the first handler failure. Each queue now gets a companion `${queue}.retry` queue (no bindings — only ever reached via `sendToQueue`); on failure, the message is republished there with a per-message `expiration` (exponential backoff: 1s, 2s, 4s for retry 1/2/3) and an `x-retry-count` header, then dead-letters BACK into the original queue once that TTL expires (via the default exchange + `deadLetterRoutingKey`). After `MAX_RETRIES` (3) failed attempts, it falls through to the existing permanent `<queue>.dlq` exactly as before. No service `index.ts` files changed — entirely contained in `mq.ts`, same shape as the Phase 2 reconnect fix.

**Real bug caught by manual testing, fixed in the same PR**: a message redelivered via the retry queue arrives through the default exchange with `msg.fields.routingKey` set to the QUEUE NAME, not the original event's routing key (e.g. `order.placed`) — discovered when a 2nd-attempt redelivery threw `TypeError: undefined is not an object (evaluating 'eventSchemas[routingKey].parse')`. Fixed by carrying the true routing key forward in an `x-original-routing-key` header, set on first failure and read in preference to `msg.fields.routingKey` on every subsequent attempt.

Verified manually with a throwaway test consumer (not committed) on a dedicated test queue: a handler that fails twice then succeeds on attempt 3 retried at the correct 1s/2s intervals and acked cleanly with no DLQ involvement; a handler that always fails retried exactly 3 times (4 total attempts, t=0/1/3/7s matching the backoff) then landed in the permanent DLQ, with no 4th retry. Re-confirmed the full real order→kitchen→notification happy path afterward — zero retry/error log lines, fully unaffected. Snyk: 0 issues. Typecheck green.

**Workflow reminder**: every phase gets its own branch off `main`, pushed with a PR via `gh pr create` — never commit straight to `main`. No Claude/Anthropic references in commits, PRs, or files (user's explicit preference). Repo: https://github.com/devinder-dev/quickbite (public).

## Next step

**Phase 5 — Testcontainers integration tests.** Goal: real Postgres + RabbitMQ in tests, no mocks for the broker/db — this is the graded testing-pyramid requirement (CLAUDE.md: unit → integration → e2e).

Likely approach:
- Add `@testcontainers/postgresql` and `@testcontainers/rabbitmq` dev deps to order/kitchen/notification (and menu, for its Postgres+Redis path — also `@testcontainers/redis` there)
- Flesh out `services/order/tests/place-order.test.ts` (currently a pure unit test, no I/O) into a real integration test: spin up containers, `POST /orders`, assert the DB row + outbox row + eventual publish
- Similar integration tests for kitchen (consume `order.placed`, assert `kitchen_orders` row + events published) and notification (assert all 3 events logged)

Before starting: branch off `main` as `phase-5-testcontainers` (after Phase 4's PR is merged).

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
