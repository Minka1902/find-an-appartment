// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModePicker, NumberField, Toggle } from "./fields";
import type { TravelMode } from "@/lib/scoring/types";

afterEach(cleanup);

describe("ModePicker", () => {
  it("exposes real checkboxes", () => {
    // Previously these were buttons wearing role="checkbox", which claimed the
    // semantics without any of the behaviour.
    render(<ModePicker label="How they travel" value={["transit"]} onChange={() => {}} />);

    const transit = screen.getByRole("checkbox", { name: "Transit" });
    expect(transit).toBeInstanceOf(HTMLInputElement);
    expect((transit as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "Drive" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("adds a mode when one is ticked", () => {
    const onChange = vi.fn();
    render(<ModePicker label="Travel" value={["transit"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Drive" }));
    expect(onChange).toHaveBeenCalledWith(["transit", "drive"]);
  });

  it("removes a mode when one is unticked", () => {
    const onChange = vi.fn();
    render(
      <ModePicker
        label="Travel"
        value={["transit", "drive"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Transit" }));
    expect(onChange).toHaveBeenCalledWith(["drive"]);
  });

  it("refuses to empty the selection", () => {
    // With no modes there is no way to route to this person at all, so every
    // zone would silently read as unreachable.
    const onChange = vi.fn();
    const value: TravelMode[] = ["transit"];
    render(<ModePicker label="Travel" value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Transit" }));
    expect(onChange).toHaveBeenCalledWith(value);
  });
});

describe("NumberField", () => {
  it("clamps above the maximum", () => {
    const onChange = vi.fn();
    render(
      <NumberField label="Days" value={5} min={0} max={7} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("clamps below the minimum", () => {
    const onChange = vi.fn();
    render(
      <NumberField label="Days" value={5} min={0} max={7} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "-3" } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("lets the field be cleared without committing a value", () => {
    // A number input reports "" for a cleared field, and Number("") is 0 —
    // which is finite. Committing it snapped the value to the minimum the
    // instant you deleted the last digit, so the field could not be retyped.
    const onChange = vi.fn();
    render(
      <NumberField label="Days" value={5} min={0} max={7} onChange={onChange} />,
    );

    const input = screen.getByLabelText("Days");
    fireEvent.change(input, { target: { value: "" } });

    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("commits the value typed after clearing", () => {
    const onChange = vi.fn();
    render(
      <NumberField label="Days" value={5} min={0} max={7} onChange={onChange} />,
    );

    const input = screen.getByLabelText("Days");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "6" } });

    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it("shows the clamped value once editing ends", () => {
    render(
      <NumberField label="Days" value={7} min={0} max={7} onChange={() => {}} />,
    );

    const input = screen.getByLabelText("Days");
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.blur(input);

    expect((input as HTMLInputElement).value).toBe("7");
  });
});

describe("Toggle", () => {
  it("reports the new state", () => {
    const onChange = vi.fn();
    render(
      <Toggle label="Must have parking" checked={false} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Must have parking/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is genuinely disabled, not just styled as such", () => {
    // Asserted on the attribute rather than by clicking: a synthetic click
    // dispatched at a disabled input still bubbles in jsdom, so a click test
    // here would fail while a real user is correctly blocked by the platform.
    render(
      <Toggle
        label="Must have parking"
        checked={false}
        disabled
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: /Must have parking/ }),
    ).toBeDisabled();
  });
});
