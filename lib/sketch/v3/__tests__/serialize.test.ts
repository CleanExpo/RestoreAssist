import { describe, expect, it } from "vitest";
import {
  fromJSON,
  toJSON,
  toPrismaWrite,
  WallGraphParseError,
} from "../serialize";
import { emptyGraph } from "../wall-graph-types";

function sampleGraph() {
  const g = emptyGraph("f1", 100);
  const floor = g.floors[0];
  floor.corners = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 400, y: 0 },
    { id: "c", x: 400, y: 300 },
    { id: "d", x: 0, y: 300 },
  ];
  floor.walls = [
    { id: "w1", from: "a", to: "b", thicknessMm: 110, isExterior: true },
    { id: "w2", from: "b", to: "c", thicknessMm: 110, isExterior: true },
    { id: "w3", from: "c", to: "d", thicknessMm: 110, isExterior: true },
    { id: "w4", from: "d", to: "a", thicknessMm: 110, isExterior: true },
  ];
  floor.openings = [
    {
      id: "o1",
      wallId: "w1",
      type: "DOOR",
      positionM: 1,
      widthM: 0.9,
      heightM: 2.04,
    },
  ];
  floor.rooms = [
    {
      id: "r1",
      cornerCycle: ["a", "b", "c", "d"],
      label: "Lounge",
      areaM2: 12,
      centroid: { x: 200, y: 150 },
    },
  ];
  return g;
}

describe("serialize — round-trip", () => {
  it("toJSON → fromJSON preserves graph identity", () => {
    const g = sampleGraph();
    const wire = toJSON(g);
    const round = fromJSON(JSON.parse(JSON.stringify(wire)));
    expect(round).toEqual(g);
  });

  it("does not mutate the input graph", () => {
    const g = sampleGraph();
    const beforeFloors = g.floors[0].corners.length;
    toJSON(g);
    expect(g.floors[0].corners.length).toBe(beforeFloors);
  });

  it("clones nested arrays so callers can mutate the wire output safely", () => {
    const g = sampleGraph();
    const wire = toJSON(g);
    wire.floors[0].corners.push({ id: "extra", x: 1, y: 1 });
    expect(g.floors[0].corners).toHaveLength(4);
  });
});

describe("serialize — fromJSON validation", () => {
  it("rejects unsupported version", () => {
    expect(() => fromJSON({ version: 2, scale: {}, floors: [], activeFloorId: "x" })).toThrow(
      WallGraphParseError,
    );
  });

  it("rejects missing floors", () => {
    expect(() =>
      fromJSON({
        version: 3,
        scale: { pxPerMetre: 100, calibratedAt: "now", method: "manual" },
        floors: [],
        activeFloorId: "x",
      }),
    ).toThrow(WallGraphParseError);
  });

  it("rejects activeFloorId that does not match any floor", () => {
    const wire = toJSON(sampleGraph());
    wire.activeFloorId = "ghost";
    expect(() => fromJSON(JSON.parse(JSON.stringify(wire)))).toThrow(
      WallGraphParseError,
    );
  });

  it("rejects malformed corner shape", () => {
    const wire = toJSON(sampleGraph()) as unknown as Record<string, unknown>;
    (wire.floors as unknown as { corners: unknown[] }[])[0].corners = [{ id: "x" }];
    expect(() => fromJSON(wire)).toThrow(WallGraphParseError);
  });
});

describe("serialize — toPrismaWrite", () => {
  it("flattens floors into relational rows", () => {
    const plan = toPrismaWrite(sampleGraph());
    expect(plan.floorPlans).toHaveLength(1);
    expect(plan.corners).toHaveLength(4);
    expect(plan.walls).toHaveLength(4);
    expect(plan.openings).toHaveLength(1);
    expect(plan.rooms).toHaveLength(1);
    expect(plan.corners.every((c) => c.floorPlanId === "f1")).toBe(true);
  });

  it("emits centroidX / centroidY as scalar columns", () => {
    const plan = toPrismaWrite(sampleGraph());
    expect(plan.rooms[0].centroidX).toBe(200);
    expect(plan.rooms[0].centroidY).toBe(150);
  });

  it("sets origin/geoTransform/sourceFootprintId to null when absent", () => {
    const plan = toPrismaWrite(sampleGraph());
    expect(plan.floorPlans[0].origin).toBeNull();
    expect(plan.floorPlans[0].geoTransform).toBeNull();
    expect(plan.floorPlans[0].sourceFootprintId).toBeNull();
  });
});
