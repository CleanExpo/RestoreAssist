import { describe, expect, it } from "vitest";
import {
  emptyFloor,
  emptyGraph,
  getActiveFloor,
  isValidGraph,
  validateFloor,
  validateGraph,
} from "../wall-graph-types";
import type { Floor, WallGraph } from "../wall-graph-types";

const SQUARE_FLOOR = (): Floor => ({
  id: "f1",
  floorIndex: 0,
  floorLabel: "Ground Floor",
  pxPerMetre: 100,
  northRotationDeg: 0,
  sourceType: "manual",
  corners: [
    { id: "c1", x: 0, y: 0 },
    { id: "c2", x: 400, y: 0 },
    { id: "c3", x: 400, y: 400 },
    { id: "c4", x: 0, y: 400 },
  ],
  walls: [
    { id: "w1", from: "c1", to: "c2", thicknessMm: 110, isExterior: true },
    { id: "w2", from: "c2", to: "c3", thicknessMm: 110, isExterior: true },
    { id: "w3", from: "c3", to: "c4", thicknessMm: 110, isExterior: true },
    { id: "w4", from: "c4", to: "c1", thicknessMm: 110, isExterior: true },
  ],
  openings: [],
  rooms: [],
});

describe("wall-graph-types — empty constructors", () => {
  it("emptyFloor creates a floor with default scale", () => {
    const f = emptyFloor({ id: "f0" });
    expect(f.pxPerMetre).toBe(100);
    expect(f.floorLabel).toBe("Ground Floor");
    expect(f.corners).toEqual([]);
  });

  it("emptyGraph builds a single-floor graph that activeFloorId points at", () => {
    const g = emptyGraph("f0");
    expect(g.activeFloorId).toBe("f0");
    expect(g.floors).toHaveLength(1);
    expect(getActiveFloor(g).id).toBe("f0");
  });
});

describe("wall-graph-types — validateFloor", () => {
  it("returns no issues for a clean square", () => {
    expect(validateFloor(SQUARE_FLOOR())).toEqual([]);
  });

  it("flags orphan corners", () => {
    const f = SQUARE_FLOOR();
    f.corners.push({ id: "c5", x: 999, y: 999 });
    const issues = validateFloor(f);
    expect(issues.some((i) => i.code === "ORPHAN_CORNER" && i.refIds[0] === "c5")).toBe(true);
  });

  it("flags walls referencing missing corners", () => {
    const f = SQUARE_FLOOR();
    f.walls.push({
      id: "wbad",
      from: "ghost",
      to: "c1",
      thicknessMm: 110,
      isExterior: false,
    });
    const issues = validateFloor(f);
    expect(issues.some((i) => i.code === "DANGLING_WALL")).toBe(true);
  });

  it("flags duplicate walls regardless of direction", () => {
    const f = SQUARE_FLOOR();
    f.walls.push({
      id: "dup",
      from: "c2",
      to: "c1",
      thicknessMm: 110,
      isExterior: false,
    });
    const issues = validateFloor(f);
    expect(issues.some((i) => i.code === "DUPLICATE_WALL")).toBe(true);
  });

  it("flags openings whose pos+width overflows the wall length", () => {
    const f = SQUARE_FLOOR();
    // Wall w1 is 4m long (400px / 100px/m). Place a 3m opening at 2m → overflows.
    f.openings.push({
      id: "o1",
      wallId: "w1",
      type: "DOOR",
      positionM: 2,
      widthM: 3,
    });
    const issues = validateFloor(f);
    expect(issues.some((i) => i.code === "OPENING_OVERLAPS_END")).toBe(true);
  });

  it("accepts an opening that fits inside the wall", () => {
    const f = SQUARE_FLOOR();
    f.openings.push({
      id: "o1",
      wallId: "w1",
      type: "DOOR",
      positionM: 1,
      widthM: 0.9,
    });
    expect(validateFloor(f)).toEqual([]);
  });
});

describe("wall-graph-types — validateGraph + isValidGraph", () => {
  it("flags an empty graph", () => {
    const g: WallGraph = {
      version: 3,
      scale: { pxPerMetre: 100, calibratedAt: new Date().toISOString(), method: "manual" },
      floors: [],
      activeFloorId: "none",
    };
    const issues = validateGraph(g);
    expect(issues[0].code).toBe("EMPTY_GRAPH");
    expect(isValidGraph(g)).toBe(false);
  });

  it("aggregates issues across floors", () => {
    const g: WallGraph = {
      version: 3,
      scale: { pxPerMetre: 100, calibratedAt: new Date().toISOString(), method: "manual" },
      floors: [SQUARE_FLOOR(), { ...SQUARE_FLOOR(), id: "f2", floorIndex: 1 }],
      activeFloorId: "f1",
    };
    g.floors[1].corners.push({ id: "orph", x: 0, y: 0 });
    expect(validateGraph(g).length).toBeGreaterThan(0);
    expect(isValidGraph(g)).toBe(false);
  });

  it("isValidGraph returns true for a clean two-floor graph", () => {
    const f1 = SQUARE_FLOOR();
    const f2 = { ...SQUARE_FLOOR(), id: "f2", floorIndex: 1, floorLabel: "First Floor" };
    const g: WallGraph = {
      version: 3,
      scale: { pxPerMetre: 100, calibratedAt: new Date().toISOString(), method: "manual" },
      floors: [f1, f2],
      activeFloorId: "f1",
    };
    expect(isValidGraph(g)).toBe(true);
  });
});
