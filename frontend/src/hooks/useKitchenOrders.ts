import { useEffect, useRef, useState } from "react";
import { getKitchenOrders } from "../api.ts";
import type { KitchenOrder } from "../types.ts";

const POLL_INTERVAL_MS = 2000;

export type KitchenOrdersState =
  | { phase: "loading" }
  | { phase: "loaded"; orders: KitchenOrder[] }
  | { phase: "error"; message: string };

// Same safeguards as useOrderPolling (setTimeout-chain, AbortController +
// cancelled flag, no setState-after-unmount) but for an ongoing list with
// no terminal state — the dashboard polls for as long as it's mounted.
// Exposes `refetch` so a button click can update immediately instead of
// waiting for the next scheduled tick.
export function useKitchenOrders(): { state: KitchenOrdersState; refetch: () => void } {
  const [state, setState] = useState<KitchenOrdersState>({ phase: "loading" });
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function poll(): Promise<void> {
      try {
        const orders = await getKitchenOrders(controller.signal);
        if (cancelled) return;
        setState({ phase: "loaded", orders });
      } catch (err) {
        if (cancelled) return;
        setState({ phase: "error", message: err instanceof Error ? err.message : "unknown error" });
      }

      if (cancelled) return;
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    refetchRef.current = () => {
      if (timer) clearTimeout(timer);
      poll();
    };

    poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { state, refetch: () => refetchRef.current() };
}
