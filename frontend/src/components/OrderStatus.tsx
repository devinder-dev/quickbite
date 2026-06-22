import { formatCents } from "../lib/money.ts";
import type { PollState } from "../hooks/useOrderPolling.ts";

const STAGES = ["placed", "accepted", "ready"] as const;

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
      <p>Order #{order.orderId}</p>
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

function OrderStages({ status }: { status: string }) {
  const currentIndex = STAGES.indexOf(status as (typeof STAGES)[number]);

  return (
    <ol className="order-stages">
      {STAGES.map((stage, index) => (
        <li key={stage} aria-current={index === currentIndex} data-done={index <= currentIndex}>
          {stage}
        </li>
      ))}
    </ol>
  );
}
