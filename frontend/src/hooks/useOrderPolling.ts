import { useEffect, useState } from "react";
import { getOrder, OrderNotFoundError } from "../api.ts";
import type { OrderDetail } from "../types.ts";

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 60_000;

export type PollState =
  | { phase: "loading" }
  | { phase: "polling"; order: OrderDetail }
  | { phase: "ready"; order: OrderDetail }
  | { phase: "timed-out"; order: OrderDetail | null }
  | { phase: "error"; message: string };

// Polls GET /api/orders/:id until status reaches "ready" or TIMEOUT_MS
// elapses. Every safeguard below addresses a specific, real bug class —
// not defensive-for-its-own-sake:
//
// - setTimeout-chain, not setInterval: the next poll is only scheduled
//   after the current one resolves, so a slow response (e.g. a cold
//   container) can never cause overlapping in-flight requests.
// - everything the closure needs lives inside this effect, keyed on
//   [orderId] — re-mounting with a different id (e.g. from order history)
//   can never keep polling the old one.
// - an AbortController is aborted on cleanup, and a `cancelled` flag is
//   checked before every setState — a fetch that resolves after unmount
//   never touches state on a dead component.
// - a 404 (OrderNotFoundError) is treated as "not found YET", not fatal,
//   within the bounded window — the outbox pattern means the order row can
//   briefly lag right after POST /api/orders returns 201.
// - hitting the timeout without reaching "ready" surfaces an explicit
//   "timed-out" phase — never a silently-spinning UI forever.
export function useOrderPolling(orderId: string): PollState {
  const [state, setState] = useState<PollState>({ phase: "loading" });

  useEffect(() => {
    if (!orderId) return; // defensive only — react-router guarantees this route param is present

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const deadline = Date.now() + TIMEOUT_MS;
    let lastOrder: OrderDetail | null = null;

    async function poll(): Promise<void> {
      try {
        const order = await getOrder(orderId, controller.signal);
        if (cancelled) return;
        lastOrder = order;

        if (order.status === "ready") {
          setState({ phase: "ready", order });
          return;
        }

        setState({ phase: "polling", order });
      } catch (err) {
        if (cancelled) return;

        if (!(err instanceof OrderNotFoundError)) {
          setState({ phase: "error", message: err instanceof Error ? err.message : "unknown error" });
          return;
        }
      }

      if (cancelled) return;

      if (Date.now() >= deadline) {
        setState({ phase: "timed-out", order: lastOrder });
        return;
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  return state;
}
