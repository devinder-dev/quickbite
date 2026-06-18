# /run-tests

Run the right tier of tests for the current service or the whole workspace.

## Usage

```
/run-tests [service] [tier]
```

- `service`: `shared`, `order`, `menu`, `kitchen`, `notification` — or omit for all
- `tier`: `unit`, `integration`, `e2e` — or omit for unit + integration

## What each tier does

| Tier | Command | What it tests |
|---|---|---|
| unit | `bun test` | Pure logic, no I/O, no containers |
| integration | `bun test` (Testcontainers) | Real Postgres + RabbitMQ spun up in Docker |
| e2e | `bun test tests/e2e/` | Full order flow across all services |

## Rules

- Always run unit tests first. If they fail, fix before running integration.
- Integration tests need Docker running (`docker compose up -d rabbitmq postgres redis`).
- After each phase, run the relevant tier before declaring done.
- Report: pass count, fail count, and any failing test names with the error.
