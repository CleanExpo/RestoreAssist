import { describe, it, expect } from "vitest";
import { metricsFromSketchRoom, volumeM3 } from "../room-derived-metrics";

describe("room-derived-metrics", () => {
  it("computes volume when area and height present", () => {
    const m = metricsFromSketchRoom({ areaM2: 20, heightM: 2.5 });
    expect(volumeM3(m)).toBe(50);
  });

  it("returns null volume when height missing", () => {
    expect(volumeM3(metricsFromSketchRoom({ areaM2: 10 }))).toBeNull();
  });
});
