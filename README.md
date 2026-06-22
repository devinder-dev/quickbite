# QuickBite

Event-driven food-ordering platform: a public API gateway in front of 4
microservices (menu/product, order, kitchen, notification), talking to each
other over RabbitMQ and each owning its own PostgreSQL database. Built as a
system-level QA project — the event flow, persistence, and failure handling
are the actual point, not just the CRUD surface.

## Architecture

```
                              +-- /            --> frontend (React UI)
client → nginx (:80) --------+
                              +-- /api/*, /health --> gateway → menu / order   (synchronous reads)
                                                          |
                                                          v
                                                    order.placed (RabbitMQ)
                                                          |
                                             +------------+------------+
                                             v                         v
                                          kitchen                 notification
                                      (accepts, then ready)   (logs every order event)
```

- **nginx is the system's only public entry point.** Every other service —
  RabbitMQ, Postgres, Redis, the gateway, and the frontend container itself —
  is reachable only from other containers on the internal Docker network,
  never from the host.
- Synchronous HTTP exists only on the path client → nginx → gateway → service,
  for user-facing reads (menu, order status). The actual order workflow
  (placed → accepted → ready → notified) happens entirely over RabbitMQ events.
- Each service owns its own Postgres database; none of them ever reads or
  writes another service's tables.

## Run it

One command, no manual setup steps — database schemas and seed data are
created automatically on first boot (`docker/init.sql` creates one database
per service; each service creates its own tables and seeds itself on startup):

```bash
docker compose up --build
```

**Public entry point:** `http://localhost` (port 80, via nginx). This is the
only address the system exposes — RabbitMQ's management UI, Postgres, and
Redis are not reachable from the host with this command.

```bash
# Place an order
curl -X POST http://localhost/api/orders \
  -H 'content-type: application/json' \
  -d '{"customerId":"33333333-3333-3333-3333-333333333333","items":[{"menuItemId":"44444444-4444-4444-4444-444444444444","name":"Margherita","quantity":2,"priceCents":1200}]}'

# Check its status (replace with the orderId from the response above)
curl http://localhost/api/orders/<orderId>

# Read the menu
curl http://localhost/api/menu
```

Watch `docker compose logs -f kitchen notification` to see the event flow:
kitchen accepts the order immediately, marks it ready ~3s later (simulated
cook time), and notification logs all 3 order events as they happen.

## Frontend

A small React UI lives at `http://localhost/` (same nginx, same port 80) —
menu → cart → place order → a status screen that polls
`GET /api/orders/:id` live as it moves placed → accepted → ready, plus a
localStorage-backed order history. It's same-origin with the API (nginx
serves both under port 80), so there's no CORS configuration anywhere —
that's deliberate, not an oversight.

For local frontend development with hot reload, run the backend stack as
usual and run the frontend separately on the host:

```bash
docker compose up -d
bun run dev:frontend   # Vite dev server; proxies /api to http://localhost:80
```

### Local development

For direct access to Postgres/RabbitMQ/Redis (e.g. a DB GUI, or running one
service bare with `bun run dev:<service>` against dockerized infra), use the
dev override, which is not loaded by default:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Tests

```bash
bun run test       # unit + integration (Testcontainers) + end-to-end
bun run typecheck
```

Runs automatically in CI on every push and pull request (`.github/workflows/ci.yml`).
No mocks for any infrastructure — integration and e2e tests spin up real
Postgres/RabbitMQ/Redis containers. The frontend's tests are split the same
way: pure logic (`frontend/tests/lib/`, no DOM) and component-rendering
tests (`frontend/tests/components/`, real DOM via happy-dom +
Testing Library) — no backend changes needed for either.

## Resilience features

A few things worth knowing about for the oral defense, beyond the basic flow:

- **Transactional outbox** (order service) — events are written to an outbox
  table in the same DB transaction as the order, then published by a separate
  poller. A crash between commit and publish can never silently drop an event.
- **Automatic RabbitMQ reconnection** — a dropped broker connection recovers
  on its own; consumers and the outbox poller resume without a service restart.
- **Redis-backed idempotency** — every consumer dedupes redelivered events by
  `eventId`, namespaced per consumer so two services consuming the same event
  don't interfere with each other.
- **Retry with exponential backoff** — a failing handler gets 3 retries
  (1s/2s/4s) via a dead-letter-based delay queue before landing in the
  permanent dead-letter queue.
