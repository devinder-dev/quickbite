import { describe, expect, test } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { MenuList } from "../../src/components/MenuList.tsx";

const ITEMS = [
  { id: "1", name: "Gyros", price_cents: 1100 },
  { id: "2", name: "Souvlaki", price_cents: 1300 },
];

describe("MenuList", () => {
  test("renders every item with its formatted price, emoji, and description", () => {
    render(<MenuList items={ITEMS} quantities={{}} onChangeQuantity={() => {}} />);
    expect(screen.getByText("Gyros")).toBeDefined();
    expect(screen.getByText("$11.00")).toBeDefined();
    expect(screen.getByText("Souvlaki")).toBeDefined();
    expect(screen.getByText("$13.00")).toBeDefined();
    expect(screen.getByText("🥙")).toBeDefined();
    expect(screen.getByText(/tzatziki/)).toBeDefined();
  });

  test("falls back to a generic plate emoji for an unknown dish, never breaks", () => {
    render(
      <MenuList
        items={[{ id: "3", name: "Mystery Dish", price_cents: 500 }]}
        quantities={{}}
        onChangeQuantity={() => {}}
      />,
    );
    expect(screen.getByText("Mystery Dish")).toBeDefined();
    expect(screen.getByText("🍽️")).toBeDefined();
  });

  test("the decrease button is disabled at zero quantity", () => {
    render(<MenuList items={ITEMS} quantities={{}} onChangeQuantity={() => {}} />);
    const decreaseButtons = screen.getAllByLabelText(/Decrease/);
    expect((decreaseButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  test("clicking increase calls onChangeQuantity with quantity + 1", () => {
    let lastCall: [string, number] | null = null;
    render(<MenuList items={ITEMS} quantities={{ "1": 2 }} onChangeQuantity={(id, qty) => (lastCall = [id, qty])} />);
    fireEvent.click(screen.getByLabelText("Increase Gyros quantity"));
    expect(lastCall).toEqual(["1", 3]);
  });
});
