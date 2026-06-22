const STORAGE_KEY = "quickbite.orderHistory";
const MAX_ENTRIES = 10;

export type HistoryEntry = { orderId: string; placedAt: string };

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
