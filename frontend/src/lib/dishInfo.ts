// Cosmetic-only, client-side display info keyed by dish name — the backend
// has no concept of emoji/descriptions, it only ever returns
// {id, name, price_cents}. Keyed by lowercased name so a seed-data casing
// change doesn't silently break the lookup. Falls back to a generic plate
// for any dish not in this list, so a future menu change can never produce
// a broken-looking card — worst case it just shows a plain plate.
const DISH_INFO: Record<string, { emoji: string; description: string }> = {
  gyros: { emoji: "🥙", description: "Grilled meat, pita, tzatziki, tomato, onion" },
  souvlaki: { emoji: "🍢", description: "Skewered, charcoal-grilled and marinated in herbs" },
  "greek salad": { emoji: "🥗", description: "Tomato, cucumber, olives, feta, red onion" },
  moussaka: { emoji: "🍆", description: "Layered eggplant, spiced beef, béchamel" },
  spanakopita: { emoji: "🥟", description: "Spinach and feta wrapped in crisp phyllo" },
  baklava: { emoji: "🍯", description: "Layered phyllo, walnuts, honey syrup" },
};

const FALLBACK = { emoji: "🍽️", description: "" };

export function getDishInfo(name: string): { emoji: string; description: string } {
  return DISH_INFO[name.toLowerCase()] ?? FALLBACK;
}
