/**
 * RA-6841 [A2] — unit tests for the door + window opening geometry helpers.
 *
 * All tests are Fabric-free / DOM-free. The geometry is exercised against
 * horizontal and non-axis-aligned wall segments at the default 100px/m scale.
 */
import { describe, expect, it } from "vitest";
import {
  projectPointOntoSegment,
  snapToNearestWall,
  openingCutEndpoints,
  doorGeometry,
  doorArcPath,
  windowGeometry,
  type WallSegment,
} from "../opening-geometry";
import { decomposeElements } from "../decompose-elements";
import { measuredElements, totalMeasuredFloorAreaM2 } from "../measured-elements";

// ─── Shared fixtures ─────────────────────────────────────────────────────────

/** A horizontal wall from (0,200) to (500,200). */
const HWALL: WallSegment = { a: { x: 0, y: 200 }, b: { x: 500, y: 200 } };

/** A vertical wall from (100,0) to (100,400). */
const VWALL: WallSegment = { a: { x: 100, y: 0 }, b: { x: 100, y: 400 } };

const PX = 100; // default 100px = 1m

// ─── projectPointOntoSegment ─────────────────────────────────────────────────

describe("projectPointOntoSegment", () => {
  it("projects onto the nearest point on a horizontal segment", () => {
    const p = projectPointOntoSegment({ x: 250, y: 250 }, HWALL);
    expect(p).toEqual({ x: 250, y: 200 });
  });

  it("projects onto the nearest point on a vertical segment", () => {
    const p = projectPointOntoSegment({ x: 150, y: 200 }, VWALL);
    expect(p).toEqual({ x: 100, y: 200 });
  });

  it("clamps to the segment start when the projection is before the start", () => {
    const p = projectPointOntoSegment({ x: -50, y: 190 }, HWALL);
    expect(p).toEqual({ x: 0, y: 200 });
  });

  it("clamps to the segment end when the projection is past the end", () => {
    const p = projectPointOntoSegment({ x: 600, y: 190 }, HWALL);
    expect(p).toEqual({ x: 500, y: 200 });
  });

  it("handles a zero-length segment gracefully", () => {
    const dot: WallSegment = { a: { x: 50, y: 50 }, b: { x: 50, y: 50 } };
    const p = projectPointOntoSegment({ x: 100, y: 80 }, dot);
    expect(p).toEqual({ x: 50, y: 50 });
  });
});

// ─── snapToNearestWall ────────────────────────────────────────────────────────

describe("snapToNearestWall", () => {
  it("returns null for an empty wall list", () => {
    expect(snapToNearestWall({ x: 0, y: 0 }, [])).toBeNull();
  });

  it("picks the closer wall and returns the projected anchor", () => {
    const walls = [HWALL, VWALL];
    // Point at (250, 210) — 10px from HWALL, 150px from VWALL
    const result = snapToNearestWall({ x: 250, y: 210 }, walls);
    expect(result).not.toBeNull();
    expect(result!.wallIndex).toBe(0); // HWALL is closer
    expect(result!.anchor).toEqual({ x: 250, y: 200 });
  });

  it("returns wallIndex=1 when the second wall is closer", () => {
    // Point at (110, 100) — 10px from VWALL (x=100), farther from HWALL (y=200)
    const result = snapToNearestWall({ x: 110, y: 100 }, [HWALL, VWALL]);
    expect(result!.wallIndex).toBe(1); // VWALL
    expect(result!.anchor.x).toBeCloseTo(100, 5);
    expect(result!.anchor.y).toBeCloseTo(100, 5);
  });
});

// ─── openingCutEndpoints ──────────────────────────────────────────────────────

describe("openingCutEndpoints", () => {
  it("produces a centred cut of the correct width on a horizontal wall", () => {
    const anchor = { x: 250, y: 200 }; // midpoint of HWALL
    const [s, e] = openingCutEndpoints(anchor, HWALL, 0.82, PX);
    // 0.82m → 82px half = 41px each side of the anchor
    expect(s.x).toBeCloseTo(209, 0); // 250 - 41
    expect(e.x).toBeCloseTo(291, 0); // 250 + 41
    expect(s.y).toBeCloseTo(200, 5);
    expect(e.y).toBeCloseTo(200, 5);
    // Width = e - s ≈ 82px
    expect(e.x - s.x).toBeCloseTo(82, 0);
  });

  it("clamps to the wall ends when the opening is near the start", () => {
    const anchor = { x: 10, y: 200 }; // near start of HWALL
    const [s, e] = openingCutEndpoints(anchor, HWALL, 1, PX); // 1m = 100px
    expect(s.x).toBeGreaterThanOrEqual(0); // never before wall.a
    expect(e.x).toBeLessThanOrEqual(500); // never past wall.b
  });

  it("handles a zero-length wall without throwing", () => {
    const dot: WallSegment = { a: { x: 50, y: 50 }, b: { x: 50, y: 50 } };
    const [s, e] = openingCutEndpoints({ x: 50, y: 50 }, dot, 0.82, PX);
    expect(s).toEqual({ x: 50, y: 50 });
    expect(e).toEqual({ x: 50, y: 50 });
  });

  it("scales correctly with a non-default pxPerMetre (50px/m)", () => {
    const anchor = { x: 250, y: 200 };
    const [s, e] = openingCutEndpoints(anchor, HWALL, 1, 50); // 1m = 50px → half=25
    expect(e.x - s.x).toBeCloseTo(50, 0);
  });
});

// ─── doorGeometry ─────────────────────────────────────────────────────────────

describe("doorGeometry — left hinge", () => {
  const anchor = { x: 250, y: 200 };
  const geom = doorGeometry(anchor, HWALL, 0.82, PX, "left");

  it("cutStart is to the left of cutEnd along the wall", () => {
    expect(geom.cutStart.x).toBeLessThan(geom.cutEnd.x);
  });

  it("hingePoint equals cutStart for a left-hinge door", () => {
    expect(geom.hingePoint).toEqual(geom.cutStart);
  });

  it("freeCorner equals cutEnd for a left-hinge door", () => {
    expect(geom.freeCorner).toEqual(geom.cutEnd);
  });

  it("arc center equals hinge point", () => {
    expect(geom.arcCenter).toEqual(geom.hingePoint);
  });

  it("arc radius equals the door leaf width (82px at 100px/m)", () => {
    expect(geom.arcRadiusPx).toBeCloseTo(82, 0);
  });

  it("arc start equals the free corner", () => {
    expect(geom.arcStart).toEqual(geom.freeCorner);
  });

  it("arc end is perpendicular to the wall from the hinge (CCW)", () => {
    // For HWALL (pointing right, ux=1, uy=0), CCW perp is (-uy, ux) = (0, 1)
    // i.e. downward in screen coords. arcEnd ≈ hingePoint + radius * (0, +1).
    expect(geom.arcEnd.x).toBeCloseTo(geom.hingePoint.x, 1);
    expect(geom.arcEnd.y).toBeCloseTo(geom.hingePoint.y + geom.arcRadiusPx, 1);
  });

  it("arc sweep is 1 (clockwise) for left hinge", () => {
    expect(geom.arcSweep).toBe(1);
  });
});

describe("doorGeometry — right hinge", () => {
  const anchor = { x: 250, y: 200 };
  const geom = doorGeometry(anchor, HWALL, 0.82, PX, "right");

  it("hingePoint equals cutEnd for a right-hinge door", () => {
    expect(geom.hingePoint).toEqual(geom.cutEnd);
  });

  it("freeCorner equals cutStart for a right-hinge door", () => {
    expect(geom.freeCorner).toEqual(geom.cutStart);
  });

  it("arc sweep is 0 (counter-clockwise) for right hinge", () => {
    expect(geom.arcSweep).toBe(0);
  });
});

// ─── doorArcPath ──────────────────────────────────────────────────────────────

describe("doorArcPath", () => {
  it("produces a valid SVG arc path string", () => {
    const geom = doorGeometry({ x: 250, y: 200 }, HWALL, 0.82, PX, "left");
    const path = doorArcPath(geom);
    // Must start with M and contain A (arc command)
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ A /);
    // Must contain the sweep flag (0 or 1) in the right position
    expect(path).toContain(` 0 ${geom.arcSweep} `);
  });

  it("arc path for right-hinge contains sweep=0", () => {
    const geom = doorGeometry({ x: 250, y: 200 }, HWALL, 0.82, PX, "right");
    const path = doorArcPath(geom);
    expect(path).toContain(" 0 0 ");
  });

  it("arc path for left-hinge contains sweep=1", () => {
    const geom = doorGeometry({ x: 250, y: 200 }, HWALL, 0.82, PX, "left");
    const path = doorArcPath(geom);
    expect(path).toContain(" 0 1 ");
  });
});

// ─── windowGeometry ───────────────────────────────────────────────────────────

describe("windowGeometry", () => {
  const anchor = { x: 250, y: 200 };
  const wallThickPx = 11; // internal wall 0.11m × 100px/m

  it("produces exactly 3 glazing lines", () => {
    const geom = windowGeometry(anchor, HWALL, 1, PX, wallThickPx);
    expect(geom.glazingLines).toHaveLength(3);
  });

  it("first and last glazing lines align with the cut endpoints", () => {
    const geom = windowGeometry(anchor, HWALL, 1, PX, wallThickPx);
    // Each line is [startPt, endPt]. The midpoint of each line must coincide
    // with the corresponding cut endpoint (cutStart, mid, cutEnd on the wall).
    const midOf = ([s, e]: [{ x: number; y: number }, { x: number; y: number }]) => ({
      x: (s.x + e.x) / 2,
      y: (s.y + e.y) / 2,
    });
    const m0 = midOf(geom.glazingLines[0]);
    const m2 = midOf(geom.glazingLines[2]);
    expect(m0.x).toBeCloseTo(geom.cutStart.x, 5);
    expect(m0.y).toBeCloseTo(geom.cutStart.y, 5);
    expect(m2.x).toBeCloseTo(geom.cutEnd.x, 5);
    expect(m2.y).toBeCloseTo(geom.cutEnd.y, 5);
  });

  it("glazing lines are perpendicular to the wall (span the band)", () => {
    const geom = windowGeometry(anchor, HWALL, 1, PX, wallThickPx);
    // HWALL is horizontal → glazing lines should be vertical (same x, different y)
    for (const [s, e] of geom.glazingLines) {
      expect(s.x).toBeCloseTo(e.x, 5);
      expect(Math.abs(e.y - s.y)).toBeCloseTo(wallThickPx, 5);
    }
  });

  it("glazing lines span the full band (sum of half-widths = wallThicknessPx)", () => {
    const geom = windowGeometry(anchor, HWALL, 1, PX, wallThickPx);
    const [s, e] = geom.glazingLines[0];
    const lineLen = Math.hypot(e.x - s.x, e.y - s.y);
    expect(lineLen).toBeCloseTo(wallThickPx, 5);
  });

  it("middle glazing line is at the midpoint of the cut", () => {
    const geom = windowGeometry(anchor, HWALL, 1, PX, wallThickPx);
    const [s, e] = geom.glazingLines[1];
    const midX = (s.x + e.x) / 2;
    const midY = (s.y + e.y) / 2;
    const expectedMidX = (geom.cutStart.x + geom.cutEnd.x) / 2;
    const expectedMidY = (geom.cutStart.y + geom.cutEnd.y) / 2;
    expect(midX).toBeCloseTo(expectedMidX, 5);
    expect(midY).toBeCloseTo(expectedMidY, 5);
  });

  it("works for a non-horizontal (diagonal) wall", () => {
    const diagWall: WallSegment = { a: { x: 0, y: 0 }, b: { x: 300, y: 300 } };
    const diagAnchor = { x: 150, y: 150 };
    const geom = windowGeometry(diagAnchor, diagWall, 1, PX, wallThickPx);
    expect(geom.glazingLines).toHaveLength(3);
    // Each glazing line should be perpendicular to the wall direction (45°)
    // so it should point in the direction (-1, 1) or (1, -1) (normalized)
    const [s, e] = geom.glazingLines[0];
    const lineDx = e.x - s.x;
    const lineDy = e.y - s.y;
    const lineLen = Math.hypot(lineDx, lineDy);
    // dot product with wall direction (1/√2, 1/√2) should be ~0
    const wallUx = 1 / Math.sqrt(2);
    const wallUy = 1 / Math.sqrt(2);
    const dot = (lineDx / lineLen) * wallUx + (lineDy / lineLen) * wallUy;
    expect(Math.abs(dot)).toBeCloseTo(0, 5);
  });
});

// ─── Provenance firewall — openings never contribute to measured area ─────────

describe("RA-6841 [A2] — opening provenance firewall", () => {
  /**
   * An opening object (data.type = "opening") should:
   * 1. Pass through decomposeElements as type="opening" (geometry persists).
   * 2. NEVER be returned by measuredElements (which is provenance-gated by
   *    type !== "room" in totalMeasuredFloorAreaM2).
   * 3. NEVER contribute to totalMeasuredFloorAreaM2.
   */
  const sketchWithOpening = {
    scaleConfig: { pxPerMetre: 100 },
    objects: [
      // A 3m × 4m measured room
      {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 300, y: 0 },
          { x: 300, y: 400 },
          { x: 0, y: 400 },
        ],
        data: { type: "room", provenance: "operator_measured" as const },
      },
      // A door opening (operator_measured provenance — it was placed by the tech)
      {
        type: "group",
        width: 82,
        height: 11,
        left: 100,
        top: 200,
        data: { type: "opening", provenance: "operator_measured" as const, openingKind: "door" },
      },
    ],
  };

  it("decomposeElements includes openings as type='opening'", () => {
    const els = decomposeElements(sketchWithOpening);
    const opening = els.find((e) => e.type === "opening");
    expect(opening).toBeDefined();
    expect(opening!.type).toBe("opening");
  });

  it("measuredElements passes through opening objects (provenance gate only)", () => {
    const els = decomposeElements(sketchWithOpening);
    const measured = measuredElements(els);
    // Both room and opening have operator_measured provenance — both pass the
    // provenance filter. The area exclusion is enforced by totalMeasuredFloorAreaM2
    // which only sums type === "room" elements.
    const opening = measured.find((e) => e.type === "opening");
    expect(opening).toBeDefined();
  });

  it("totalMeasuredFloorAreaM2 excludes openings — they never add area", () => {
    const els = decomposeElements(sketchWithOpening);
    const total = totalMeasuredFloorAreaM2(els);
    // Only the room (3m × 4m = 12 m²) should count; the opening adds nothing.
    expect(total).toBeCloseTo(12, 5);
  });

  it("a sketch with ONLY an opening has zero measured floor area", () => {
    const openingOnly = {
      objects: [
        {
          type: "group",
          width: 82,
          height: 11,
          data: { type: "opening", provenance: "operator_measured" as const, openingKind: "window" },
        },
      ],
    };
    const els = decomposeElements(openingOnly);
    expect(totalMeasuredFloorAreaM2(els)).toBe(0);
  });

  it("multiple openings mixed with rooms — only rooms count", () => {
    const mixed = {
      scaleConfig: { pxPerMetre: 100 },
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 200 },
            { x: 0, y: 200 },
          ],
          data: { type: "room", provenance: "operator_measured" as const },
        },
        {
          type: "group",
          width: 82,
          height: 11,
          data: { type: "opening", provenance: "operator_measured" as const, openingKind: "door" },
        },
        {
          type: "group",
          width: 100,
          height: 11,
          data: { type: "opening", provenance: "operator_measured" as const, openingKind: "window" },
        },
      ],
    };
    const els = decomposeElements(mixed);
    // 200x200 at 100px/m = 2m × 2m = 4 m²
    expect(totalMeasuredFloorAreaM2(els)).toBeCloseTo(4, 5);
  });
});
