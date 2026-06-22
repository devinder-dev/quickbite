import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { OrderStatus } from "../../src/components/OrderStatus.tsx";
import type { PollState } from "../../src/hooks/useOrderPolling.ts";

const ORDER = {
  orderId: "abc-123",
  customerId: "cust-1",
  totalCents: 1200,
  items: [{ menuItemId: "1", name: "Gyros", priceCents: 1200, quantity: 1 }],
};

describe("OrderStatus", () => {
  test("shows a loading message while loading", () => {
    render(<OrderStatus state={{ phase: "loading" }} />);
    expect(screen.getByText("Loading order…")).toBeDefined();
  });

  test("marks the current stage when polling, and explains it's auto-updating", () => {
    const state: PollState = { phase: "polling", order: { ...ORDER, status: "accepted" } };
    render(<OrderStatus state={state} />);
    const accepted = screen.getByText("accepted");
    expect(accepted.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText(/Checking for updates every 1.5s/)).toBeDefined();
  });

  test("marks the cooking stage as a distinct step between accepted and ready", () => {
    const state: PollState = { phase: "polling", order: { ...ORDER, status: "cooking" } };
    render(<OrderStatus state={state} />);
    const cooking = screen.getByText("cooking");
    expect(cooking.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("accepted").getAttribute("data-done")).toBe("true");
    expect(screen.getByText("ready").getAttribute("data-done")).toBe("false");
  });

  test("shows the ready stage, order details, and an explanatory banner once ready", () => {
    const state: PollState = { phase: "ready", order: { ...ORDER, status: "ready" } };
    render(<OrderStatus state={state} />);
    expect(screen.getByText("Order #abc-123")).toBeDefined();
    expect(screen.getByText("ready").getAttribute("aria-current")).toBe("true");
    expect(screen.getByText(/published an event over RabbitMQ/)).toBeDefined();
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
