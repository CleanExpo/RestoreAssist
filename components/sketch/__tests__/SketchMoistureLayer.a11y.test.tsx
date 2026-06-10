// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SketchMoistureLayer, type MoisturePin } from "../SketchMoistureLayer";

const pin: MoisturePin = {
  id: "mp1",
  x: 40,
  y: 60,
  wme: 28,
  material: "plasterboard",
  iicrClass: 3,
};

const TOUCH = /(?:^|\s)(?:w-11|min-w-11|min-w-\[44px\])/;
const TOUCH_H = /(?:^|\s)(?:h-11|min-h-11|min-h-\[44px\])/;

function renderLayer() {
  return render(
    <SketchMoistureLayer
      pins={[pin]}
      onChange={() => {}}
      active={false}
      width={400}
      height={300}
    />,
  );
}

describe("SketchMoistureLayer — a11y / tablet touch", () => {
  it("labels the pin marker with its reading (icon+number button)", () => {
    renderLayer();
    const marker = screen.getByRole("button", { name: /WME/i });
    expect(marker.className).toMatch(TOUCH);
    expect(marker.className).toMatch(TOUCH_H);
  });

  it("labels the popup close button and sizes it for touch", () => {
    renderLayer();
    fireEvent.click(screen.getByRole("button", { name: /WME/i }));
    const close = screen.getByRole("button", { name: /close/i });
    expect(close.className).toMatch(TOUCH);
    expect(close.className).toMatch(TOUCH_H);
  });

  it("sizes the Remove pin button for touch", () => {
    renderLayer();
    fireEvent.click(screen.getByRole("button", { name: /WME/i }));
    const remove = screen.getByRole("button", { name: /remove pin/i });
    expect(remove.className).toMatch(TOUCH_H);
  });
});
