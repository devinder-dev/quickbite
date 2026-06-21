import postgres from "postgres";
import { EventName, type OrderItem } from "@quickbite/shared";

// Step 1: Connect to this service's own Postgres database (order_db).
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://quickbite:quickbite@localhost:5432/order_db";
const sql = postgres(DATABASE_URL);

// Step 2: Ensure both tables exist. order_items references orders by FK —
// WHY a foreign key: the database itself then refuses to store a line item
// for an order that doesn't exist, instead of relying on application code
// to never make that mistake.
async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      order_id uuid PRIMARY KEY,
      customer_id uuid NOT NULL,
      status text NOT NULL,
      total_cents int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS order_items (
      id uuid PRIMARY KEY,
      order_id uuid NOT NULL REFERENCES orders(order_id),
      menu_item_id uuid NOT NULL,
      name text NOT NULL,
      quantity int NOT NULL,
      price_cents int NOT NULL
    )
  `;
  // The outbox: events written here in the same transaction as the order
  // are guaranteed to exist if and only if the order itself was committed.
  // A separate poller (outbox.ts) is the only thing that ever reads this
  // table and actually publishes to RabbitMQ.
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

export type StoredOrder = {
  orderId: string;
  customerId: string;
  status: string;
  totalCents: number;
  items: OrderItem[];
};

type CreateOrderInput = {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  totalCents: number;
};

// Step 3: Insert the order, its line items, and the outbox event together,
// in one transaction. WHY a transaction instead of separate statements: an
// order with zero items, or an order with no outbox row to eventually
// publish it, are both invalid data — sql.begin rolls back every write if
// any one fails, so the database never holds that half-written state.
//
// The eventId is generated here, once, at insert time — not later when the
// poller actually publishes. That way a row that gets retried by the poller
// (e.g. after a transient RabbitMQ outage) republishes with the SAME
// eventId every time, which is exactly what downstream idempotency checks
// (dedupe-by-eventId) are designed to collapse into one effective delivery.
export async function createOrder(input: CreateOrderInput): Promise<void> {
  const { orderId, customerId, items, totalCents } = input;

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO orders (order_id, customer_id, status, total_cents)
      VALUES (${orderId}, ${customerId}, 'placed', ${totalCents})
    `;

    const itemRows = items.map((item) => ({
      id: crypto.randomUUID(),
      order_id: orderId,
      menu_item_id: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price_cents: item.priceCents,
    }));

    await tx`INSERT INTO order_items ${tx(itemRows)}`;

    const payload = {
      type: EventName.OrderPlaced,
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId,
      customerId,
      items,
      totalCents,
    };

    await tx`
      INSERT INTO outbox (id, routing_key, payload)
      VALUES (${crypto.randomUUID()}, ${EventName.OrderPlaced}, ${tx.json(payload)})
    `;
  });
}

export type OutboxRow = {
  id: string;
  routingKey: string;
  payload: unknown;
};

// Step 4: Read unpublished outbox rows for the poller. Oldest first, so
// events go out roughly in the order they were created.
export async function getUnpublishedOutboxRows(limit = 20): Promise<OutboxRow[]> {
  const rows = await sql<{ id: string; routing_key: string; payload: unknown }[]>`
    SELECT id, routing_key, payload FROM outbox
    WHERE published_at IS NULL
    ORDER BY created_at
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ id: row.id, routingKey: row.routing_key, payload: row.payload }));
}

// Step 5: Mark a row published once the poller has actually handed it to
// the RabbitMQ channel. Never deleted — the outbox doubles as a permanent
// log of every event this service has ever emitted.
export async function markOutboxPublished(id: string): Promise<void> {
  await sql`UPDATE outbox SET published_at = now() WHERE id = ${id}`;
}

// Step 4: Read an order back with its items for GET /orders/:id.
// Returns null on a miss so the route layer can map that to a 404.
export async function getOrderById(orderId: string): Promise<StoredOrder | null> {
  const [order] = await sql<[{ order_id: string; customer_id: string; status: string; total_cents: number }?]>`
    SELECT order_id, customer_id, status, total_cents FROM orders WHERE order_id = ${orderId}
  `;
  if (!order) return null;

  const itemRows = await sql<
    { menu_item_id: string; name: string; quantity: number; price_cents: number }[]
  >`
    SELECT menu_item_id, name, quantity, price_cents FROM order_items WHERE order_id = ${orderId}
  `;

  return {
    orderId: order.order_id,
    customerId: order.customer_id,
    status: order.status,
    totalCents: order.total_cents,
    items: itemRows.map((row) => ({
      menuItemId: row.menu_item_id,
      name: row.name,
      quantity: row.quantity,
      priceCents: row.price_cents,
    })),
  };
}
