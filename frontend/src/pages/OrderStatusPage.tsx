import { Link, useParams } from "react-router-dom";
import { OrderStatus } from "../components/OrderStatus.tsx";
import { useOrderPolling } from "../hooks/useOrderPolling.ts";

// This page is a generic "view any order's current status" view — reached
// either right after placing one, or later from order history. It no
// longer owns toast-announcing: that's OrderTrackingContext's job now,
// living above <Routes> so it fires regardless of which page is mounted.
// This page would otherwise double-announce the same transitions for the
// active order.
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
