import { describe, expect, it } from "vitest";
import {
  applyAction,
  newHistory,
  redo,
  reduce,
  undo,
  type ReducerError,
} from "../reducer";
import { emptyGraph, getActiveFloor } from "../wall-graph-types";

function bareGraph() {
  return emptyGraph("f1", 100);
}

/** Build a 4 × 3 m rectangle on the active floor. */
function rectangleGraph() {
  let g = bareGraph();
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

describe("reducer — corners + walls", () => {
  it("adds corners and walls and derives a single room", () => {
    const g = rectangleGraph();
    const floor = getActiveFloor(g);
    expect(floor.corners).toHaveLength(4);
    expect(floor.walls).toHaveLength(4);
    expect(floor.rooms).toHaveLength(1);
    expect(floor.rooms[0].areaM2).toBeCloseTo(12, 4);
  });

  it("rejects duplicate corner ids", () => {
    let g = bareGraph();
    g = reduce(g, { type: "ADD_CORNER", cornerId: "a", x: 0, y: 0 });
    expect(() =>
      reduce(g, { type: "ADD_CORNER", cornerId: "a", x: 1, y: 1 }),
    ).toThrowError(/already exists/);
  });

  it("rejects walls referencing missing corners", () => {
    let g = bareGraph();
    g = reduce(g, { type: "ADD_CORNER", cornerId: "a", x: 0, y: 0 });
    expect(() =>
      reduce(g, { type: "ADD_WALL", wallId: "w", from: "a", to: "ghost" }),
    ).toThrow(/missing corners/);
  });

  it("DELETE_CORNER cascades into walls and openings", () => {
    let g = rectangleGraph();
    g = reduce(g, {
      type: "ADD_OPENING",
      openingId: "o1",
      wallId: "w1",
      openingType: "DOOR",
      positionM: 1,
      widthM: 0.9,
    });
    g = reduce(g, { type: "DELETE_CORNER", cornerId: "a" });
    const floor = getActiveFloor(g);
    expect(floor.walls.find((w) => w.id === "w1")).toBeUndefined();
    expect(floor.walls.find((w) => w.id === "w4")).toBeUndefined();
    expect(floor.openings).toHaveLength(0);
    expect(floor.rooms).toHaveLength(0);
  });
});

describe("reducer — openings", () => {
  it("rejects openings that overflow the wall", () => {
    const g = rectangleGraph();
    expect(() =>
      reduce(g, {
        type: "ADD_OPENING",
        openingId: "o1",
        wallId: "w1",
        openingType: "DOOR",
        positionM: 3.5,
        widthM: 1,
      }),
    ).toThrow(/Opening overflow/);
  });

  it("MOVE_OPENING re-validates against wall length", () => {
    let g = rectangleGraph();
    g = reduce(g, {
      type: "ADD_OPENING",
      openingId: "o1",
      wallId: "w1",
      openingType: "DOOR",
      positionM: 1,
      widthM: 0.9,
    });
    expect(() =>
      reduce(g, { type: "MOVE_OPENING", openingId: "o1", positionM: 5 }),
    ).toThrow(/Opening overflow/);
  });
});

describe("reducer — SPLIT_WALL_AT_CORNER", () => {
  it("inserts a new corner that splits an existing wall", () => {
    let g = rectangleGraph();
    g = reduce(g, {
      type: "SPLIT_WALL_AT_CORNER",
      wallId: "w1",
      newCornerId: "mid",
      x: 200,
      y: 0,
      newWallId: "w1b",
    });
    const floor = getActiveFloor(g);
    expect(floor.corners.find((c) => c.id === "mid")).toBeDefined();
    expect(floor.walls.find((w) => w.id === "w1")).toBeDefined();
    expect(floor.walls.find((w) => w.id === "w1b")).toBeDefined();
  });

  it("redistributes openings across the split", () => {
    let g = rectangleGraph();
    g = reduce(g, {
      type: "ADD_OPENING",
      openingId: "o-near",
      wallId: "w1",
      openingType: "DOOR",
      positionM: 0.5,
      widthM: 0.9,
    });
    g = reduce(g, {
      type: "ADD_OPENING",
      openingId: "o-far",
      wallId: "w1",
      openingType: "WINDOW",
      positionM: 3,
      widthM: 0.8,
    });
    g = reduce(g, {
      type: "SPLIT_WALL_AT_CORNER",
      wallId: "w1",
      newCornerId: "mid",
      x: 200,
      y: 0,
      newWallId: "w1b",
    });
    const floor = getActiveFloor(g);
    const near = floor.openings.find((o) => o.id === "o-near")!;
    const far = floor.openings.find((o) => o.id === "o-far")!;
    expect(near.wallId).toBe("w1");
    expect(far.wallId).toBe("w1b");
    // far's positionM should be 3 - 2 (split point in metres) = 1
    expect(far.positionM).toBeCloseTo(1, 4);
  });
});

describe("reducer — SET_SCALE", () => {
  it("recomputes room areas when pxPerMetre changes", () => {
    let g = rectangleGraph();
    expect(getActiveFloor(g).rooms[0].areaM2).toBeCloseTo(12, 4);
    g = reduce(g, { type: "SET_SCALE", pxPerMetre: 200 });
    // Same pixel rectangle but 200 px/m → 2 m × 1.5 m = 3 m²
    expect(getActiveFloor(g).rooms[0].areaM2).toBeCloseTo(3, 4);
  });

  it("rejects non-positive scales", () => {
    expect(() =>
      reduce(bareGraph(), { type: "SET_SCALE", pxPerMetre: 0 }),
    ).toThrow(/positive/);
  });
});

describe("reducer — multi-floor", () => {
  it("ADD_FLOOR + SET_ACTIVE_FLOOR work together", () => {
    let g = bareGraph();
    g = reduce(g, {
      type: "ADD_FLOOR",
      floorId: "f2",
      floorIndex: 1,
      floorLabel: "First Floor",
    });
    expect(g.floors).toHaveLength(2);
    g = reduce(g, { type: "SET_ACTIVE_FLOOR", floorId: "f2" });
    expect(g.activeFloorId).toBe("f2");
  });

  it("rejects unknown active floor", () => {
    expect(() =>
      reduce(bareGraph(), { type: "SET_ACTIVE_FLOOR", floorId: "ghost" }),
    ).toThrow(/not found/);
  });
});

describe("reducer — LABEL_ROOM", () => {
  it("relabels a derived room without re-running face-finder", () => {
    let g = rectangleGraph();
    const initialRoomId = getActiveFloor(g).rooms[0].id;
    g = reduce(g, {
      type: "LABEL_ROOM",
      roomId: initialRoomId,
      label: "Kitchen",
      roomType: "kitchen",
    });
    const room = getActiveFloor(g).rooms[0];
    expect(room.label).toBe("Kitchen");
    expect(room.roomType).toBe("kitchen");
  });

  it("rejects unknown room id", () => {
    const g = rectangleGraph();
    let err: ReducerError | undefined;
    try {
      reduce(g, { type: "LABEL_ROOM", roomId: "ghost", label: "x" });
    } catch (e) {
      err = e as ReducerError;
    }
    expect(err?.code).toBe("ROOM_NOT_FOUND");
  });
});

describe("reducer — undo / redo history", () => {
  it("walks back through history and forward again", () => {
    const initial = bareGraph();
    let h = newHistory(initial);
    h = applyAction(h, { type: "ADD_CORNER", cornerId: "a", x: 0, y: 0 });
    h = applyAction(h, { type: "ADD_CORNER", cornerId: "b", x: 100, y: 0 });

    expect(h.present.floors[0].corners).toHaveLength(2);

    h = undo(h);
    expect(h.present.floors[0].corners).toHaveLength(1);
    h = undo(h);
    expect(h.present.floors[0].corners).toHaveLength(0);

    h = redo(h);
    expect(h.present.floors[0].corners).toHaveLength(1);
    h = redo(h);
    expect(h.present.floors[0].corners).toHaveLength(2);
  });

  it("clears the redo stack on a new action", () => {
    let h = newHistory(bareGraph());
    h = applyAction(h, { type: "ADD_CORNER", cornerId: "a", x: 0, y: 0 });
    h = undo(h);
    h = applyAction(h, { type: "ADD_CORNER", cornerId: "b", x: 5, y: 5 });
    expect(h.future).toHaveLength(0);
  });

  it("never grows past MAX_HISTORY", () => {
    let h = newHistory(bareGraph());
    for (let i = 0; i < 200; i++) {
      h = applyAction(h, {
        type: "ADD_CORNER",
        cornerId: `c${i}`,
        x: i,
        y: 0,
      });
    }
    expect(h.past.length).toBeLessThanOrEqual(50);
  });
});
