import type { CartLine } from "../types.ts";

const STORAGE_KEY = "quickbite.orderHistory";
const MAX_ENTRIES = 10;

// Stores a snapshot of what was actually submitted (items + total), not
// just the bare id — captured at placement time in MenuPage, from the same
// cart lines that were just sent to POST /api/orders. Lets the history
// page show something a human can read ("2x Gyros, 1x Greek Salad — $24.00")
// instead of a raw UUID, with zero extra network calls.
export type HistoryEntry = {
  orderId: string;
  placedAt: string;
  items: CartLine[];
  totalCents: number;
};

// A real bug this caught: an earlier version of this app stored entries as
// just {orderId, placedAt}. A browser with THAT data already in localStorage
// loading THIS version would otherwise pass old-shape entries straight
// through — OrderHistoryPage's `entry.items.map(...)` would then throw on
// `items: undefined`, and with no error boundary, crash the whole page to
// blank white. Validate every entry's actual shape, not just "is it an
// array" — anything that doesn't match gets silently dropped, same as if it
// had never been there.
function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.orderId === "string" &&
    typeof v.placedAt === "string" &&
    typeof v.totalCents === "number" &&
    Array.isArray(v.items)
  );
}

// `storage` is injectable (defaults to the real localStorage) for the same
// "no I/O" pure-unit-test reason as lib/customerId.ts.
export function getOrderHistory(storage: Storage = localStorage): HistoryEntry[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry);
  } catch {
    // Corrupt/foreign localStorage content must never crash the app — treat
    // it the same as "no history yet".
    return [];
  }
}

// Most-recent-first, capped at MAX_ENTRIES, de-duplicated by orderId (a
// revisit moves an existing entry back to the front instead of duplicating
// it).
export function addOrderToHistory(entry: HistoryEntry, storage: Storage = localStorage): HistoryEntry[] {
  const existing = getOrderHistory(storage).filter((e) => e.orderId !== entry.orderId);
  const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
  storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
