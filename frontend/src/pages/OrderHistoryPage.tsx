import { Link } from "react-router-dom";
import { getOrderHistory } from "../lib/orderHistory.ts";

export function OrderHistoryPage() {
  const history = getOrderHistory();

  if (history.length === 0) return <p>No past orders yet on this browser.</p>;

  return (
    <ul className="order-history">
      {history.map((entry) => (
        <li key={entry.orderId}>
          <Link to={`/orders/${entry.orderId}`}>{entry.orderId}</Link>
          <span> — placed {new Date(entry.placedAt).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
