import { describe, expect, it } from "vitest";
import {
  fromNormalizedMoistureMapPoint,
  toNormalizedMoistureMapPoint,
} from "../nir-moisture-map-coordinates";

describe("NIR moisture map coordinates", () => {
  it.each([
    { x: 0, y: 0 },
    { x: 400, y: 300 },
    { x: 800, y: 600 },
  ])("round-trips an 800x600 canvas point $x,$y", (point) => {
    const normalized = toNormalizedMoistureMapPoint(point);

    expect(normalized.mapX).toBeGreaterThanOrEqual(0);
    expect(normalized.mapX).toBeLessThanOrEqual(1);
    expect(normalized.mapY).toBeGreaterThanOrEqual(0);
    expect(normalized.mapY).toBeLessThanOrEqual(1);
    expect(fromNormalizedMoistureMapPoint(normalized)).toEqual(point);
  });
});
