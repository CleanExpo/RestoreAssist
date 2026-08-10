import { describe, expect, it } from "vitest";
import {
  openingsToCutIntervals,
  solidBandsForHost,
  shouldRematerializeHostStroke,
} from "../wall-band-rematerialize";

const WALL = { a: { x: 0, y: 100 }, b: { x: 500, y: 100 } };
const PX = 100;

describe("openingsToCutIntervals", () => {
  it("maps hostWallT + widthM into parametric cut intervals", () => {
    const cuts = openingsToCutIntervals(
      WALL,
      [{ hostWallT: 0.5, widthM: 1 }],
      PX,
    );
    expect(cuts).toHaveLength(1);
    expect(cuts[0].t0).toBeCloseTo(0.4);
    expect(cuts[0].t1).toBeCloseTo(0.6);
  });
});

describe("solidBandsForHost", () => {
  it("returns the full wall when there are no openings", () => {
    const bands = solidBandsForHost(WALL, [], PX);
    expect(bands).toEqual([WALL]);
  });

  it("splits the wall into solid stubs around an opening gap", () => {
    const bands = solidBandsForHost(
      WALL,
      [{ hostWallT: 0.5, widthM: 1 }],
      PX,
    );
    expect(bands).toHaveLength(2);
    expect(bands[0].a).toEqual({ x: 0, y: 100 });
    expect(bands[0].b.x).toBeCloseTo(200);
    expect(bands[1].a.x).toBeCloseTo(300);
    expect(bands[1].b).toEqual({ x: 500, y: 100 });
  });
});

describe("shouldRematerializeHostStroke", () => {
  it("is true when the host has at least one opening", () => {
    expect(shouldRematerializeHostStroke(1)).toBe(true);
    expect(shouldRematerializeHostStroke(0)).toBe(false);
  });
});
