import { describe, it, expect } from "vitest";
import {
  extractRoomGraphNodes,
  resolveFabricObjectId,
  findRoomIdAtPoint,
  resolveEvidenceRoomLink,
  attachRoomNamesToPins,
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
    expect(nodes[0].captureAdapter).toBeNull();
  });

  it("extracts RoomPlan captureAdapter and stable roomplan fabric ids", () => {
    const nodes = extractRoomGraphNodes({
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 150 },
            { x: 0, y: 150 },
          ],
          data: {
            type: "room",
            id: "roomplan-0-abc",
            label: "Living Room",
            provenance: "underlay_reference",
            captureAdapter: "roomplan",
          },
        },
      ],
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].fabricObjectId).toBe("roomplan-0-abc");
    expect(nodes[0].captureAdapter).toBe("roomplan");
    expect(nodes[0].provenance).toBe("underlay_reference");
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

  it("resolves RoomPlan evidence link with name + captureAdapter", () => {
    const link = resolveEvidenceRoomLink(
      [
        {
          id: "sr-1",
          name: "Bedroom",
          fabricObjectId: "roomplan-1",
          geometryJson: {
            points: [
              { x: 10, y: 10 },
              { x: 110, y: 10 },
              { x: 110, y: 90 },
              { x: 10, y: 90 },
            ],
            data: {
              type: "room",
              id: "roomplan-1",
              label: "Bedroom",
              captureAdapter: "roomplan",
            },
          },
        },
      ],
      50,
      40,
    );

    expect(link).toEqual({
      sketchRoomId: "sr-1",
      fabricObjectId: "roomplan-1",
      roomName: "Bedroom",
      captureAdapter: "roomplan",
    });
  });

  it("hit-tests serialized Fabric polygons with pathOffset + left/top", () => {
    // Fabric stores points relative to pathOffset; left/top place the object.
    const link = resolveEvidenceRoomLink(
      [
        {
          id: "sr-offset",
          name: "Offset Room",
          geometryJson: {
            left: 200,
            top: 100,
            pathOffset: { x: 50, y: 40 },
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 80 },
              { x: 0, y: 80 },
            ],
            data: { type: "room", label: "Offset Room" },
          },
        },
      ],
      200, // left + (50 - pathOffset.x) = 200 + 0
      100,
    );
    // Centre of room in scene: left+(50-50)=200, top+(40-40)=100 — wait
    // Scene pts: (0-50+200, 0-40+100) = (150, 60) … (250, 140)
    expect(link?.sketchRoomId).toBe("sr-offset");
    expect(
      resolveEvidenceRoomLink(
        [
          {
            id: "sr-offset",
            name: "Offset Room",
            geometryJson: {
              left: 200,
              top: 100,
              pathOffset: { x: 50, y: 40 },
              points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 80 },
                { x: 0, y: 80 },
              ],
            },
          },
        ],
        10,
        10,
      ),
    ).toBeNull();
  });

  it("attaches room names onto evidence pins", () => {
    const pins = attachRoomNamesToPins(
      [
        { id: "p1", sketchRoomId: "r1" },
        { id: "p2", sketchRoomId: null },
        { id: "p3", sketchRoomId: "missing" },
      ],
      [
        { id: "r1", name: "Kitchen" },
        { id: "r2", name: "Bath" },
      ],
    );
    expect(pins[0].roomName).toBe("Kitchen");
    expect(pins[1].roomName).toBeNull();
    expect(pins[2].roomName).toBeNull();
  });
});
