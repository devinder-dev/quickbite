import { describe, expect, test } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { MenuList } from "../../src/components/MenuList.tsx";

const ITEMS = [
  { id: "1", name: "Margherita", price_cents: 1200 },
  { id: "2", name: "Pepperoni", price_cents: 1400 },
];

describe("MenuList", () => {
  test("renders every item with its formatted price", () => {
    render(<MenuList items={ITEMS} quantities={{}} onChangeQuantity={() => {}} />);
    expect(screen.getByText("Margherita")).toBeDefined();
    expect(screen.getByText("$12.00")).toBeDefined();
    expect(screen.getByText("Pepperoni")).toBeDefined();
    expect(screen.getByText("$14.00")).toBeDefined();
  });

  test("the decrease button is disabled at zero quantity", () => {
    render(<MenuList items={ITEMS} quantities={{}} onChangeQuantity={() => {}} />);
    const decreaseButtons = screen.getAllByLabelText(/Decrease/);
    expect((decreaseButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  test("clicking increase calls onChangeQuantity with quantity + 1", () => {
    let lastCall: [string, number] | null = null;
    render(
      <MenuList items={ITEMS} quantities={{ "1": 2 }} onChangeQuantity={(id, qty) => (lastCall = [id, qty])} />,
    );
    fireEvent.click(screen.getByLabelText("Increase Margherita quantity"));
    expect(lastCall).toEqual(["1", 3]);
  });
});
