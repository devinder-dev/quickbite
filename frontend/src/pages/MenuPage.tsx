import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, getMenu, placeOrder } from "../api.ts";
import { Cart } from "../components/Cart.tsx";
import { MenuList } from "../components/MenuList.tsx";
import { getOrCreateCustomerId } from "../lib/customerId.ts";
import { addOrderToHistory } from "../lib/orderHistory.ts";
import type { CartLine, MenuItem } from "../types.ts";

export function MenuPage() {
  const navigate = useNavigate();
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
      addOrderToHistory({ orderId: summary.orderId, placedAt: new Date().toISOString() });
      setQuantities({});
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
      <h1>QuickBite</h1>
      <MenuList items={items} quantities={quantities} onChangeQuantity={handleChangeQuantity} />
      <Cart lines={lines} placing={placing} error={placeError} onPlaceOrder={handlePlaceOrder} />
    </div>
  );
}
