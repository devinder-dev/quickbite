import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { OrderStatus } from "../../src/components/OrderStatus.tsx";
import type { PollState } from "../../src/hooks/useOrderPolling.ts";

const ORDER = {
  orderId: "abc-123",
  customerId: "cust-1",
  totalCents: 1200,
  items: [{ menuItemId: "1", name: "Margherita", priceCents: 1200, quantity: 1 }],
};

describe("OrderStatus", () => {
  test("shows a loading message while loading", () => {
    render(<OrderStatus state={{ phase: "loading" }} />);
    expect(screen.getByText("Loading order…")).toBeDefined();
  });

  test("marks the current stage when polling", () => {
    const state: PollState = { phase: "polling", order: { ...ORDER, status: "accepted" } };
    render(<OrderStatus state={state} />);
    const accepted = screen.getByText("accepted");
    expect(accepted.getAttribute("aria-current")).toBe("true");
  });

  test("shows the ready stage and order details once ready", () => {
    const state: PollState = { phase: "ready", order: { ...ORDER, status: "ready" } };
    render(<OrderStatus state={state} />);
    expect(screen.getByText("Order #abc-123")).toBeDefined();
    expect(screen.getByText("ready").getAttribute("aria-current")).toBe("true");
  });

  test("shows an explicit message on timeout, never a silent spinner", () => {
    const state: PollState = { phase: "timed-out", order: { ...ORDER, status: "accepted" } };
    render(<OrderStatus state={state} />);
    expect(screen.getByText(/Still processing/)).toBeDefined();
  });

  test("shows the error message on failure", () => {
    render(<OrderStatus state={{ phase: "error", message: "network down" }} />);
    expect(screen.getByText(/network down/)).toBeDefined();
  });
});
