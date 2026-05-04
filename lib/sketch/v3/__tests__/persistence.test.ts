import { describe, expect, it, vi } from "vitest";
import {
  parseIncomingWallGraph,
  persistWallGraph,
  WallGraphIntegrityError,
  type MinimalPrismaV3,
} from "../persistence";
import { toJSON } from "../serialize";
import { emptyGraph } from "../wall-graph-types";
import { reduce } from "../reducer";

function makePrismaMock(): MinimalPrismaV3 & {
  __calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    "$transaction": [],
    "floorPlanV3.deleteMany": [],
    "floorPlanV3.create": [],
    "floorCornerV3.createMany": [],
    "floorWallV3.createMany": [],
    "floorOpeningV3.createMany": [],
    "floorRoomV3.createMany": [],
  };
  const mock: MinimalPrismaV3 = {
    $transaction: async (fn) => {
      calls["$transaction"].push(true);
      return fn(mock);
    },
    floorPlanV3: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async (args) => {
        calls["floorPlanV3.deleteMany"].push(args);
      }),
      create: vi.fn(async (args) => {
        calls["floorPlanV3.create"].push(args);
        return { id: "fp1" };
      }),
      upsert: vi.fn(async (args) => {
        calls["floorPlanV3.create"].push(args);
        return { id: "fp1" };
      }),
    },
    floorCornerV3: {
      createMany: vi.fn(async (args) => {
        calls["floorCornerV3.createMany"].push(args);
      }),
    },
    floorWallV3: {
      createMany: vi.fn(async (args) => {
        calls["floorWallV3.createMany"].push(args);
      }),
    },
    floorOpeningV3: {
      createMany: vi.fn(async (args) => {
        calls["floorOpeningV3.createMany"].push(args);
      }),
    },
    floorRoomV3: {
      createMany: vi.fn(async (args) => {
        calls["floorRoomV3.createMany"].push(args);
      }),
    },
  };
  return Object.assign(mock, { __calls: calls });
}

function rectangleGraph() {
  let g = emptyGraph("f1", 100);
  g = reduce(g, { type: "ADD_CORNER", cornerId: "a", x: 0, y: 0 });
  g = reduce(g, { type: "ADD_CORNER", cornerId: "b", x: 400, y: 0 });
  g = reduce(g, { type: "ADD_CORNER", cornerId: "c", x: 400, y: 300 });
  g = reduce(g, { type: "ADD_CORNER", cornerId: "d", x: 0, y: 300 });
  g = reduce(g, {
    type: "ADD_WALL",
    wallId: "w1",
    from: "a",
    to: "b",
    isExterior: true,
  });
  g = reduce(g, {
    type: "ADD_WALL",
    wallId: "w2",
    from: "b",
    to: "c",
    isExterior: true,
  });
  g = reduce(g, {
    type: "ADD_WALL",
    wallId: "w3",
    from: "c",
    to: "d",
    isExterior: true,
  });
  g = reduce(g, {
    type: "ADD_WALL",
    wallId: "w4",
    from: "d",
    to: "a",
    isExterior: true,
  });
  return g;
}

describe("persistence — parseIncomingWallGraph", () => {
  it("accepts a valid serialised graph", () => {
    const wire = toJSON(rectangleGraph());
    const parsed = parseIncomingWallGraph(JSON.parse(JSON.stringify(wire)));
    expect(parsed.floors[0].corners).toHaveLength(4);
  });

  it("rejects an invalid graph with an integrity error", () => {
    const wire = toJSON(rectangleGraph());
    // Inject an orphan corner.
    wire.floors[0].corners.push({ id: "orphan", x: 999, y: 999 });
    expect(() =>
      parseIncomingWallGraph(JSON.parse(JSON.stringify(wire))),
    ).toThrow(WallGraphIntegrityError);
  });
});

describe("persistence — persistWallGraph", () => {
  it("deletes existing rows then creates new ones inside a transaction", async () => {
    const mock = makePrismaMock();
    const graph = rectangleGraph();
    const ids = await persistWallGraph(mock, "insp1", graph);
    expect(ids).toEqual(["f1"]);
    expect(mock.__calls["$transaction"]).toHaveLength(1);
    expect(mock.__calls["floorPlanV3.deleteMany"]).toHaveLength(1);
    expect(mock.__calls["floorPlanV3.create"]).toHaveLength(1);
    expect(mock.__calls["floorCornerV3.createMany"]).toHaveLength(1);
    expect(mock.__calls["floorWallV3.createMany"]).toHaveLength(1);
  });

  it("skips opening / room batches when arrays are empty", async () => {
    const mock = makePrismaMock();
    // Bare graph with corners + walls but no openings / rooms (rooms are
    // derived; an open path produces no rooms).
    let g = emptyGraph("f1", 100);
    g = reduce(g, { type: "ADD_CORNER", cornerId: "a", x: 0, y: 0 });
    g = reduce(g, { type: "ADD_CORNER", cornerId: "b", x: 100, y: 0 });
    g = reduce(g, {
      type: "ADD_WALL",
      wallId: "w1",
      from: "a",
      to: "b",
    });
    await persistWallGraph(mock, "insp1", g);
    expect(mock.__calls["floorOpeningV3.createMany"]).toHaveLength(0);
    expect(mock.__calls["floorRoomV3.createMany"]).toHaveLength(0);
  });

  it("refuses to persist an invalid graph", async () => {
    const mock = makePrismaMock();
    const g = rectangleGraph();
    g.floors[0].corners.push({ id: "orph", x: 999, y: 999 });
    await expect(persistWallGraph(mock, "insp1", g)).rejects.toThrow(
      WallGraphIntegrityError,
    );
    expect(mock.__calls["$transaction"]).toHaveLength(0);
  });
});
