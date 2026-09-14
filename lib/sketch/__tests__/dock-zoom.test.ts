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
      // Fabric setZoom → zoomToPoint(0,0): scale changes, leftover pan stays
      // (or is mutated). This fake keeps pan — the 2232px failure class.
      this.viewportTransform = [
        z,
        0,
        0,
        z,
        this.viewportTransform[4],
        this.viewportTransform[5],
      ];
    },
    setViewportTransform(vpt: number[]) {
      this.viewportTransform = vpt;
      this.zoom = vpt[0];
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

  it("uses getZoom after setZoom when viewportTransform is missing", () => {
    const fc = {
      z: 1,
      getZoom() {
        return this.z;
      },
      setZoom(z: number) {
        this.z = z;
      },
      viewportTransform: undefined as number[] | undefined,
    };
    expect(applyDockZoom(fc, 1.2)).toEqual({ zoom: 1.2, panX: 0, panY: 0 });
  });
});

describe("resetDockZoom — Fit Canvas must restore the pre-zoom overlay", () => {
  it("writing identity overlay while Fabric still has pan is the 2232px class", () => {
    const baseline = { zoom: 1, panX: 1800, panY: 400 };
    const before = overlayScreenPoint(420, 328, baseline);
    const identity = overlayScreenPoint(420, 328, { zoom: 1, panX: 0, panY: 0 });
    expect(
      Math.hypot(identity.left - before.left, identity.top - before.top),
    ).toBeGreaterThan(12);
  });

  it("restores the snapshotted Fabric vpt and matches live overlay", () => {
    const fc = fakeFabric(1, 1800, 400);
    const baseline = { zoom: 1, panX: 1800, panY: 400 };
    const before = overlayScreenPoint(420, 328, baseline);

    applyDockZoom(fc, 1.2);
    const vpt = resetDockZoom(fc, baseline);

    expect(vpt).toEqual(baseline);
    expect(fc.viewportTransform).toEqual([1, 0, 0, 1, 1800, 400]);
    const after = overlayScreenPoint(420, 328, vpt);
    expect(Math.hypot(after.left - before.left, after.top - before.top)).toBe(
      0,
    );
  });

  it("falls back to identity when no baseline was snapshotted", () => {
    const fc = fakeFabric(2, 12, 9);
    const vpt = resetDockZoom(fc);
    expect(vpt).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });

  it("falls back to setZoom(1) when setViewportTransform is missing", () => {
    const fc = {
      setZoom(z: number) {
        this.viewportTransform = [z, 0, 0, z, 99, -4];
      },
      viewportTransform: [2, 0, 0, 2, 99, -4] as number[],
    };
    expect(resetDockZoom(fc)).toEqual({ zoom: 1, panX: 99, panY: -4 });
  });
});
