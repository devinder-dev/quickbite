import postgres from "postgres";

// Step 1: Connect to this service's own Postgres database (menu_db).
// WHY a connection string from env, not hardcoded: keeps secrets out of
// source control and lets docker-compose / .env point at different hosts
// per environment without code changes.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://quickbite:quickbite@localhost:5432/menu_db";
const sql = postgres(DATABASE_URL);

export type MenuItem = {
  id: string;
  name: string;
  price_cents: number;
};

// Step 2: Ensure the table exists. Using IF NOT EXISTS instead of a separate
// migration tool keeps this small service simple — fine for this project's
// scale, but a real production service would use a migration framework.
async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS menu_items (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      price_cents int NOT NULL
    )
  `;
}

// Step 3: Seed the table once, only if empty. Keeps local dev/demo working
// without a separate seed script, while staying idempotent across restarts.
async function ensureSeed(): Promise<void> {
  const [{ count }] = await sql<[{ count: string }]>`SELECT count(*)::int FROM menu_items`;
  if (Number(count) > 0) return;

  await sql`
    INSERT INTO menu_items (id, name, price_cents) VALUES
      ('44444444-4444-4444-4444-444444444444', 'Margherita', 1200),
      ('55555555-5555-5555-5555-555555555555', 'Pepperoni', 1400)
  `;
}

// Step 4: Run schema + seed setup once at module load, before any request
// can reach the route handler that depends on this table.
await ensureSchema();
await ensureSeed();

// Step 5: Export the read used by the /menu route. The cache layer (cache.ts)
// decides whether this ever actually runs for a given request.
export async function getMenuItems(): Promise<MenuItem[]> {
  return sql<MenuItem[]>`SELECT id, name, price_cents FROM menu_items ORDER BY name`;
}
