const STORAGE_KEY = "quickbite.customerId";

// This app has no auth — a customerId is generated once per browser and
// persisted, then reused for every order placed from that browser.
// `storage` is an injectable parameter (defaults to the real localStorage)
// specifically so this stays a true "no I/O" pure unit test — a fake
// in-memory Storage can be passed in tests instead of needing a real DOM.
export function getOrCreateCustomerId(storage: Storage = localStorage): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  storage.setItem(STORAGE_KEY, id);
  return id;
}
