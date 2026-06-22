import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, getMenu, placeOrder } from "../api.ts";
import { Cart } from "../components/Cart.tsx";
import { MenuList } from "../components/MenuList.tsx";
import { useOrderTracking } from "../context/OrderTrackingContext.tsx";
import { getOrCreateCustomerId } from "../lib/customerId.ts";
import { addOrderToHistory } from "../lib/orderHistory.ts";
import type { CartLine, MenuItem } from "../types.ts";

export function MenuPage() {
  const navigate = useNavigate();
  const { setActiveOrderId } = useOrderTracking();
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getMenu()
      .then((menu) => {
        if (!cancelled) setItems(menu);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the menu. Is the backend running?");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleChangeQuantity(menuItemId: string, quantity: number) {
    setQuantities((prev) => {
      const next = { ...prev, [menuItemId]: quantity };
      if (quantity === 0) delete next[menuItemId];
      return next;
    });
  }

  const lines: CartLine[] = (items ?? [])
    .filter((item) => (quantities[item.id] ?? 0) > 0)
    .map((item) => ({
      menuItemId: item.id,
      name: item.name,
      priceCents: item.price_cents,
      quantity: quantities[item.id] ?? 0,
    }));

  async function handlePlaceOrder() {
    setPlaceError(undefined);
    setPlacing(true);
    try {
      const customerId = getOrCreateCustomerId();
      const summary = await placeOrder(customerId, lines);
      // Snapshot of what was actually submitted — the same `lines` just sent
      // to POST /api/orders — so the history page can show real item names
      // and a total instead of a bare UUID, with no extra fetch needed.
      addOrderToHistory({
        orderId: summary.orderId,
        placedAt: new Date().toISOString(),
        items: lines,
        totalCents: summary.totalCents,
      });
      setQuantities({});
      // Makes the order trackable from EVERY page, not just the detail
      // view we're about to navigate to — that's the actual fix for
      // toasts/progress only showing up while pinned to /orders/:id.
      setActiveOrderId(summary.orderId);
      navigate(`/orders/${summary.orderId}`);
    } catch (err) {
      setPlaceError(err instanceof ApiError ? err.message : "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  }

  if (loadError) return <p className="menu-page__error">{loadError}</p>;
  if (!items) return <p>Loading menu…</p>;

  return (
    <div className="menu-page">
      <h1>🫒 QuickBite Taverna</h1>
      <p className="menu-page__tagline">A taste of Greece, delivered fast.</p>
      <MenuList items={items} quantities={quantities} onChangeQuantity={handleChangeQuantity} />
      <Cart lines={lines} placing={placing} error={placeError} onPlaceOrder={handlePlaceOrder} />
    </div>
  );
}
