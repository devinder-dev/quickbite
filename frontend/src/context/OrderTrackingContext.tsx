import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useOrderPolling, type PollState } from "../hooks/useOrderPolling.ts";
import { useToasts, type Toast } from "../hooks/useToasts.ts";
import { getOrderHistory } from "../lib/orderHistory.ts";

const STATUS_MESSAGES: Record<string, string> = {
  placed: "📥 Order placed!",
  accepted: "👨‍🍳 Kitchen accepted your order",
  cooking: "🔥 Your order is cooking",
  ready: "✅ Order ready!",
};

type OrderTrackingValue = {
  activeOrderId: string | null;
  pollState: PollState;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  isBannerDismissed: boolean;
  dismissBanner: () => void;
  setActiveOrderId: (orderId: string) => void;
};

const OrderTrackingContext = createContext<OrderTrackingValue | null>(null);

// Lives above <Routes> in App.tsx — tracking and toasts must survive
// navigation, since the whole point of this is that a customer placing an
// order and then browsing the menu (or checking history, or anything else)
// should still get notified when the kitchen actually does something. A
// page-scoped version of this (the original design) dies the moment the
// user leaves that one page.
export function OrderTrackingProvider({ children }: { children: ReactNode }) {
  // Seeded from the existing order-history localStorage list (most recent
  // first, see lib/orderHistory.ts) — no new storage needed, and it means
  // reloading the page still shows the tracker for an order that hasn't
  // reached "ready" yet.
  const [activeOrderId, setActiveOrderIdState] = useState<string | null>(
    () => getOrderHistory()[0]?.orderId ?? null,
  );
  const [dismissedAtStatus, setDismissedAtStatus] = useState<string | null>(null);
  const pollState = useOrderPolling(activeOrderId ?? "");
  const { toasts, pushToast, dismiss } = useToasts();
  const lastAnnouncedStatus = useRef<string | null>(null);

  function setActiveOrderId(orderId: string): void {
    lastAnnouncedStatus.current = null;
    setDismissedAtStatus(null);
    setActiveOrderIdState(orderId);
  }

  // Every distinct status the poller observes gets its own visible notice
  // — moved here from OrderStatusPage specifically so it fires regardless
  // of which page is currently mounted, not just while the user happens to
  // be staring at /orders/:id.
  useEffect(() => {
    const currentStatus =
      pollState.phase === "polling" || pollState.phase === "ready" ? pollState.order.status : undefined;
    if (!currentStatus || currentStatus === lastAnnouncedStatus.current) return;

    lastAnnouncedStatus.current = currentStatus;
    pushToast(STATUS_MESSAGES[currentStatus] ?? `Status: ${currentStatus}`);
  }, [pollState, pushToast]);

  const currentStatus =
    pollState.phase === "polling" || pollState.phase === "ready" ? pollState.order.status : null;

  // Dismissing hides the banner only for the status it was dismissed at —
  // the moment status changes again (new information), it reappears
  // automatically. Dismissing at "ready" hides it for good, since status
  // never changes after that.
  const isBannerDismissed = currentStatus !== null && dismissedAtStatus === currentStatus;

  function dismissBanner(): void {
    if (currentStatus) setDismissedAtStatus(currentStatus);
  }

  return (
    <OrderTrackingContext.Provider
      value={{
        activeOrderId,
        pollState,
        toasts,
        dismissToast: dismiss,
        isBannerDismissed,
        dismissBanner,
        setActiveOrderId,
      }}
    >
      {children}
    </OrderTrackingContext.Provider>
  );
}

export function useOrderTracking(): OrderTrackingValue {
  const ctx = useContext(OrderTrackingContext);
  if (!ctx) throw new Error("useOrderTracking must be used within an OrderTrackingProvider");
  return ctx;
}
