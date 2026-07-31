import postgres from "postgres";
import { EventName, type OrderItem } from "@quickbite/shared";

// Step 1: Connect to this service's own Postgres database (kitchen_db).
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://quickbite:quickbite@localhost:5432/kitchen_db";
const sql = postgres(DATABASE_URL);

// Step 2: Ensure the table exists. eta_minutes/accepted_at are nullable —
// unknown until a human actually accepts the order. customer_id/items/
// total_cents are kitchen's own snapshot of the order.placed payload it
// already receives — kitchen still owns only its own data, this just lets
// the dashboard render real order contents without reading order_db.
async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS kitchen_orders (
      order_id uuid PRIMARY KEY,
      customer_id uuid NOT NULL,
      items jsonb NOT NULL,
      total_cents int NOT NULL,
      eta_minutes int,
      status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      accepted_at timestamptz,
      ready_at timestamptz
    )
  `;
  // Same outbox pattern as order_db — see services/order/src/db.ts. Now
  // that accept/start-cooking/ready are HTTP-triggered actions (not an
  // event-handler chaining straight into another publish), they get the
  // same durability guarantee: an event can only ever exist if the status
  // change that caused it actually committed.
  await sql`
    CREATE TABLE IF NOT EXISTS outbox (
      id uuid PRIMARY KEY,
      routing_key text NOT NULL,
      payload jsonb NOT NULL,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

await ensureSchema();

export type KitchenOrder = {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  totalCents: number;
  etaMinutes: number | null;
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
  readyAt: Date | null;
};

type Row = {
  order_id: string;
  customer_id: string;
  items: OrderItem[];
  total_cents: number;
  eta_minutes: number | null;
  status: string;
  created_at: Date;
  accepted_at: Date | null;
  ready_at: Date | null;
};

function fromRow(row: Row): KitchenOrder {
  return {
    orderId: row.order_id,
    customerId: row.customer_id,
    items: row.items,
    totalCents: row.total_cents,
    etaMinutes: row.eta_minutes,
    status: row.status,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    readyAt: row.ready_at,
  };
}

// Step 3: Record that an order arrived — no event to publish here, this is
// just kitchen learning about it. The order_id primary key means a
// redelivered order.placed for an order kitchen already knows about throws
// here instead of silently double-inserting — a second layer behind the
// idempotency check in index.ts, not a replacement for it.
export async function createPendingOrder(
  orderId: string,
  customerId: string,
  items: OrderItem[],
  totalCents: number,
): Promise<void> {
  await sql`
    INSERT INTO kitchen_orders (order_id, customer_id, items, total_cents, status)
    VALUES (${orderId}, ${customerId}, ${sql.json(items)}, ${totalCents}, 'pending')
  `;
}

// Step 4: Each staff action below is transactional — the status UPDATE and
// the outbox INSERT commit together, exactly like services/order/src/db.ts#createOrder.
// A publish can only ever happen for a status change that actually stuck.
export async function acceptOrder(orderId: string, etaMinutes: number): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      UPDATE kitchen_orders SET status = 'accepted', eta_minutes = ${etaMinutes}, accepted_at = now()
      WHERE order_id = ${orderId}
    `;
    await tx`
      INSERT INTO outbox (id, routing_key, payload)
      VALUES (${crypto.randomUUID()}, ${EventName.OrderAccepted}, ${tx.json({
        type: EventName.OrderAccepted,
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        orderId,
        etaMinutes,
      })})
    `;
  });
}

export async function startCooking(orderId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`UPDATE kitchen_orders SET status = 'cooking' WHERE order_id = ${orderId}`;
    await tx`
      INSERT INTO outbox (id, routing_key, payload)
      VALUES (${crypto.randomUUID()}, ${EventName.OrderCooking}, ${tx.json({
        type: EventName.OrderCooking,
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        orderId,
      })})
    `;
  });
}

export async function markOrderReady(orderId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`UPDATE kitchen_orders SET status = 'ready', ready_at = now() WHERE order_id = ${orderId}`;
    await tx`
      INSERT INTO outbox (id, routing_key, payload)
      VALUES (${crypto.randomUUID()}, ${EventName.OrderReady}, ${tx.json({
        type: EventName.OrderReady,
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        orderId,
      })})
    `;
  });
}

// Step 5: Read a single row back, same convention as order's getOrderById —
// null on a miss.
export async function getKitchenOrder(orderId: string): Promise<KitchenOrder | null> {
  const [row] = await sql<[Row?]>`SELECT * FROM kitchen_orders WHERE order_id = ${orderId}`;
  return row ? fromRow(row) : null;
}

// Step 6: For the dashboard — everything not yet ready, oldest first, so
// staff naturally work through orders in the order they arrived.
export async function listActiveOrders(): Promise<KitchenOrder[]> {
  const rows = await sql<Row[]>`
    SELECT * FROM kitchen_orders WHERE status != 'ready' ORDER BY created_at
  `;
  return rows.map(fromRow);
}

export type OutboxRow = {
  id: string;
  routingKey: string;
  payload: unknown;
};

// Same as services/order/src/db.ts — read by outbox.ts's poller.
export async function getUnpublishedOutboxRows(limit = 20): Promise<OutboxRow[]> {
  const rows = await sql<{ id: string; routing_key: string; payload: unknown }[]>`
    SELECT id, routing_key, payload FROM outbox
    WHERE published_at IS NULL
    ORDER BY created_at
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ id: row.id, routingKey: row.routing_key, payload: row.payload }));
}

export async function markOutboxPublished(id: string): Promise<void> {
  await sql`UPDATE outbox SET published_at = now() WHERE id = ${id}`;
}
