import { describe, expect, it } from "vitest";
import { roomPlanToFabric, type CapturedRoom } from "../roomplan-to-fabric";

// A clean 4 m × 3 m rectangular room. Floor polygon vertices are in METRES,
// matching Apple RoomPlan's CapturedRoom output. At PX_PER_METRE = 100 these
// project to a 400 px × 300 px polygon enclosing 12 m².
const RECT_ROOM: CapturedRoom = {
  rooms: [
    {
      label: "Living Room",
      floorPolygon: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 3 },
        { x: 0, z: 3 },
      ],
    },
  ],
};

describe("roomPlanToFabric — vertex scaling", () => {
  it("scales metric vertices into pixels by ×100 (PX_PER_METRE)", () => {
    const [poly] = roomPlanToFabric(RECT_ROOM);
    expect(poly.points).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]);
  });

  it("maps RoomPlan's depth axis (z) onto the canvas y axis", () => {
    const [poly] = roomPlanToFabric({
      rooms: [
        {
          label: "R",
          floorPolygon: [
            { x: 1, z: 2 },
            { x: 3, z: 2 },
            { x: 3, z: 5 },
          ],
        },
      ],
    });
    expect(poly.points[0]).toEqual({ x: 100, y: 200 });
  });

  it("accepts a flattened `y` key as the depth axis", () => {
    const [poly] = roomPlanToFabric({
      rooms: [
        {
          floorPolygon: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
          ],
        },
      ],
    });
    expect(poly.points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
    ]);
  });
});

describe("roomPlanToFabric — polygon shape + closure", () => {
  it("produces a Fabric polygon descriptor with brand styling", () => {
    const [poly] = roomPlanToFabric(RECT_ROOM);
    expect(poly.type).toBe("polygon");
    expect(poly.stroke).toBe("#1C2E47");
    expect(poly.strokeWidth).toBe(2);
    expect(poly.objectCaching).toBe(false);
    expect(poly.data.type).toBe("room");
    expect(poly.data.label).toBe("Living Room");
    expect(poly.data.provenance).toBe("lidar_imported");
  });

  it("keeps the polygon implicitly closed (no duplicated closing vertex)", () => {
    const [poly] = roomPlanToFabric(RECT_ROOM);
    expect(poly.points).toHaveLength(4);
    // First and last vertices differ — Fabric closes polygons implicitly.
    expect(poly.points[0]).not.toEqual(poly.points[poly.points.length - 1]);
  });
});

describe("roomPlanToFabric — area via shared shoelace convention", () => {
  it("computes 12 m² for a 4 m × 3 m room", () => {
    const [poly] = roomPlanToFabric(RECT_ROOM);
    expect(poly.data.areaM2).toBeCloseTo(12);
  });

  it("ignores winding direction for area", () => {
    const reversed: CapturedRoom = {
      rooms: [
        {
          label: "R",
          floorPolygon: [...RECT_ROOM.rooms[0].floorPolygon].reverse(),
        },
      ],
    };
    const [poly] = roomPlanToFabric(reversed);
    expect(poly.data.areaM2).toBeCloseTo(12);
  });
});

describe("roomPlanToFabric — guards", () => {
  it("returns [] for null/undefined/empty input", () => {
    expect(roomPlanToFabric(null)).toEqual([]);
    expect(roomPlanToFabric(undefined)).toEqual([]);
    expect(roomPlanToFabric({ rooms: [] })).toEqual([]);
  });

  it("skips rooms with fewer than 3 floor vertices", () => {
    const result = roomPlanToFabric({
      rooms: [
        {
          label: "Degenerate",
          floorPolygon: [
            { x: 0, z: 0 },
            { x: 1, z: 1 },
          ],
        },
        {
          label: "Valid",
          floorPolygon: [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: 1, z: 1 },
          ],
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].data.label).toBe("Valid");
  });

  it("skips degenerate captures that collapse to a near-zero area", () => {
    // Vertices with no depth axis (no z, no y) all map to y=0 → a flat line
    // enclosing 0 m². It must be skipped rather than emit a bogus 0 m² room.
    const result = roomPlanToFabric({
      rooms: [
        {
          label: "Collapsed",
          floorPolygon: [{ x: 0 }, { x: 4 }, { x: 8 }],
        },
        {
          label: "Valid",
          floorPolygon: [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: 1, z: 1 },
          ],
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].data.label).toBe("Valid");
  });

  it("falls back to category, then 'Room', for the label", () => {
    const [byCategory] = roomPlanToFabric({
      rooms: [
        {
          category: "Kitchen",
          floorPolygon: [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: 1, z: 1 },
          ],
        },
      ],
    });
    expect(byCategory.data.label).toBe("Kitchen");

    const [unlabelled] = roomPlanToFabric({
      rooms: [
        {
          floorPolygon: [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: 1, z: 1 },
          ],
        },
      ],
    });
    expect(unlabelled.data.label).toBe("Room");
  });
});
