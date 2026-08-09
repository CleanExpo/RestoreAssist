import { describe, it, expect } from "vitest";
import {
  findContainingRoom,
  damageAnchorPoint,
  describeRoomDamageTint,
  extractDamageLegend,
  resolveRoomDamageTap,
  roomClipPathDescriptor,
  roomDamageTintId,
  roomsFromFabricObjects,
} from "../damage-zone";

const kitchen = {
  id: "kitchen",
  label: "Kitchen",
  points: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 150 },
    { x: 0, y: 150 },
  ],
};

const pantry = {
  id: "pantry",
  label: "Pantry",
  // Nested inside kitchen
  points: [
    { x: 20, y: 20 },
    { x: 80, y: 20 },
    { x: 80, y: 80 },
    { x: 20, y: 80 },
  ],
};

describe("findContainingRoom", () => {
  it("returns null when the point is outside every room", () => {
    expect(findContainingRoom(500, 500, [kitchen])).toBeNull();
  });

  it("returns the room containing the point", () => {
    expect(findContainingRoom(100, 75, [kitchen])?.id).toBe("kitchen");
  });

  it("prefers the smallest enclosing room when nested", () => {
    expect(findContainingRoom(50, 50, [kitchen, pantry])?.id).toBe("pantry");
  });
});

describe("damageAnchorPoint", () => {
  it("prefers getCenterPoint when present", () => {
    expect(
      damageAnchorPoint({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        getCenterPoint: () => ({ x: 42, y: 17 }),
      }),
    ).toEqual({ x: 42, y: 17 });
  });

  it("falls back to left/top + half size", () => {
    expect(
      damageAnchorPoint({ left: 10, top: 20, width: 40, height: 30 }),
    ).toEqual({ x: 30, y: 35 });
  });
});

describe("roomClipPathDescriptor", () => {
  it("marks the clip as absolutePositioned for scene-space walls", () => {
    const d = roomClipPathDescriptor(kitchen);
    expect(d.absolutePositioned).toBe(true);
    expect(d.roomId).toBe("kitchen");
    expect(d.points).toHaveLength(4);
  });
});

describe("roomsFromFabricObjects", () => {
  it("extracts room polygons and skips non-rooms", () => {
    const rooms = roomsFromFabricObjects([
      {
        data: { type: "room", id: "r1", label: "Bath" },
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      },
      { data: { type: "wall" }, x1: 0, y1: 0, x2: 10, y2: 0 },
      { data: { type: "damage", damageKind: "water" } },
    ]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].id).toBe("r1");
    expect(rooms[0].label).toBe("Bath");
  });
});

describe("extractDamageLegend", () => {
  it("returns unique kinds in canonical order", () => {
    const legend = extractDamageLegend({
      objects: [
        { data: { type: "damage", damageKind: "mould" } },
        { data: { type: "damage", damageKind: "water" } },
        { data: { type: "damage", damageKind: "water" } },
        { data: { type: "room", label: "Hall" } },
        { data: { type: "damage", damageKind: "unknown" } },
      ],
    });
    expect(legend.map((e) => e.kind)).toEqual(["water", "mould"]);
    expect(legend[0].swatch).toMatch(/^#/);
    expect(legend[0].label).toBe("Water");
  });

  it("returns empty for missing fabric JSON", () => {
    expect(extractDamageLegend(null)).toEqual([]);
    expect(extractDamageLegend({})).toEqual([]);
  });
});

describe("one-tap room damage", () => {
  it("builds a stable tint id and room-fill descriptor", () => {
    expect(roomDamageTintId("kitchen", "water")).toBe("dmg-tint-kitchen-water");
    const d = describeRoomDamageTint(kitchen, "water");
    expect(d.data.role).toBe("room-tint");
    expect(d.data.roomId).toBe("kitchen");
    expect(d.points).toHaveLength(4);
    expect(d.fill).toContain("37, 99, 235");
  });

  it("paints when the tap is inside a room with no existing tint", () => {
    const r = resolveRoomDamageTap(100, 75, [kitchen], "water", new Set());
    expect(r.action).toBe("paint");
    if (r.action === "paint") expect(r.room.id).toBe("kitchen");
  });

  it("clears when the same tint already exists (toggle)", () => {
    const id = roomDamageTintId("kitchen", "water");
    const r = resolveRoomDamageTap(
      100,
      75,
      [kitchen],
      "water",
      new Set([id]),
    );
    expect(r.action).toBe("clear");
    if (r.action === "clear") expect(r.tintId).toBe(id);
  });

  it("returns none outside every room", () => {
    expect(
      resolveRoomDamageTap(900, 900, [kitchen], "fire", new Set()).action,
    ).toBe("none");
  });
});
