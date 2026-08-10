import { describe, expect, it } from "vitest";
import {
  SHORT_DIM_CTA_LABEL,
  hitTestShortDimAffordance,
  shortEdgeMeasureAffordances,
} from "../short-dim-affordance";
import { findNearestDimLabel } from "../dim-label-hit";

describe("shortEdgeMeasureAffordances", () => {
  it("emits CTAs only for edges below the short-dim threshold", () => {
    // 5m × 0.3m stub rectangle (scale 100 → 500×30 px)
    const pts = [
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 30 },
      { x: 0, y: 30 },
    ];
    const ctas = shortEdgeMeasureAffordances(pts, 100);
    expect(ctas.length).toBe(2); // two short sides
    expect(ctas.every((c) => c.metres < 0.45)).toBe(true);
    expect(ctas[0].label).toBe(SHORT_DIM_CTA_LABEL);
  });

  it("hit-tests CTA label positions", () => {
    const idx = hitTestShortDimAffordance(
      { x: 10, y: 10 },
      [{ labelPos: { x: 12, y: 11 } }],
      16,
    );
    expect(idx).toBe(0);
    expect(
      hitTestShortDimAffordance({ x: 100, y: 100 }, [{ labelPos: { x: 12, y: 11 } }]),
    ).toBe(-1);
  });
});

describe("findNearestDimLabel", () => {
  it("returns the nearest dim-label within the hit radius", () => {
    const hit = findNearestDimLabel(
      { x: 50, y: 50 },
      [
        {
          left: 52,
          top: 48,
          data: { type: "dim-label", dimFor: "room-1", metres: 3.2 },
          text: "3.20 m",
        },
        {
          left: 200,
          top: 200,
          data: { type: "dim-label", dimFor: "room-2", metres: 4 },
        },
      ],
      22,
    );
    expect(hit?.data?.dimFor).toBe("room-1");
  });

  it("ignores editors and non-dim objects", () => {
    expect(
      findNearestDimLabel(
        { x: 0, y: 0 },
        [
          {
            left: 0,
            top: 0,
            data: { type: "dim-label", dimFor: "r", editing: true },
          },
        ],
      ),
    ).toBeNull();
  });
});
