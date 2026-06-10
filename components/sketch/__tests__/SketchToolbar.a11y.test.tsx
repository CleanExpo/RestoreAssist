// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SketchToolbar } from "../SketchToolbar";

// h-11/w-11 compile to 2.75rem = 44px (verified against tailwind theme).
const TOUCH = /(?:^|\s)(?:w-11)(?:\s|$)/;
const TOUCH_H = /(?:^|\s)(?:h-11)(?:\s|$)/;

function renderToolbar() {
  return render(
    <SketchToolbar toolMode="select" onToolChange={vi.fn()} canUndo canRedo />,
  );
}

const ICON_BUTTONS = [
  "Select",
  "Room",
  "Wall/Line",
  "Undo",
  "Redo",
  "Zoom in",
  "Zoom out",
  "Show grid",
  "Export PNG",
  "Clear canvas",
];

describe("SketchToolbar — a11y / tablet touch", () => {
  it("gives every icon-only toolbar button an explicit aria-label", () => {
    renderToolbar();
    for (const name of ICON_BUTTONS) {
      const btn = screen.getByRole("button", {
        name: new RegExp(`^${name}`, "i"),
      });
      expect(btn).toHaveAttribute("aria-label");
    }
  });

  it("sizes every toolbar button to a ≥44px touch target", () => {
    renderToolbar();
    for (const name of ICON_BUTTONS) {
      const btn = screen.getByRole("button", {
        name: new RegExp(`^${name}`, "i"),
      });
      expect(btn.className).toMatch(TOUCH);
      expect(btn.className).toMatch(TOUCH_H);
    }
  });
});
