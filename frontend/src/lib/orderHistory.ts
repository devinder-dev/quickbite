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

// `storage` is injectable (defaults to the real localStorage) for the same
// "no I/O" pure-unit-test reason as lib/customerId.ts.
export function getOrderHistory(storage: Storage = localStorage): HistoryEntry[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
