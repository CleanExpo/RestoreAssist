// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SketchSelectionPanel } from "../SketchSelectionPanel";

const room = (over: Record<string, unknown> = {}) => ({
  id: "el1",
  type: "room",
  ...over,
});

// WCAG 2.5.5 — interactive targets ≥ 44×44px (h-11/w-11/min-h-11 utilities).
const TOUCH = /(?:^|\s)(?:w-11|min-w-11|min-w-\[44px\])/;
const TOUCH_H = /(?:^|\s)(?:h-11|min-h-11|min-h-\[44px\])/;

describe("SketchSelectionPanel — a11y / tablet touch", () => {
  it("gives every colour swatch an aria-label (icon-only buttons)", () => {
    render(<SketchSelectionPanel selected={room()} />);
    const swatches = screen.getAllByRole("button", { name: /colour/i });
    expect(swatches.length).toBeGreaterThanOrEqual(6);
  });

  it("sizes colour swatches to a ≥44px touch target", () => {
    render(<SketchSelectionPanel selected={room()} />);
    for (const sw of screen.getAllByRole("button", { name: /colour/i })) {
      expect(sw.className).toMatch(TOUCH);
      expect(sw.className).toMatch(TOUCH_H);
    }
  });

  it("sizes the deselect button to a ≥44px touch target", () => {
    render(<SketchSelectionPanel selected={room()} onDeselect={() => {}} />);
    const btn = screen.getByRole("button", { name: "Deselect" });
    expect(btn.className).toMatch(TOUCH);
    expect(btn.className).toMatch(TOUCH_H);
  });

  it("sizes the AU/NZ jurisdiction chips to a ≥44px touch target", () => {
    render(<SketchSelectionPanel selected={room()} />);
    for (const name of ["AU", "NZ"]) {
      const chip = screen.getByRole("button", { name });
      expect(chip.className).toMatch(TOUCH);
      expect(chip.className).toMatch(TOUCH_H);
    }
  });

  it("sizes the Delete button to a ≥44px touch target", () => {
    render(<SketchSelectionPanel selected={room()} onDelete={() => {}} />);
    const btn = screen.getByRole("button", { name: /delete/i });
    expect(btn.className).toMatch(TOUCH_H);
  });
});
