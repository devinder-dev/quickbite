import { Link } from "react-router-dom";
import { formatCents } from "../lib/money.ts";
import { getOrderHistory } from "../lib/orderHistory.ts";

export function OrderHistoryPage() {
  const history = getOrderHistory();

  if (history.length === 0) return <p>No past orders yet on this browser.</p>;

  return (
    <ul className="order-history">
      {history.map((entry) => {
        const summary = entry.items.map((item) => `${item.quantity}× ${item.name}`).join(", ");
        return (
          <li key={entry.orderId} className="order-history__entry">
            <Link to={`/orders/${entry.orderId}`} className="order-history__link">
              <span className="order-history__id">Order #{entry.orderId.slice(0, 8)}</span>
              <span className="order-history__summary">{summary}</span>
              <span className="order-history__meta">
                ${formatCents(entry.totalCents)} · placed {new Date(entry.placedAt).toLocaleString()}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
