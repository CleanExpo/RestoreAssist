import { describe, expect, it } from "vitest";
import { cycleSignature, deriveRooms, findFaces } from "../face-finder";
import type { Corner, Floor, Wall } from "../wall-graph-types";

/** Corners + walls forming an axis-aligned rectangle. */
function rectangle(): { corners: Corner[]; walls: Wall[] } {
  return {
    corners: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 400, y: 0 },
      { id: "c", x: 400, y: 300 },
      { id: "d", x: 0, y: 300 },
    ],
    walls: [
      { id: "ab", from: "a", to: "b", thicknessMm: 110, isExterior: true },
      { id: "bc", from: "b", to: "c", thicknessMm: 110, isExterior: true },
      { id: "cd", from: "c", to: "d", thicknessMm: 110, isExterior: true },
      { id: "da", from: "d", to: "a", thicknessMm: 110, isExterior: true },
    ],
  };
}

/**
 * Two rooms sharing a vertical interior wall:
 *
 *   a───b───e
 *   │ R1│ R2│
 *   │   │   │
 *   d───c───f
 */
function twoRoomsShareWall(): { corners: Corner[]; walls: Wall[] } {
  return {
    corners: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 400, y: 0 },
      { id: "c", x: 400, y: 300 },
      { id: "d", x: 0, y: 300 },
      { id: "e", x: 800, y: 0 },
      { id: "f", x: 800, y: 300 },
    ],
    walls: [
      { id: "ab", from: "a", to: "b", thicknessMm: 110, isExterior: true },
      { id: "bc", from: "b", to: "c", thicknessMm: 110, isExterior: false }, // shared
      { id: "cd", from: "c", to: "d", thicknessMm: 110, isExterior: true },
      { id: "da", from: "d", to: "a", thicknessMm: 110, isExterior: true },
      { id: "be", from: "b", to: "e", thicknessMm: 110, isExterior: true },
      { id: "ef", from: "e", to: "f", thicknessMm: 110, isExterior: true },
      { id: "fc", from: "f", to: "c", thicknessMm: 110, isExterior: true },
    ],
  };
}

describe("face-finder — findFaces", () => {
  it("returns a single face for a rectangle", () => {
    const { corners, walls } = rectangle();
    const faces = findFaces(corners, walls);
    expect(faces).toHaveLength(1);
    expect(faces[0].areaPx2).toBeCloseTo(400 * 300, 5);
    expect(faces[0].cornerCycle).toHaveLength(4);
  });

  it("returns two faces for two rooms sharing a wall", () => {
    const { corners, walls } = twoRoomsShareWall();
    const faces = findFaces(corners, walls);
    expect(faces).toHaveLength(2);
    // Both rooms are 400 × 300 = 120000 px²
    for (const face of faces) {
      expect(face.areaPx2).toBeCloseTo(400 * 300, 1);
    }
  });

  it("returns an empty array for an empty graph", () => {
    expect(findFaces([], [])).toEqual([]);
  });

  it("ignores degenerate (collinear) edges", () => {
    const corners: Corner[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 200, y: 0 },
    ];
    const walls: Wall[] = [
      { id: "ab", from: "a", to: "b", thicknessMm: 110, isExterior: false },
      { id: "bc", from: "b", to: "c", thicknessMm: 110, isExterior: false },
    ];
    expect(findFaces(corners, walls)).toEqual([]);
  });

  it("computes centroids inside the face", () => {
    const { corners, walls } = rectangle();
    const [face] = findFaces(corners, walls);
    expect(face.centroid.x).toBeGreaterThan(0);
    expect(face.centroid.x).toBeLessThan(400);
    expect(face.centroid.y).toBeGreaterThan(0);
    expect(face.centroid.y).toBeLessThan(300);
  });
});

describe("face-finder — cycleSignature", () => {
  it("rotates to lexicographically smallest start", () => {
    expect(cycleSignature(["c", "a", "b"])).toContain("a");
    expect(cycleSignature(["c", "a", "b"]).startsWith("a")).toBe(true);
  });

  it("is invariant under rotation", () => {
    expect(cycleSignature(["a", "b", "c", "d"])).toBe(
      cycleSignature(["c", "d", "a", "b"]),
    );
  });

  it("is invariant under reversal", () => {
    expect(cycleSignature(["a", "b", "c", "d"])).toBe(
      cycleSignature(["d", "c", "b", "a"]),
    );
  });

  it("returns empty string for empty cycle", () => {
    expect(cycleSignature([])).toBe("");
  });
});

describe("face-finder — deriveRooms", () => {
  it("preserves prior room labels when topology is unchanged", () => {
    const { corners, walls } = rectangle();
    const floor: Floor = {
      id: "f",
      floorIndex: 0,
      floorLabel: "Ground",
      pxPerMetre: 100,
      northRotationDeg: 0,
      sourceType: "manual",
      corners,
      walls,
      openings: [],
      rooms: [],
    };
    const first = deriveRooms(floor);
    expect(first).toHaveLength(1);
    first[0].label = "Lounge";
    first[0].roomType = "living";

    const second = deriveRooms({ ...floor, rooms: first });
    expect(second).toHaveLength(1);
    expect(second[0].label).toBe("Lounge");
    expect(second[0].roomType).toBe("living");
  });

  it("computes areaM2 using floor pxPerMetre", () => {
    const { corners, walls } = rectangle();
    const floor: Floor = {
      id: "f",
      floorIndex: 0,
      floorLabel: "Ground",
      pxPerMetre: 100,
      northRotationDeg: 0,
      sourceType: "manual",
      corners,
      walls,
      openings: [],
      rooms: [],
    };
    const [room] = deriveRooms(floor);
    // 400 px = 4 m; 300 px = 3 m → 12 m²
    expect(room.areaM2).toBeCloseTo(12, 4);
  });

  it("returns an empty array for a floor with no walls", () => {
    expect(
      deriveRooms({
        id: "f",
        floorIndex: 0,
        floorLabel: "Ground",
        pxPerMetre: 100,
        northRotationDeg: 0,
        sourceType: "manual",
        corners: [{ id: "a", x: 0, y: 0 }],
        walls: [],
        openings: [],
        rooms: [],
      }),
    ).toEqual([]);
  });
});
