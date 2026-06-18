# QuickBite

Event-driven food-ordering platform, built as a system-level QA project.
Microservices in a Bun workspace, communicating over RabbitMQ.

## What's here

- `packages/shared` — event contracts (zod schemas) + RabbitMQ publish/consume helpers with a dead-letter queue and an idempotency guard. **This is the core.**
- `services/gateway` — public entry point; proxies reads to menu/order.
- `services/menu` — menu reads (static list for now).
- `services/order` — creates orders, publishes `order.placed`.
- `services/kitchen` — consumes `order.placed`, publishes `order.accepted` then `order.ready`.
- `services/notification` — consumes all order events, notifies the customer.

## Run it

```bash
cp .env.example .env
docker compose up --build
```

- Gateway via Nginx: http://localhost:8080
- Gateway direct: http://localhost:3000
- RabbitMQ management UI: http://localhost:15672 (guest / guest)

Place an order and watch the event flow in the logs:

```bash
curl -X POST http://localhost:8080/api/orders \
  -H 'content-type: application/json' \
  -d '{"customerId":"33333333-3333-3333-3333-333333333333","items":[{"menuItemId":"44444444-4444-4444-4444-444444444444","name":"Margherita","quantity":2,"priceCents":1200}]}'
```

You'll see order -> kitchen (accepted, then ready) -> notification in the container logs.

## Local dev (without Docker)

Start RabbitMQ (`docker compose up rabbitmq`), then in separate terminals:

```bash
bun install
bun run dev:menu
bun run dev:order
bun run dev:kitchen
bun run dev:notification
bun run dev:gateway
```

## Tests

```bash
bun test          # unit + (later) integration
bun run typecheck
```

## Deliberately left as TODOs (your build work)

These are stubbed so the scaffold runs immediately. Flesh them out — ideally
one per Claude Code plan-mode session:

1. Replace in-memory stores with **per-service PostgreSQL** databases.
2. Add the **outbox pattern** so events publish only after the DB commit.
3. Persist the **idempotency** set to a `processed_events` table.
4. Add **retry-with-backoff** before dead-lettering in `mq.ts`.
5. Add **Testcontainers** integration tests (real Postgres + RabbitMQ).
6. Add an **end-to-end** test: place order -> ready -> notified.

See `CLAUDE.md` for the rules these must follow.
