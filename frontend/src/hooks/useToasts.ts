import { useCallback, useEffect, useRef, useState } from "react";

export type Toast = { id: string; message: string };

const AUTO_DISMISS_MS = 5000;

// A small, dependency-free notification queue. `pushToast` appends a
// message; it's removed automatically after AUTO_DISMISS_MS, or earlier via
// `dismiss`. Pending timers are tracked and cleared on unmount — the same
// "no setState after unmount" discipline as useOrderPolling, just for a
// list instead of a single value.
export function useToasts(): { toasts: Toast[]; pushToast: (message: string) => void; dismiss: (id: string) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (message: string) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  return { toasts, pushToast, dismiss };
}
