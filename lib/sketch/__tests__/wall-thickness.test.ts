import { describe, expect, it } from "vitest";
import {
  WALL_THICKNESS_INTERNAL_M,
  clampWallThicknessM,
  readWallThicknessM,
  wallThicknessPx,
} from "../wall-thickness";

describe("wall-thickness", () => {
  it("clamps to the editable range", () => {
    expect(clampWallThicknessM(0.01)).toBe(0.05);
    expect(clampWallThicknessM(2)).toBe(0.5);
    expect(clampWallThicknessM(0.15)).toBe(0.15);
  });

  it("defaults stroke px to ~0.11 m × scale", () => {
    expect(wallThicknessPx(undefined, 100)).toBeCloseTo(11);
    expect(wallThicknessPx(0.2, 100)).toBeCloseTo(20);
  });

  it("reads stored thickness from fabric data", () => {
    expect(readWallThicknessM({ wallThicknessM: 0.23 })).toBe(0.23);
    expect(readWallThicknessM({})).toBe(WALL_THICKNESS_INTERNAL_M);
  });
});
