import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ActiveOrderBanner } from "./components/ActiveOrderBanner.tsx";
import { ToastList } from "./components/ToastList.tsx";
import { OrderTrackingProvider, useOrderTracking } from "./context/OrderTrackingContext.tsx";
import { KitchenDashboardPage } from "./pages/KitchenDashboardPage.tsx";
import { MenuPage } from "./pages/MenuPage.tsx";
import { OrderHistoryPage } from "./pages/OrderHistoryPage.tsx";
import { OrderStatusPage } from "./pages/OrderStatusPage.tsx";

// Global toasts live here, fed by the same OrderTrackingProvider that
// drives ActiveOrderBanner — both need to render on every page, not just
// /orders/:id, so they sit above <Routes> rather than inside any one page.
function GlobalToasts() {
  const { toasts, dismissToast } = useOrderTracking();
  return <ToastList toasts={toasts} onDismiss={dismissToast} />;
}

export function App() {
  return (
    <BrowserRouter>
      <OrderTrackingProvider>
        <GlobalToasts />
        <nav className="app-nav">
          <Link to="/">Menu</Link>
          <Link to="/history">Order history</Link>
          <Link to="/kitchen">Kitchen</Link>
        </nav>
        <ActiveOrderBanner />
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/orders/:orderId" element={<OrderStatusPage />} />
          <Route path="/history" element={<OrderHistoryPage />} />
          <Route path="/kitchen" element={<KitchenDashboardPage />} />
        </Routes>
      </OrderTrackingProvider>
    </BrowserRouter>
  );
}
