import { describe, it, expect } from "vitest";
import {
  extractRoomGraphNodes,
  resolveFabricObjectId,
  findRoomIdAtPoint,
} from "@/lib/sketch/sync-room-graph";

describe("sync-room-graph", () => {
  it("extracts rooms with stable fabric ids and area", () => {
    const nodes = extractRoomGraphNodes({
      scaleConfig: { pxPerMetre: 100 },
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            { x: 400, y: 300 },
            { x: 0, y: 300 },
          ],
          data: {
            type: "room",
            id: "room-kitchen",
            label: "Kitchen",
            areaM2: 12,
            provenance: "operator_measured",
          },
        },
        {
          type: "line",
          data: { type: "wall" },
        },
      ],
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].fabricObjectId).toBe("room-kitchen");
    expect(nodes[0].name).toBe("Kitchen");
    expect(nodes[0].areaM2).toBe(12);
  });

  it("hashes fabric id when data.id is missing", () => {
    const id = resolveFabricObjectId(
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        data: { type: "room" },
      },
      0,
    );
    expect(id).toMatch(/^fr-[a-f0-9]{16}$/);
  });

  it("finds room containing a point", () => {
    const roomId = findRoomIdAtPoint(
      [
        {
          id: "r1",
          geometryJson: {
            left: 0,
            top: 0,
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
              { x: 0, y: 100 },
            ],
          },
        },
      ],
      40,
      40,
    );
    expect(roomId).toBe("r1");
    expect(
      findRoomIdAtPoint(
        [
          {
            id: "r1",
            geometryJson: {
              left: 0,
              top: 0,
              points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
              ],
            },
          },
        ],
        400,
        400,
      ),
    ).toBeNull();
  });
});
