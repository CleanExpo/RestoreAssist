import { describe, expect, it } from "vitest";
import {
  canvasNorthArrowGeometry,
  layoutCanvasPlanChrome,
} from "../canvas-plan-chrome";

describe("canvas-plan-chrome", () => {
  it("points the north arrow toward decreasing y (screen up)", () => {
    const g = canvasNorthArrowGeometry({ x: 100, y: 100 }, 20);
    expect(g.tip.y).toBeLessThan(g.stemEnd.y);
    expect(g.label.text).toBe("N");
  });

  it("lays out north + scale inside the scene rect", () => {
    const layout = layoutCanvasPlanChrome({
      sceneLeft: 0,
      sceneTop: 0,
      sceneWidth: 800,
      sceneHeight: 600,
      pxPerMetre: 100,
    });
    expect(layout.north.tip.x).toBeGreaterThan(600);
    expect(layout.scale).not.toBeNull();
    expect(layout.scale!.barLengthPx).toBeGreaterThan(0);
    expect(layout.scale!.label).toMatch(/m$/);
  });
});
