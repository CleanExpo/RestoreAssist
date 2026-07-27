import { describe, expect, it } from "vitest";
import {
  roomPlanWallsToFabric,
  roomPlanOpeningsToFabric,
  wallSegmentFromPolygon,
} from "../roomplan-openings";

describe("roomplan-openings", () => {
  it("projects wall bottom edge into a canvas line", () => {
    const seg = wallSegmentFromPolygon([
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 2.4, z: 0 },
      { x: 0, y: 2.4, z: 0 },
    ]);
    expect(seg).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 400, y: 0 },
    });
  });

  it("emits RoomPlan wall lines pending confirmation", () => {
    const walls = roomPlanWallsToFabric([
      {
        identifier: "w1",
        polygon: [
          { x: 0, y: 0, z: 0 },
          { x: 3, y: 0, z: 0 },
          { x: 3, y: 2, z: 0 },
          { x: 0, y: 2, z: 0 },
        ],
      },
    ]);
    expect(walls).toHaveLength(1);
    expect(walls[0].data.type).toBe("wall");
    expect(walls[0].data.captureAdapter).toBe("roomplan");
    expect(walls[0].data.provenance).toBe("underlay_reference");
    expect(walls[0].data.lengthM).toBe(3);
  });

  it("emits door openings with roomplan adapter", () => {
    const doors = roomPlanOpeningsToFabric(
      [
        {
          identifier: "d1",
          dimensions: { x: 0.9 },
          polygon: [
            { x: 1, z: 0 },
            { x: 1.9, z: 0 },
            { x: 1.9, z: 0.1 },
            { x: 1, z: 0.1 },
          ],
        },
      ],
      "door",
    );
    expect(doors).toHaveLength(1);
    expect(doors[0].data.openingKind).toBe("door");
    expect(doors[0].data.widthM).toBe(0.9);
    expect(doors[0].data.captureAdapter).toBe("roomplan");
  });
});
