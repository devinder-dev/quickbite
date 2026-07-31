import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../../src/ErrorBoundary.tsx";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  test("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeDefined();
  });

  test("shows a recoverable message instead of a blank page when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong displaying this page.")).toBeDefined();
    expect(screen.getByText("Try again")).toBeDefined();
  });
});
