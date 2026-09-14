import { describe, expect, it } from "vitest";
import {
  IDENTITY_OVERLAY_VIEWPORT,
  isPanGesture,
  overlayScenePoint,
  overlayScreenPoint,
  overlayViewportFromVpt,
  overlayViewportToVpt,
} from "../overlay-viewport";

describe("overlayViewportFromVpt", () => {
  it("returns identity for missing or short transforms", () => {
    expect(overlayViewportFromVpt(null)).toEqual(IDENTITY_OVERLAY_VIEWPORT);
    expect(overlayViewportFromVpt([1, 0, 0])).toEqual(IDENTITY_OVERLAY_VIEWPORT);
  });

  it("reads zoom and pan from a Fabric viewportTransform", () => {
    expect(overlayViewportFromVpt([2, 0, 0, 2, 40, -15])).toEqual({
      zoom: 2,
      panX: 40,
      panY: -15,
    });
  });

  it("rejects a non-positive scale instead of inverting the overlay", () => {
    expect(overlayViewportFromVpt([0, 0, 0, 0, 10, 10]).zoom).toBe(1);
  });

  it("round-trips through overlayViewportToVpt", () => {
    const v = overlayViewportFromVpt([1.2, 0, 0, 1.2, 1800, 400]);
    expect(overlayViewportToVpt(v)).toEqual([1.2, 0, 0, 1.2, 1800, 400]);
  });
});

describe("isPanGesture", () => {
  it("is true for the Pan tool even when alt is up (must use live toolModeRef)", () => {
    expect(isPanGesture("pan", false)).toBe(true);
    expect(isPanGesture("select", false)).toBe(false);
    expect(isPanGesture("select", true)).toBe(true);
  });
});

describe("overlay scene ↔ screen", () => {
  const vpt = { zoom: 2, panX: 40, panY: -10 };

  it("places a scene point where Fabric would draw it after pan/zoom", () => {
    expect(overlayScreenPoint(100, 50, vpt)).toEqual({ left: 240, top: 90 });
  });

  it("inverts a click back to the same scene point (round-trip)", () => {
    const screen = overlayScreenPoint(100, 50, vpt);
    const scene = overlayScenePoint(
      screen.left + 12,
      screen.top + 8,
      { left: 12, top: 8 },
      vpt,
    );
    expect(scene.x).toBeCloseTo(100);
    expect(scene.y).toBeCloseTo(50);
  });

  it("identity viewport leaves pixels unchanged", () => {
    expect(overlayScreenPoint(80, 60, IDENTITY_OVERLAY_VIEWPORT)).toEqual({
      left: 80,
      top: 60,
    });
    expect(
      overlayScenePoint(80, 60, { left: 0, top: 0 }, IDENTITY_OVERLAY_VIEWPORT),
    ).toEqual({ x: 80, y: 60 });
  });
});
