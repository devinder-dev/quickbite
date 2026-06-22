import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { KitchenDashboardPage } from "./pages/KitchenDashboardPage.tsx";
import { MenuPage } from "./pages/MenuPage.tsx";
import { OrderHistoryPage } from "./pages/OrderHistoryPage.tsx";
import { OrderStatusPage } from "./pages/OrderStatusPage.tsx";

export function App() {
  return (
    <BrowserRouter>
      <nav className="app-nav">
        <Link to="/">Menu</Link>
        <Link to="/history">Order history</Link>
        <Link to="/kitchen">Kitchen</Link>
      </nav>
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="/orders/:orderId" element={<OrderStatusPage />} />
        <Route path="/history" element={<OrderHistoryPage />} />
        <Route path="/kitchen" element={<KitchenDashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
