import { Link } from "react-router-dom";
import { useOrderTracking } from "../context/OrderTrackingContext.tsx";
import { OrderStages } from "./OrderStages.tsx";

// Rendered once in App.tsx, above <Routes> — visible on every page, not
// just the order's own /orders/:id detail view. That's the actual fix for
// "progress is only in order history, not on the front": this is on the
// front (and everywhere else) now.
export function ActiveOrderBanner() {
  const { activeOrderId, pollState, isBannerDismissed, dismissBanner } = useOrderTracking();

  if (!activeOrderId || isBannerDismissed) return null;
  if (pollState.phase === "loading" || pollState.phase === "error") return null;

  // Narrowed to "polling" | "ready" | "timed-out" here — all three carry
  // `order`, though timed-out's can still be null if the very first poll
  // never resolved before the deadline.
  const { order } = pollState;
  if (!order) return null;

  return (
    <div className="active-order-banner">
      <div className="active-order-banner__top">
        <span>Order #{order.orderId.slice(0, 8)}</span>
        <button type="button" onClick={dismissBanner} aria-label="Dismiss order tracker">
          ×
        </button>
      </div>
      <OrderStages status={order.status} />
      {pollState.phase === "timed-out" ? (
        <p className="order-status__timeout">Still processing — taking longer than expected.</p>
      ) : null}
      <Link to={`/orders/${order.orderId}`}>View details</Link>
    </div>
  );
}
