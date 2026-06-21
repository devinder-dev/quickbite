import postgres from "postgres";

// Step 1: Connect to this service's own Postgres database (kitchen_db).
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://quickbite:quickbite@localhost:5432/kitchen_db";
const sql = postgres(DATABASE_URL);

// Step 2: Ensure the table exists. ready_at is nullable — it's only set
// once the order actually becomes ready, not at accept time.
async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS kitchen_orders (
      order_id uuid PRIMARY KEY,
      eta_minutes int NOT NULL,
      status text NOT NULL,
      accepted_at timestamptz NOT NULL DEFAULT now(),
      ready_at timestamptz
    )
  `;
}

await ensureSchema();

// Step 3: Record acceptance. The order_id primary key means a redelivered
// order.placed for an order we've already accepted would throw here instead
// of silently double-inserting — a useful second layer behind the in-memory
// idempotency check, not a replacement for it (that's Phase 3's job).
export async function acceptOrder(orderId: string, etaMinutes: number): Promise<void> {
  await sql`
    INSERT INTO kitchen_orders (order_id, eta_minutes, status)
    VALUES (${orderId}, ${etaMinutes}, 'accepted')
  `;
}

// Step 4: Record readiness on the same row.
export async function markOrderReady(orderId: string): Promise<void> {
  await sql`
    UPDATE kitchen_orders
    SET status = 'ready', ready_at = now()
    WHERE order_id = ${orderId}
  `;
}

export type KitchenOrder = {
  orderId: string;
  etaMinutes: number;
  status: string;
  readyAt: Date | null;
};

// Step 5: Read a row back. Returns null on a miss, same convention as
// order service's getOrderById.
export async function getKitchenOrder(orderId: string): Promise<KitchenOrder | null> {
  const [row] = await sql<[{ order_id: string; eta_minutes: number; status: string; ready_at: Date | null }?]>`
    SELECT order_id, eta_minutes, status, ready_at FROM kitchen_orders WHERE order_id = ${orderId}
  `;
  if (!row) return null;
  return { orderId: row.order_id, etaMinutes: row.eta_minutes, status: row.status, readyAt: row.ready_at };
}
