import { describe, it, expect } from "vitest";
import {
  partitionStaleRooms,
  resolveFabricObjectId,
  type StaleRoom,
} from "../sync-room-graph";

/** A stale room with no evidence of any kind. */
function empty(id: string): StaleRoom {
  return {
    id,
    _count: { evidencePins: 0, moistureReadings: 0, hazards: 0 },
  };
}

function withCounts(
  id: string,
  counts: Partial<StaleRoom["_count"]>,
): StaleRoom {
  return {
    id,
    _count: {
      evidencePins: 0,
      moistureReadings: 0,
      hazards: 0,
      ...counts,
    },
  };
}

describe("partitionStaleRooms", () => {
  it("deletes a stale room that holds no evidence", () => {
    const { deletableIds, detachableIds } = partitionStaleRooms([
      empty("room-1"),
    ]);
    expect(deletableIds).toEqual(["room-1"]);
    expect(detachableIds).toEqual([]);
  });

  // The defect this function exists for. EvidencePin, SketchMoistureReading
  // and Hazard all reference SketchRoom with onDelete: SetNull, so deleting a
  // room that holds any of them does not fail — it silently blanks the room
  // link on evidence already captured.
  it.each([
    ["an evidence pin", { evidencePins: 1 }],
    ["a moisture reading", { moistureReadings: 1 }],
    ["a hazard", { hazards: 1 }],
    ["several of each", { evidencePins: 3, moistureReadings: 9, hazards: 2 }],
  ])("never deletes a stale room holding %s", (_label, counts) => {
    const { deletableIds, detachableIds } = partitionStaleRooms([
      withCounts("room-1", counts),
    ]);
    expect(deletableIds).toEqual([]);
    expect(detachableIds).toEqual(["room-1"]);
  });

  it("splits a mixed batch, keeping every room that holds evidence", () => {
    const { deletableIds, detachableIds } = partitionStaleRooms([
      empty("empty-a"),
      withCounts("has-pin", { evidencePins: 1 }),
      empty("empty-b"),
      withCounts("has-reading", { moistureReadings: 4 }),
    ]);
    expect(deletableIds).toEqual(["empty-a", "empty-b"]);
    expect(detachableIds).toEqual(["has-pin", "has-reading"]);
  });

  it("handles an empty batch", () => {
    expect(partitionStaleRooms([])).toEqual({
      deletableIds: [],
      detachableIds: [],
    });
  });

  it("treats a missing _count as no evidence rather than throwing", () => {
    // Defensive: a caller that forgets the _count select should not crash the
    // whole sketch save. Deleting an empty room is the pre-existing behaviour.
    const malformed = { id: "room-1" } as unknown as StaleRoom;
    expect(() => partitionStaleRooms([malformed])).not.toThrow();
    expect(partitionStaleRooms([malformed]).deletableIds).toEqual(["room-1"]);
  });
});

describe("resolveFabricObjectId — why rooms go stale", () => {
  // These pin the instability that made the delete so damaging: a room with
  // no data.id gets an id derived from its index, position and size, so
  // ordinary editing re-mints it. The room is then "stale" though the operator
  // only moved it. partitionStaleRooms is what stops that losing evidence.
  const room = (over: Record<string, unknown> = {}) => ({
    data: { type: "room", label: "Kitchen" },
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    ...over,
  });

  it("is stable when the object carries data.id", () => {
    const withId = (over: Record<string, unknown>) => ({
      ...room(over),
      data: { type: "room", id: "kitchen-1" },
    });
    expect(resolveFabricObjectId(withId({ left: 0 }), 0)).toBe("kitchen-1");
    expect(resolveFabricObjectId(withId({ left: 999 }), 7)).toBe("kitchen-1");
  });

  it("changes when a room without data.id is moved", () => {
    const before = resolveFabricObjectId(room({ left: 0, top: 0 }), 0);
    const after = resolveFabricObjectId(room({ left: 250, top: 80 }), 0);
    expect(after).not.toBe(before);
  });

  it("changes when a room without data.id shifts array index", () => {
    const before = resolveFabricObjectId(room(), 0);
    const after = resolveFabricObjectId(room(), 1);
    expect(after).not.toBe(before);
  });
});
