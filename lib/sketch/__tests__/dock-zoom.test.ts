import { describe, expect, it } from "vitest";
import { applyDockZoom, resetDockZoom } from "../dock-zoom";
import { overlayScreenPoint } from "../overlay-viewport";

function fakeFabric(initialZoom = 1, panX = 40, panY = -8) {
  return {
    zoom: initialZoom,
    viewportTransform: [initialZoom, 0, 0, initialZoom, panX, panY] as number[],
    getZoom() {
      return this.zoom;
    },
    setZoom(z: number) {
      this.zoom = z;
      this.viewportTransform = [z, 0, 0, z, panX, panY];
    },
  };
}

describe("applyDockZoom — overlay must track toolbar setZoom (RA-7547)", () => {
  it("reads viewportTransform after setZoom and moves pin screen coords", () => {
    const fc = fakeFabric(1, 40, -8);
    const before = overlayScreenPoint(
      100,
      50,
      { zoom: 1, panX: 40, panY: -8 },
    );

    const vpt = applyDockZoom(fc, 1.2);

    expect(vpt.zoom).toBeCloseTo(1.2);
    expect(vpt.panX).toBe(40);
    expect(vpt.panY).toBe(-8);
    const after = overlayScreenPoint(100, 50, vpt);
    expect(after.left).toBeCloseTo(100 * 1.2 + 40);
    expect(after.top).toBeCloseTo(50 * 1.2 - 8);
    expect(after.left).not.toBeCloseTo(before.left);
    expect(after.top).not.toBeCloseTo(before.top);
  });

  it("does not invent zoom from the factor — it trusts the Fabric transform", () => {
    const fc = {
      getZoom: () => 1,
      setZoom(_z: number) {
        // A broken setZoom that writes a different scale than requested.
        this.viewportTransform = [2, 0, 0, 2, 5, 6];
      },
      viewportTransform: [1, 0, 0, 1, 5, 6] as number[],
    };
    const vpt = applyDockZoom(fc, 1.2);
    expect(vpt).toEqual({ zoom: 2, panX: 5, panY: 6 });
  });

  it("clamps to the same 0.3–4 band as the canvas wheel zoom", () => {
    const fc = fakeFabric(3.8);
    expect(applyDockZoom(fc, 1.2).zoom).toBe(4);
    expect(applyDockZoom(fakeFabric(0.32), 0.8).zoom).toBe(0.3);
  });
});

describe("resetDockZoom", () => {
  it("writes identity zoom and keeps Fabric pan in the overlay vpt", () => {
    const fc = fakeFabric(2, 12, 9);
    const vpt = resetDockZoom(fc);
    expect(vpt).toEqual({ zoom: 1, panX: 12, panY: 9 });
    expect(overlayScreenPoint(80, 20, vpt)).toEqual({ left: 92, top: 29 });
  });
});
