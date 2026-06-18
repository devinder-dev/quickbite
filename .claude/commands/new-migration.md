# /new-migration

Scaffold a new SQL migration file for a service.

## Usage

```
/new-migration <service> <description>
```

Example: `/new-migration order add-outbox-table`

## What this does

Creates `services/<service>/src/db/migrations/<timestamp>_<description>.sql` with a template:

```sql
-- Migration: <description>
-- Service: <service>
-- Created: <date>

-- Step 1: Create table
CREATE TABLE IF NOT EXISTS ... (

);

-- Step 2: Add indexes
CREATE INDEX IF NOT EXISTS ... ON ...;
```

Then explains:
- WHY this migration exists (what problem it solves)
- WHAT the table structure means
- How to run it (the service auto-runs migrations on startup via `db.ts`)

Always wait for confirmation before creating the file.
