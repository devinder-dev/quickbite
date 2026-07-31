import { useEffect, useRef, useState } from "react";
import { acceptOrder, markReady, startCooking } from "../api.ts";
import { ToastList } from "../components/ToastList.tsx";
import { useKitchenOrders } from "../hooks/useKitchenOrders.ts";
import { useToasts } from "../hooks/useToasts.ts";
import { formatCents } from "../lib/money.ts";
import type { KitchenOrder } from "../types.ts";

const ACTION_LABEL: Record<string, string> = {
  pending: "Accept",
  accepted: "Start cooking",
  cooking: "Mark ready",
};

export function KitchenDashboardPage() {
  const { state, refetch } = useKitchenOrders();
  const { toasts, pushToast, dismiss } = useToasts();
  const [actingOn, setActingOn] = useState<string | null>(null);

  // `null` until the first real poll lands — that distinction matters: on
  // the very first load, every order is "new" to the page, but none of
  // them should toast (they were already there before staff opened the
  // dashboard). Only orders that appear in a LATER poll are genuinely new.
  const seenOrderIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (state.phase !== "loaded") return;

    if (seenOrderIds.current) {
      for (const order of state.orders) {
        if (!seenOrderIds.current.has(order.orderId)) {
          pushToast(`🆕 New order: #${order.orderId.slice(0, 8)}`);
        }
      }
    }
    seenOrderIds.current = new Set(state.orders.map((o) => o.orderId));
  }, [state, pushToast]);

  async function handleAction(order: KitchenOrder): Promise<void> {
    setActingOn(order.orderId);
    try {
      if (order.status === "pending") await acceptOrder(order.orderId);
      else if (order.status === "accepted") await startCooking(order.orderId);
      else if (order.status === "cooking") await markReady(order.orderId);
      refetch();
    } catch {
      pushToast(`⚠️ Failed to update order #${order.orderId.slice(0, 8)}`);
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="kitchen-dashboard">
      <ToastList toasts={toasts} onDismiss={dismiss} />
      <h1>🍳 Kitchen Dashboard</h1>

      {state.phase === "loading" && <p>Loading orders…</p>}
      {state.phase === "error" && <p className="order-status__error">Something went wrong: {state.message}</p>}
      {state.phase === "loaded" && state.orders.length === 0 && <p>No active orders.</p>}

      {state.phase === "loaded" && (
        <ul className="kitchen-orders">
          {state.orders.map((order) => {
            const label = ACTION_LABEL[order.status];
            return (
              <li key={order.orderId} className="kitchen-order-card">
                <div className="kitchen-order-card__top">
                  <span className="kitchen-order-card__id">#{order.orderId.slice(0, 8)}</span>
                  <span className="kitchen-order-card__status">{order.status}</span>
                </div>
                <ul>
                  {order.items.map((item) => (
                    <li key={item.menuItemId}>
                      {item.quantity} × {item.name}
                    </li>
                  ))}
                </ul>
                <p>Total: ${formatCents(order.totalCents)}</p>
                {label ? (
                  <button type="button" onClick={() => handleAction(order)} disabled={actingOn === order.orderId}>
                    {actingOn === order.orderId ? "Working…" : label}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
