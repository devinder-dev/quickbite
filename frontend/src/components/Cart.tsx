import { computeCartTotal } from "../lib/cartTotal.ts";
import { formatCents } from "../lib/money.ts";
import type { CartLine } from "../types.ts";

type Props = {
  lines: CartLine[];
  placing: boolean;
  error?: string;
  onPlaceOrder: () => void;
};

export function Cart({ lines, placing, error, onPlaceOrder }: Props) {
  const total = computeCartTotal(lines);
  const isEmpty = lines.length === 0;

  return (
    <div className="cart">
      <h2>Your order</h2>
      {isEmpty ? (
        <p>Your cart is empty.</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <li key={line.menuItemId}>
              {line.quantity} × {line.name} — ${formatCents(line.priceCents * line.quantity)}
            </li>
          ))}
        </ul>
      )}
      <p className="cart__total">Total: ${formatCents(total)}</p>
      {error ? <p className="cart__error">{error}</p> : null}
      <button type="button" onClick={onPlaceOrder} disabled={isEmpty || placing}>
        {placing ? "Placing order…" : "Place order"}
      </button>
    </div>
  );
}
