import postgres from "postgres";
import type { OrderItem } from "@quickbite/shared";

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

// Step 3: Insert the order and its line items together, in one transaction.
// WHY a transaction instead of two separate inserts: an order with zero
// items (because the item insert failed after the order insert succeeded)
// is invalid data — sql.begin rolls back both writes if either one fails,
// so the database never holds that half-written state.
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
  });
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
