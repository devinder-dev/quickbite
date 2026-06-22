import { formatCents } from "../lib/money.ts";
import type { PollState } from "../hooks/useOrderPolling.ts";
import { OrderStages } from "./OrderStages.tsx";

export function OrderStatus({ state }: { state: PollState }) {
  if (state.phase === "loading") return <p>Loading order…</p>;
  if (state.phase === "error") return <p className="order-status__error">Something went wrong: {state.message}</p>;

  if (state.phase === "timed-out") {
    return (
      <div>
        <p className="order-status__timeout">
          Still processing — this is taking longer than expected. Check back in a bit.
        </p>
        {state.order ? <OrderStages status={state.order.status} /> : null}
      </div>
    );
  }

  const { order } = state;
  return (
    <div>
      <OrderStages status={order.status} />
      {order.status === "ready" ? (
        <p className="order-status__ready-banner">
          ✅ Ready! This update arrived automatically — the kitchen service published an event over RabbitMQ, no
          page refresh needed.
        </p>
      ) : (
        <p className="order-status__live-note">🔄 Checking for updates every 1.5s — this page will update itself.</p>
      )}
      <p className="order-status__id">Order #{order.orderId.slice(0, 8)}</p>
      <p>Total: ${formatCents(order.totalCents)}</p>
      <ul>
        {order.items.map((item) => (
          <li key={item.menuItemId}>
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
