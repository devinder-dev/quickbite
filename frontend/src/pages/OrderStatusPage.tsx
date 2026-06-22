import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { OrderStatus } from "../components/OrderStatus.tsx";
import { ToastList } from "../components/ToastList.tsx";
import { useOrderPolling } from "../hooks/useOrderPolling.ts";
import { useToasts } from "../hooks/useToasts.ts";

const STATUS_MESSAGES: Record<string, string> = {
  placed: "📥 Order placed!",
  accepted: "👨‍🍳 Kitchen accepted your order",
  cooking: "🔥 Your order is cooking",
  ready: "✅ Order ready!",
};

export function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  // The hook is always called, unconditionally, regardless of whether
  // orderId is present — calling hooks conditionally breaks React's rules
  // of hooks. useOrderPolling itself no-ops on an empty id (see its own
  // defensive guard).
  const state = useOrderPolling(orderId ?? "");
  const { toasts, pushToast, dismiss } = useToasts();
  const lastAnnouncedStatus = useRef<string | null>(null);

  // Every distinct status the poller observes gets its own visible
  // notice — not just a silently-updated badge. Compares against the last
  // status THIS page already announced (a ref, not state, so it doesn't
  // itself trigger a re-render) so a re-poll that returns the same status
  // again doesn't re-announce it.
  useEffect(() => {
    const currentStatus = state.phase === "polling" || state.phase === "ready" ? state.order.status : undefined;
    if (!currentStatus || currentStatus === lastAnnouncedStatus.current) return;

    lastAnnouncedStatus.current = currentStatus;
    pushToast(STATUS_MESSAGES[currentStatus] ?? `Status: ${currentStatus}`);
  }, [state, pushToast]);

  if (!orderId) return <p>Missing order id.</p>;

  return (
    <div className="order-status-page">
      <ToastList toasts={toasts} onDismiss={dismiss} />
      <OrderStatus state={state} />
      <Link to="/">Back to menu</Link>
    </div>
  );
}
