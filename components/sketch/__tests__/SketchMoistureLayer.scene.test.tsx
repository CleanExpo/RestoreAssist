// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SketchMoistureLayer, type MoisturePin } from "../SketchMoistureLayer";

const pin: MoisturePin = {
  id: "mp1",
  x: 300,
  y: 250,
  // Saved on a panel 1000 wide; this render is on one 1600 wide.
  nx: 0.3,
  ny: 0.25,
  wme: 28,
  material: "plasterboard",
  iicrClass: 3,
};

describe("SketchMoistureLayer — scene position", () => {
  it("draws a pin at its scene position whatever the panel size", () => {
    render(
      <SketchMoistureLayer
        pins={[pin]}
        onChange={() => {}}
        active={false}
        width={1600}
        height={1000}
      />,
    );
    const marker = screen.getByRole("button", { name: /WME/i }).parentElement;
    expect(marker).toHaveStyle({ left: "300px", top: "250px" });
  });
});
