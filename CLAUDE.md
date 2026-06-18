# CLAUDE.md — QuickBite

> Event-driven food-ordering platform. Microservices in a Bun workspace, talking over RabbitMQ. Built as a system-level QA project. Keep this file tight — it loads every session.

## Architecture (invariants — do not violate)

- Microservices, each owning **only its own** PostgreSQL database. A service **never** reads or writes another service's tables.
- Inter-service workflow communication is via **RabbitMQ events only**. No direct service-to-service HTTP calls for the order workflow.
- Synchronous HTTP exists **only** on the path `client → Nginx → API gateway → service` for user-facing reads (menu, order status).
- The gateway is the single public entry point. Individual services are not exposed publicly.

Flow: `Order` publishes `order.placed` → `Kitchen` consumes it, then publishes `order.accepted` and `order.ready` → `Notification` consumes all order events.

## Tech stack

- Runtime/framework: **Bun + Fastify + TypeScript** (strict, ESM) in every service
- Messaging: **RabbitMQ** (topic exchange, durable queues, DLQ)
- Data: **PostgreSQL**, one database per service
- Cache + idempotency: **Redis** (menu cache with TTL, event dedup with SETNX + TTL)
- Edge: **Nginx** reverse proxy / load balancer in front of the gateway
- Local orchestration: **Docker Compose**
- CI/CD: **GitHub Actions**
- Tests: **bun test** + **Testcontainers** for integration

## Repo layout (Bun workspace monorepo)

```
quickbite/
├── docker-compose.yml
├── nginx/nginx.conf
├── .github/workflows/ci.yml
├── packages/
│   └── shared/            # event types, zod schemas, mq + db helpers
├── services/
│   ├── gateway/
│   ├── menu/
│   ├── order/
│   ├── kitchen/
│   └── notification/
└── .claude/{commands,agents}/
```

Each service: `src/{index.ts, routes/, events/, db/}`, `tests/`, `Dockerfile`, `package.json`.

## Event catalog (the contract — source of truth in packages/shared)

All payloads share an envelope: `{ eventId: uuid, occurredAt: ISO8601, ... }`.

| Event             | Published by | Consumed by            | Payload                                              |
|-------------------|--------------|------------------------|------------------------------------------------------|
| `order.placed`    | order        | kitchen, notification  | `orderId, customerId, items[], totalCents`           |
| `order.accepted`  | kitchen      | order, notification    | `orderId, etaMinutes`                                |
| `order.ready`     | kitchen      | notification           | `orderId`                                            |

Add new events here first, define the zod schema in `packages/shared`, then implement.

## Hard rules

- Event consumers **must be idempotent** — dedupe on `eventId` (store processed IDs). RabbitMQ can redeliver.
- Publish an event **only after** the local DB transaction commits (outbox pattern preferred).
- **Validate every event payload** with the zod schema from `packages/shared` on both publish and consume.
- Failed messages retry with backoff, then go to a **dead-letter queue** — never infinite-loop a poison message.
- Every service exposes `GET /health`.
- Config via env vars; `.env` is gitignored. **Never hardcode secrets or connection strings.**

## Code conventions

- TypeScript strict, no `any`, named exports, ESM imports.
- Validate all external input (HTTP bodies + event payloads) with **zod**.
- Structured logging with **pino**, include `eventId`/`orderId` in log context.
- Errors: throw typed errors, map to proper HTTP status at the route layer.
- **Step comments** in every file: `// Step 1: Connect to database`, `// Step 2: ...`
- **Emojis** in all log/console messages: ✅ success, ❌ error, 🚀 startup, ⚠️ warning
- **`.ts` extensions** on all local imports: `import { foo } from "./foo.ts"`
- **`buildServer` pattern**: separate `async function buildServer()` from `buildServer().then(start)` — never inline startup
- Use `server` as the Fastify variable name, never `fastify`
- Clean sections separated by blank lines and step comments — any teammate must be able to read the file

## Testing (system-level QA — this is graded)

Follow the testing pyramid:
- **Unit** — pure domain logic, no I/O.
- **Integration** — real Postgres + RabbitMQ via Testcontainers (no mocks for the broker/db).
- **End-to-end** — one happy-path flow: place order → kitchen ready → customer notified.

CI must be green before anything merges. Run the relevant tier locally before declaring a task done.

## Common commands

```bash
bun install                          # install workspace deps
docker compose up -d                 # start rabbitmq, postgres, services
docker compose logs -f <service>     # tail one service
bun run --filter <service> dev       # run one service in watch mode
bun test                             # unit + integration for current package
bun run typecheck                    # tsc --noEmit across workspace
```

## Workflow rules for Claude

- **Use plan mode (Shift+Tab) before any new service or feature.** Present the plan and wait for approval before editing files.
- One service / one concern per change. Small commits, **conventional commit** messages (`feat(order): ...`).
- Before saying a task is done: run `bun run typecheck` and `bun test` for the touched service.
- **Never** run `docker compose down -v`, drop a database, or delete migrations without asking first.
- Don't push to `main` or deploy. Make a branch and open a PR (`gh pr create`).
- **Always fetch library docs via Context7 MCP** before using any library API — never guess, never rely on training data. This applies to postgres.js, ioredis, amqplib, fastify, zod, testcontainers, etc.
- **Always run Snyk** (`snyk_code_scan`) after writing new first-party TypeScript code. Fix any issues before continuing.
- **Go file by file.** Complete and explain one file at a time. Wait for confirmation before the next.
- **Explain every step**: WHY we're doing it, WHAT it means, and how it compares to alternatives. This is a learning project — understanding matters more than speed.
- Read `.claude/CONTEXT.md` at the start of every session to know the current project state. Update it at the end of each phase.

> Update this file when you correct the same mistake twice — add the shortest rule that would have prevented it, and remove any rule it contradicts.
