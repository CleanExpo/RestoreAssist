import { describe, expect, it } from "vitest";
import {
  clampToViewport,
  computePanelAnchor,
  parseStoredPosition,
  DRAG_THRESHOLD_PX,
  EDGE_MARGIN_PX,
} from "../use-draggable-orb";

const PHONE = { width: 390, height: 844 };
const ORB = 64;

describe("clampToViewport", () => {
  it("leaves a position that is already fully on screen alone", () => {
    expect(clampToViewport({ x: 100, y: 200 }, ORB, PHONE)).toEqual({
      x: 100,
      y: 200,
    });
  });

  it.each([
    ["off the left edge", { x: -400, y: 200 }, { x: 8, y: 200 }],
    ["off the top edge", { x: 100, y: -50 }, { x: 100, y: 8 }],
    ["off the right edge", { x: 5000, y: 200 }, { x: 318, y: 200 }],
    ["off the bottom edge", { x: 100, y: 5000 }, { x: 100, y: 772 }],
  ])("pulls a position back when it is %s", (_label, input, expected) => {
    expect(clampToViewport(input, ORB, PHONE)).toEqual(expected);
  });

  // The reason clamping exists. A position saved in portrait can be entirely
  // outside a landscape viewport, which would strand the orb off-screen with
  // no gesture available to bring it back.
  it("rescues a portrait position that landscape would strand", () => {
    const savedInPortrait = { x: 318, y: 772 };
    const landscape = { width: 844, height: 390 };
    const rescued = clampToViewport(savedInPortrait, ORB, landscape);
    expect(rescued.y).toBeLessThanOrEqual(390 - ORB - EDGE_MARGIN_PX);
    expect(rescued).toEqual({ x: 318, y: 318 });
  });

  it("keeps the orb on screen when it is wider than the viewport", () => {
    // maxX would go negative without the Math.max guard, pinning the orb to
    // the wrong edge instead of the margin.
    const tiny = { width: 40, height: 40 };
    expect(clampToViewport({ x: 999, y: 999 }, ORB, tiny)).toEqual({
      x: 8,
      y: 8,
    });
  });
});

describe("parseStoredPosition", () => {
  it("reads a well-formed stored position", () => {
    expect(parseStoredPosition('{"x":12,"y":34}')).toEqual({ x: 12, y: 34 });
  });

  it.each([
    ["null", null],
    ["empty string", ""],
    ["malformed JSON", "{not json"],
    ["a JSON array", "[1,2]"],
    ["a missing axis", '{"x":12}'],
    ["a string axis", '{"x":"12","y":34}'],
    ["NaN", '{"x":null,"y":34}'],
  ])("returns null for %s rather than throwing", (_label, raw) => {
    expect(parseStoredPosition(raw)).toBeNull();
  });

  // Infinity survives JSON.parse as null, but a hand-edited or corrupted
  // value must never reach clampToViewport as a non-finite number.
  it("rejects a non-finite axis", () => {
    expect(parseStoredPosition('{"x":1e999,"y":0}')).toBeNull();
  });
});

describe("computePanelAnchor", () => {
  const panel = { width: 358, height: 590 };

  it("opens above the orb when the orb sits in the lower half", () => {
    const orbLow = { x: 318, y: 772 };
    const anchor = computePanelAnchor(orbLow, ORB, PHONE, panel);
    expect(anchor.y + panel.height).toBeLessThanOrEqual(orbLow.y);
  });

  it("opens below the orb when the orb sits in the upper half", () => {
    const orbHigh = { x: 20, y: 40 };
    const anchor = computePanelAnchor(orbHigh, ORB, PHONE, panel);
    expect(anchor.y).toBeGreaterThanOrEqual(orbHigh.y + ORB);
  });

  it("keeps the panel fully on screen wherever the orb is parked", () => {
    const corners = [
      { x: 8, y: 8 },
      { x: 318, y: 8 },
      { x: 8, y: 772 },
      { x: 318, y: 772 },
    ];
    for (const orb of corners) {
      const a = computePanelAnchor(orb, ORB, PHONE, panel);
      expect(a.x).toBeGreaterThanOrEqual(EDGE_MARGIN_PX);
      expect(a.y).toBeGreaterThanOrEqual(EDGE_MARGIN_PX);
      expect(a.x + panel.width).toBeLessThanOrEqual(PHONE.width);
      expect(a.y + panel.height).toBeLessThanOrEqual(PHONE.height);
    }
  });
});

describe("DRAG_THRESHOLD_PX", () => {
  // A tap that wobbles must stay a tap; a deliberate nudge must become a drag.
  // Both directions matter — too low and Margot never opens, too high and she
  // cannot be moved a short distance.
  it("is large enough for finger slop and small enough for a short nudge", () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThanOrEqual(4);
    expect(DRAG_THRESHOLD_PX).toBeLessThanOrEqual(16);
  });
});
