// Formats integer cents as a 2-decimal currency string, e.g. 1200 -> "12.00".
// Pure — no I/O — so it's directly unit-testable with bun test.
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
