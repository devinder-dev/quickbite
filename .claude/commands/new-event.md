---
description: Add a new domain event end to end, following the project contract
---
Add a new event named "$ARGUMENTS".

Steps (use plan mode, get approval before editing):
1. Define its zod schema + type in packages/shared/src/events.ts and register it in eventSchemas.
2. Identify the producing service and publish it only after the local commit.
3. Identify consuming services, bind the routing key, and make the handler idempotent.
4. Update the event catalog table in CLAUDE.md.
5. Add a unit test for the schema and update integration tests.
