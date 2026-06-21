import postgres from "postgres";

// Step 1: Connect to this service's own Postgres database (notification_db).
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://quickbite:quickbite@localhost:5432/notification_db";
const sql = postgres(DATABASE_URL);

// Step 2: Ensure the table exists. This is an append-only audit log — no
// updates, no foreign key to another service's table (that would violate
// "each service owns only its own database").
async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id uuid PRIMARY KEY,
      order_id uuid NOT NULL,
      event_type text NOT NULL,
      notified_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

await ensureSchema();

// Step 3: Record one row per event the service has been told to notify on.
// WHY before the actual notify call, not after: if the real send (email/push,
// still a TODO) fails partway, we still want a durable record that we
// attempted it — losing the attempt record entirely would be worse than
// occasionally recording an attempt whose send later failed.
export async function recordNotification(orderId: string, eventType: string): Promise<void> {
  await sql`
    INSERT INTO notifications (id, order_id, event_type)
    VALUES (${crypto.randomUUID()}, ${orderId}, ${eventType})
  `;
}
