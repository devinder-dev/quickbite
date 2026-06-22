import { Link, useParams } from "react-router-dom";
import { OrderStatus } from "../components/OrderStatus.tsx";
import { useOrderPolling } from "../hooks/useOrderPolling.ts";

export function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  // The hook is always called, unconditionally, regardless of whether
  // orderId is present — calling hooks conditionally breaks React's rules
  // of hooks. useOrderPolling itself no-ops on an empty id (see its own
  // defensive guard).
  const state = useOrderPolling(orderId ?? "");

  if (!orderId) return <p>Missing order id.</p>;

  return (
    <div className="order-status-page">
      <OrderStatus state={state} />
      <Link to="/">Back to menu</Link>
    </div>
  );
}
