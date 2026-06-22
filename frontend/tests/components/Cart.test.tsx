import { describe, expect, test } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { Cart } from "../../src/components/Cart.tsx";

const LINES = [
  { menuItemId: "1", name: "Margherita", priceCents: 1200, quantity: 2 },
  { menuItemId: "2", name: "Pepperoni", priceCents: 1400, quantity: 1 },
];

describe("Cart", () => {
  test("recalculates the total from quantities", () => {
    render(<Cart lines={LINES} placing={false} onPlaceOrder={() => {}} />);
    expect(screen.getByText("Total: $38.00")).toBeDefined();
  });

  test("the place order button is disabled when the cart is empty", () => {
    render(<Cart lines={[]} placing={false} onPlaceOrder={() => {}} />);
    expect((screen.getByText("Place order") as HTMLButtonElement).disabled).toBe(true);
  });

  test("the place order button is disabled while placing", () => {
    render(<Cart lines={LINES} placing={true} onPlaceOrder={() => {}} />);
    expect((screen.getByText("Placing order…") as HTMLButtonElement).disabled).toBe(true);
  });

  test("clicking place order calls the handler", () => {
    let called = false;
    render(<Cart lines={LINES} placing={false} onPlaceOrder={() => (called = true)} />);
    fireEvent.click(screen.getByText("Place order"));
    expect(called).toBe(true);
  });

  test("renders an error message when given one", () => {
    render(<Cart lines={LINES} placing={false} error="cart contains invalid items" onPlaceOrder={() => {}} />);
    expect(screen.getByText("cart contains invalid items")).toBeDefined();
  });
});
