import { formatCents } from "../lib/money.ts";
import type { MenuItem } from "../types.ts";

type Props = {
  items: MenuItem[];
  quantities: Record<string, number>;
  onChangeQuantity: (menuItemId: string, quantity: number) => void;
};

export function MenuList({ items, quantities, onChangeQuantity }: Props) {
  return (
    <ul className="menu-list">
      {items.map((item) => {
        const quantity = quantities[item.id] ?? 0;
        return (
          <li key={item.id} className="menu-list__item">
            <span className="menu-list__name">{item.name}</span>
            <span className="menu-list__price">${formatCents(item.price_cents)}</span>
            <div className="menu-list__stepper">
              <button
                type="button"
                onClick={() => onChangeQuantity(item.id, Math.max(0, quantity - 1))}
                disabled={quantity === 0}
                aria-label={`Decrease ${item.name} quantity`}
              >
                −
              </button>
              <span aria-label={`${item.name} quantity`}>{quantity}</span>
              <button
                type="button"
                onClick={() => onChangeQuantity(item.id, quantity + 1)}
                aria-label={`Increase ${item.name} quantity`}
              >
                +
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
