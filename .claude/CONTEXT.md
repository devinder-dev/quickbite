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

## Fix-up pass: exam-criteria gaps (branch `fix-exam-criteria`)

After all 6 phases were done, a pass comparing the system against the actual examination brief (single public entry point, README accuracy, pure unit tests for logic) surfaced and fixed:

1. **Single public entry point lockdown** — `docker-compose.yml` no longer publishes host ports for `postgres`, `redis`, `rabbitmq`, or `gateway`; nginx is now `80:80` (was `8080:80`). A new `docker-compose.dev.yml` (NOT auto-merged — must be passed explicitly via `-f`) restores host ports for `postgres`/`redis`/`rabbitmq` for local debugging only. Verified empirically: `docker compose ps` shows only nginx with a port mapping, internal ports closed to the host, full order flow works through nginx alone, dev override restores infra ports without exposing the gateway.
2. **README rewritten** to match the actual built system and state the single entry point (`http://localhost`, port 80, via nginx) explicitly.
3. **Two pure unit tests added**, satisfying the brief's explicit (separate from integration/e2e) unit-testing requirement: `services/order/src/pricing.ts` (`computeTotalCents`, extracted out of `server.ts`'s route handler) and `packages/shared/src/mq.ts`'s `backoffMs` (now exported). Cache-aside and Redis-NX idempotency logic deliberately left to existing integration tests, not forced into mocks.
4. **Real bug found and fixed — gateway proxy was completely broken.** `@fastify/http-proxy` (via `@fastify/reply-from`) forwards through a Node-style undici `Pool` whose `.request()` Bun's runtime doesn't implement compatibly — every proxied call threw `pool.request is not a function`. This had never been caught because nothing had tested the real flow through nginx until this pass. Fixed by hand-rolling the proxy in `services/gateway/src/index.ts` with Bun's native `fetch()`; removed `@fastify/http-proxy` from `services/gateway/package.json`. Verified end-to-end through the real Docker stack (menu read, place order, order status, 404, full kitchen/notification event chain).
5. **Second real bug found and fixed — `RedisIdempotency` read `REDIS_URL` into a module-level constant at import time**, not inside the constructor. Any test file that statically imports `@quickbite/shared` (which re-exports `idempotency.ts`) before setting `process.env.REDIS_URL` in `beforeAll` locks in the fallback `redis://localhost:6379` — a port nothing is listening on — causing every Redis call in that test run to fail with `ioredis Unhandled error event`. This looked exactly like Docker Desktop network flakiness (same symptom, same unchanged-test-also-fails evidence) but survived a full Docker Desktop restart, which is what proved it was a code bug, not an environment issue. Fixed by moving the `process.env.REDIS_URL` read into `RedisIdempotency`'s constructor default parameter. **Lesson: any module-level `const X = process.env.Y ?? fallback` in a file reachable via a package barrel (`packages/shared/src/index.ts`) is unsafe for tests that set env vars in `beforeAll` — only safe if the env read happens inside a function/constructor, not at import time.**

Snyk: 0 issues. Typecheck and full `bun run test` (all 6 packages) green after both bug fixes.

## Addition: React frontend (branch `feature/frontend`, additive, not graded)

After backend submission, the user wanted a UI to click-test the system themselves before the oral defense. New top-level `frontend/` (React + Vite + TypeScript, react-router-dom), its own 7th Docker container with a healthcheck, served by a hand-rolled Bun static file server (`frontend/serve.ts` — path-traversal-safe, SPA-fallback for client routes). `nginx.conf` now splits traffic: `/api/*` and `= /health` → gateway (unchanged), everything else → the new `frontend` upstream — nginx remains the system's only published port.

Key decisions, each one a deliberate fix for a concrete risk surfaced during planning/implementation, not guesswork:
- **Did NOT import `OrderItem` from `@quickbite/shared`** for client-side cart validation — that package's barrel re-exports `mq.ts`/`idempotency.ts`, which pull in `amqplib`/`ioredis` (Node-only, not browser-safe). Duplicated a minimal zod schema in `frontend/src/lib/orderItem.ts` instead, same "client previews, server stays authoritative" reasoning as `cartTotal.ts` vs. `services/order/src/pricing.ts`.
- **`useOrderPolling` hook**: setTimeout-chain (never raw `setInterval`, to avoid overlapping in-flight requests), AbortController + `cancelled` flag (no setState-after-unmount), treats a 404 as "not found yet" within a bounded ~60s window (not fatal — the outbox pattern means the row can briefly lag right after `POST /orders` returns), explicit "timed-out" UI state if `"ready"` is never reached.
- **Real test-infra bug found and fixed**: `@testing-library/react`'s `screen` binds to `document.body` once, at *module-load time* — and ESM hoists all `import` statements above any other code regardless of where they're written. A static `import { cleanup } from "@testing-library/react"` at the top of `frontend/tests/setup.ts`, written after `GlobalRegistrator.register()` in source order, was still being evaluated *before* it at runtime, permanently breaking every `screen.*` query. Fixed with a dynamic `await import("@testing-library/react")` placed after registration. Also needed an `afterEach(cleanup)` — without it, happy-dom's shared document persists rendered output across test files, causing false "multiple elements found" errors.
- Frontend's own `zod` was pinned to `^3.23.8` to match the rest of the repo (it resolved to v4 by default) — same major version everywhere, deliberately.
- Verified live, not just via tests: full `docker compose up --build` → `frontend` reaches `healthy` → curl-driven `placed → accepted → ready` through nginx → confirmed a hard-refresh on a deep link like `/orders/<uuid>` returns the SPA shell (200), not a 404 → confirmed path-traversal attempts on `serve.ts` fall through safely to the SPA fallback, never leak a file outside `dist/` → confirmed the public-entry-point invariant still holds (only nginx has a published port; frontend's internal port 3005 is unreachable from the host).

Snyk: 0 issues. Typecheck and full `bun run test` (now 7 packages, frontend included — pure `lib/` unit tests + `happy-dom`-backed component tests) green.

**Per explicit user instruction: do not merge this branch automatically.** Wait for the user's own manual click-through in a real browser before merging — unlike every prior phase, where merge was pre-approved. (PR #12, the original basic version, was merged by the user directly on GitHub.)

### Follow-up 1: Greek taverna theme + readable order history (PR #13)

User feedback after clicking through PR #12: too basic/generic, and order history showed raw UUIDs. Fixed: reseeded the menu with real Greek dishes (`services/menu/src/db.ts` — Gyros/Souvlaki/Greek Salad/Moussaka), redesigned the frontend with a Mediterranean color palette + food-emoji menu cards (`frontend/src/lib/dishInfo.ts`, new), and changed `HistoryEntry` to store a snapshot of items+total captured at placement time (no extra fetch) so history reads "2x Gyros, 1x Greek Salad — $31.00" instead of a bare id. Also added an explicit on-screen explanation of *how* the live status update works ("checking every 1.5s" / "the kitchen service published an event over RabbitMQ") since the user asked how to know it's actually working, not just see a badge change.

### Follow-up 2: real crash found + full live verification pass (still PR #13)

User found a genuine bug by actually clicking "Order history": a browser with localStorage entries from before items/totalCents existed (saved by the *first* frontend version) crashed `OrderHistoryPage` (`entry.items.map(...)` on `items: undefined`) — and with no error boundary, that blanked the entire app. Fixed `getOrderHistory` to validate each entry's actual shape and silently drop anything malformed instead of trusting raw JSON, and added a top-level `ErrorBoundary` (`frontend/src/ErrorBoundary.tsx`) as a backstop for any future unexpected render error. Also noticed `order-events.ts` was the only event consumer in the whole system with no success log line — added one, matching kitchen/notification's existing `✅` convention.

User then asked, explicitly, how to know all events/listeners are working without bugs before final submission — did a full live verification, not just re-running the test suite: traced a real order through `docker compose logs` for order/kitchen/notification (every consumer logged a clear `✅` confirmation), and **published a duplicate `order.placed` event directly to RabbitMQ with the same eventId** to prove the Redis-idempotency dedupe actually collapses a real redelivery (kitchen's log showed `accepted`/`ready` exactly once despite receiving the event twice) — not just trusting the existing unit test for this. Re-confirmed the public-entry-point invariant still holds after all changes.

## Submission (2026-06-22, before the course deadline)

User had to submit the graded assignment before midnight while frontend work was still mid-flight on `feature/kitchen-workflow`. Built the submission zip from `main`'s commit `f209933` (the merge of PR #11, fix-order-status-sync — the last commit before any frontend work started), NOT from current `main` (which already has the basic + Greek-themed frontend merged) and NOT from the in-progress kitchen-workflow branch. Used `git archive f209933` into a clean temp dir (safe, didn't touch the working tree), then ran the *exact* same verification as the original submission: `bun install`, typecheck, full test suite, fresh `docker compose up --build`, full curl-driven order flow, port-lockdown check — all from that exported snapshot, then zipped and re-verified the zip itself from a second fresh extraction. User explicitly chose to leave GitHub's `main` branch as-is (frontend merged) and only make the zip backend-only — the repo link showing extra non-graded frontend work was judged not to matter, reverting `main` right before a deadline was judged riskier than worth it.

**Important for next session**: the submitted zip still has the original placeholder menu (Margherita/Pepperoni pizza) and the old fully-automatic kitchen (auto-accept, auto-ready after ~3s) — it predates both the Greek menu and the new manual kitchen-workflow feature. This was deliberate (oldest fully-graded-clean state), not an oversight, but worth remembering if the user asks "does the submission match what I've been clicking through" — it does not, by design.

## Addition: manual kitchen workflow + real notifications (branch `feature/kitchen-workflow`, additive, not graded)

After the Greek-theme frontend pass, the user pushed back hard: "you are becoming more clueless... lets build a dump app" — the kitchen was a fake (auto-accept + `setTimeout` auto-ready, no human in the loop) and there were no real notifications, just a silently-updating badge. Entered plan mode (per CLAUDE.md's rule for new features) and built a real human-driven workflow:

- **New event**: `order.cooking` (`packages/shared/src/events.ts`) — same shape as `order.ready`. Lifecycle is now `placed → accepted → cooking → ready`, every transition triggered by a kitchen staff action, never a timer.
- **Kitchen rewritten**: `services/kitchen/src/index.ts`'s `order.placed` consumer now ONLY records a `pending` order (`createPendingOrder`) — no more auto-accept. Added `services/kitchen/src/server.ts` (HTTP routes: `GET /orders`, `POST /orders/:id/{accept,start-cooking,ready}`) and `services/kitchen/src/outbox.ts` (copied from order's, same pattern) so these HTTP-triggered actions get the same outbox durability guarantee order's `POST /orders` already had — CLAUDE.md's own hard rule ("publish only after the DB transaction commits") applied consistently to a second service.
- **Gateway**: new `/api/kitchen/*` proxy route to the kitchen service.
- **Frontend**: a second page, `/kitchen` (`KitchenDashboardPage.tsx`) — lists active orders, one contextual button per status. Both sides (customer `OrderStatusPage` and the kitchen dashboard) now show real toast notifications (`useToasts.ts` + `ToastList.tsx`) for every state change / new order, not just a silently-updated badge — directly answering the user's "every message should be a notice" complaint.

**Three real bugs found and fixed during this pass, each one only surfaced because the new manual-action HTTP routes were genuinely new shapes of traffic this system had never carried before**:
1. **Test-only race in `services/kitchen/src/index.ts`**: rewritten to use a `.then()` chain (matching order's style) instead of the original top-level `await connect()`/`await consume()`. A test importing `index.ts` then immediately publishing an event raced ahead of consumer registration — the event landed on a topic exchange with no matching binding yet and was silently dropped (not retried, genuinely lost). Reverted to top-level await for connect+consume, matching the *original* kitchen code's own deliberate design — this was a regression I introduced, not a pre-existing bug.
2. **Gateway content-type bug** (`services/gateway/src/index.ts`'s `proxyTo`): unconditionally set `content-type: application/json` on every non-GET/HEAD proxied request, even ones with no body. Every prior POST endpoint (`POST /api/orders`) always had a real JSON payload, so this never surfaced — kitchen's new `accept`/`start-cooking`/`ready` actions are bodyless POSTs, the first in the system, and the upstream Fastify server rejected them outright (`FST_ERR_CTP_EMPTY_JSON_BODY`) before the route handler ever ran. Fixed by only setting the header (and body) when `req.body !== undefined`.
3. **Real concurrency bug in `services/order/src/order-events.ts`**: the consumer used the default `prefetch: 10`, letting RabbitMQ deliver up to 10 unacked messages concurrently. Three events for the *same* order (`accepted`/`cooking`/`ready`) could have their independent `UPDATE orders SET status = ...` calls complete out of order under concurrent async handling — observed live as the order's status getting permanently stuck on `"cooking"` even though `"ready"` had already been delivered and handled, just completed its DB write first. Fixed with `prefetch: 1` on this consumer specifically — it has no use for concurrency, only risk, since its whole job is mirroring a sequence for one row. Found via genuine test flakiness (~1/3 failure rate) chased down by repeated runs, not by inspection — a good reminder that "tests are green" isn't the same as "no race exists" until proven by repetition under load.

Snyk: 0 issues. Typecheck and full `bun run test` (7 packages, 76 tests) green, confirmed stable across 8+ repeated runs of the e2e and kitchen suites after the prefetch fix (it was reliably reproducing the race before the fix, reliably not after). Verified live end-to-end via Docker: placed → pending (kitchen) → accept → cooking → ready, customer status syncing at every step, all 4 events visible in every consumer's logs, port lockdown intact, `/kitchen` SPA route working.

User asked, after the submission was already filed, to wipe the dev Postgres volume for the new `kitchen_orders` schema (new/nullable columns) — asked first per CLAUDE.md's hard rule, user said yes (local dev data only).

This was paused mid-session for the submission deadline, then resumed and pushed as PR #14 (CI green, not merged — same "wait for user's click-through" rule as every frontend PR).

### Follow-up: order tracking was page-scoped, not global (still branch `feature/kitchen-workflow`)

After clicking through PR #14 live, the user reported two related bugs: cooking/ready toasts never appeared, and order progress was only visible by digging into order history, not anywhere on "the front." Root cause for both: `useOrderPolling` and the toast-announcing effect lived entirely inside `OrderStatusPage` — navigate away from `/orders/:id` for any reason (browse the menu, check history, open the kitchen dashboard) and the component unmounts, polling stops, and any transition that happens while not pinned to that exact page is never observed.

Fix: lifted tracking to the app level. New `OrderTrackingContext` (`frontend/src/context/OrderTrackingContext.tsx`) wraps `App.tsx` above `<Routes>` — owns `activeOrderId` (seeded from `getOrderHistory()[0]`, no new storage needed), runs the same `useOrderPolling` hook unchanged, and moved the toast-announcing effect out of `OrderStatusPage` into here so it fires regardless of which page is mounted. New `ActiveOrderBanner` (`frontend/src/components/ActiveOrderBanner.tsx`), rendered once in `App.tsx` above `<Routes>`, so it's visible on every page — the actual fix for "not visible on the front." Extracted `OrderStages` out of `OrderStatus.tsx` into its own file so both components render the identical stage tracker. Also bumped `useOrderPolling`'s timeout from 60s to 30 minutes — that number made sense for the old 3-second timer-driven kitchen, not a human-paced one.

Dismiss behavior is state-aware, not just a one-shot hide: `dismissedAtStatus` tracks which status the banner was dismissed at, so dismissing while "accepted" hides it, but it reappears automatically the moment status changes to "cooking" (new information) — dismissing at "ready" hides it for good since status never changes after that.

Snyk: 0 issues. Typecheck and full `bun run test` (81 tests, 7 packages) green — backend untouched this round, only frontend changed. Verified the production Vite build via Docker actually contains the new code (`grep`'d the built JS bundle for a string unique to `ActiveOrderBanner`) and that `/`, `/history`, `/kitchen`, and a deep-link `/orders/:id` all still serve correctly post-build — the thing component tests alone can't catch.

## Next step

Finish the `feature/kitchen-workflow` PR: push, open PR, **do not merge automatically** (same rule as the frontend branch — wait for the user's own click-through). After that: no more build work currently planned for the graded backend (already submitted). The user's eventual next intent is a Q&A/walkthrough session to fully understand the codebase ahead of the oral defense (explain architecture, justify decisions, describe traffic flow, name an error scenario and its handling — the three concurrency/protocol bugs found this session are excellent material for that). Possible further follow-ups if wanted later: a real notification send (email/push, still a `TODO` in `services/notification/src/index.ts`), CI badge/status in `README.md`, or load-testing the outbox poller under concurrent order volume.

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
