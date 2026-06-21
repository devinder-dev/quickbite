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
| 6 | End-to-end test | ✅ Done |

## Current state

**ALL PHASES COMPLETE (0 through 6) — the build plan is finished.** Phase 6 (`tests/e2e/order-flow.test.ts`, new `@quickbite/e2e` workspace package) wires order, kitchen, and notification together in one test: one Postgres container hosting all 3 databases (`order_db`/`kitchen_db`/`notification_db`, created via raw `CREATE DATABASE` statements — mirroring `docker/init.sql`'s shape), one shared RabbitMQ + Redis container, each service's real entrypoint dynamically imported in sequence (same env-var + dynamic-import technique as Phase 5). A real `POST /orders` via `server.inject()` drives the whole chain; the test polls both kitchen's and notification's own databases until the full happy path completes.

**The one real architectural problem this phase surfaced, and the actual fix**: running `bun test` from the repo root executes every `*.test.ts` file in ALL packages within a SINGLE OS process by default. Since every service's `db.ts` reads `DATABASE_URL` from `process.env` once at module-load time, and Bun caches dynamically-imported modules by absolute path, a later test file calling `await import("../../services/order/src/server.ts")` could receive an already-cached module instance still pointing at an EARLIER test file's (already-stopped) Testcontainers Postgres. Tried Bun's `--isolate` flag (gives each file a fresh module/global context) — it didn't fully fix this, because `process.env` is OS-process-wide regardless of `--isolate`, and it also silently stopped honoring `bunfig.toml`'s test timeout, causing new failures. The actual fix: every package that has tests now has its own `"test": "bun test"` script, and the root script became `bun run --filter '*' --sequential test` — Bun's workspace filter spawns each package's tests as a genuinely separate OS process, which is real isolation, not just module-context isolation. Root `package.json`, every relevant `package.json`, and `.github/workflows/ci.yml`'s test step were updated to match.

**Also worth knowing for next time**: a `docker upgrade`-adjacent slip — an exploratory `strings $(which bun)`-adjacent command accidentally triggered `bun upgrade --canary`, bumping the global Bun install from `1.3.10` to a `1.4.0-canary` prerelease. Caught immediately and reverted via `bun upgrade --stable` (landed on `1.3.14`, the current stable patch — not byte-identical to `1.3.10`, but the same stable channel). And earlier in Phase 5: a Docker cleanup command filtered by `ancestor=postgres:16` accidentally matched and removed the real, long-running `quickbite-postgres-1` container — no data lost (named volume `pgdata` persisted) but worth remembering: never filter Docker cleanup by image name when other real containers share that image.

Snyk: 0 issues across every changed package, including `tests/e2e`. Typecheck green (now also covers `tests/e2e`). `bun run test` from the repo root: every package's suite passes (order 4, kitchen 2, notification 2, menu 2, shared 2, e2e 1 — 13 total), confirmed stable across 4 repeated full runs, exit code 0 every time, no orphaned Testcontainers left running (Ryuk reaper confirmed clean each time).

**Workflow reminder**: every phase gets its own branch off `main`, pushed with a PR via `gh pr create` — never commit straight to `main`. No Claude/Anthropic references in commits, PRs, or files (user's explicit preference). Repo: https://github.com/devinder-dev/quickbite (public).

## Next step

None — every phase in the build plan (`~/.claude/plans/lets-read-the-files-unified-galaxy.md`) is done. Possible follow-ups beyond the original plan, if wanted later: a real notification send (email/push, still a `TODO` in `services/notification/src/index.ts`), CI badge/status in `README.md`, or load-testing the outbox poller under concurrent order volume.

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
