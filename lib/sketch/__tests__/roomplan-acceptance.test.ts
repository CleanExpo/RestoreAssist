/**
 * Phase 6 acceptance checklist — automated guards for the RoomPlan path.
 * Hardware field accuracy study is out of band; these tests lock the software
 * acceptance chain so a regression cannot silently drop a required gate.
 */
import { describe, expect, it } from "vitest";
import { prepareRoomPlanSceneIngest } from "../ingest-roomplan";
import {
  confirmRoomPlanMeasurement,
  isRoomPlanPendingConfirm,
  recordRoomPlanExclude,
} from "../roomplan-correction";
import { extractRooms } from "../extract-rooms";
import {
  formatProvenanceLegend,
  summarizeSketchProvenance,
} from "../sketch-provenance-summary";
import {
  hashRoomPlanPayloadBytes,
  serializeRoomPlanPayload,
} from "../roomplan-server-custody";

const SAMPLE = {
  identifier: "scan-1",
  rooms: [
    {
      label: "Kitchen",
      floorPolygon: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 3 },
        { x: 0, z: 3 },
      ],
    },
  ],
  walls: [
    {
      identifier: "w1",
      polygon: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 4, y: 2.4, z: 0 },
        { x: 0, y: 2.4, z: 0 },
      ],
    },
  ],
  doors: [
    {
      identifier: "d1",
      dimensions: { x: 0.82 },
      polygon: [
        { x: 2, z: 0 },
        { x: 2.82, z: 0 },
        { x: 2.82, z: 0.05 },
        { x: 2, z: 0.05 },
      ],
    },
  ],
};

describe("RoomPlan acceptance path (software gates)", () => {
  it("lands rooms pending confirm with walls + doors from the same scan", () => {
    const scene = prepareRoomPlanSceneIngest(SAMPLE);
    expect(scene.rooms).toHaveLength(1);
    expect(scene.walls.length).toBeGreaterThanOrEqual(1);
    expect(scene.openings.length).toBeGreaterThanOrEqual(1);
    expect(isRoomPlanPendingConfirm(scene.rooms[0].data)).toBe(true);
  });

  it("keeps pending LiDAR rooms out of billed extractRooms until confirm", () => {
    const scene = prepareRoomPlanSceneIngest(SAMPLE);
    const fabric = {
      objects: scene.rooms.map((r) => ({
        type: "polygon",
        points: r.points,
        stroke: r.stroke,
        data: r.data,
      })),
    };
    expect(extractRooms(fabric)).toHaveLength(0);

    const confirmed = confirmRoomPlanMeasurement({ ...scene.rooms[0].data });
    fabric.objects[0].data = confirmed as typeof fabric.objects[0]["data"];
    expect(extractRooms(fabric)).toHaveLength(1);
  });

  it("exclude keeps rooms out of measured area after a prior confirm", () => {
    const scene = prepareRoomPlanSceneIngest(SAMPLE);
    let data: Record<string, unknown> = { ...scene.rooms[0].data };
    data = confirmRoomPlanMeasurement(data);
    data = recordRoomPlanExclude(data);
    expect(extractRooms({
      objects: [
        {
          type: "polygon",
          points: scene.rooms[0].points,
          stroke: scene.rooms[0].stroke,
          data,
        },
      ],
    })).toHaveLength(0);
  });

  it("provenance legend reports pending LiDAR honestly", () => {
    const scene = prepareRoomPlanSceneIngest(SAMPLE);
    const line = formatProvenanceLegend(
      summarizeSketchProvenance({
        objects: scene.rooms.map((r) => ({
          type: "polygon",
          data: r.data,
        })),
      }),
    );
    expect(line).toMatch(/LiDAR pending confirmation \(not billed\)/);
  });

  it("server custody hash is stable for the same CapturedRoom", () => {
    const a = hashRoomPlanPayloadBytes(serializeRoomPlanPayload(SAMPLE));
    const b = hashRoomPlanPayloadBytes(serializeRoomPlanPayload(SAMPLE));
    expect(a).toBe(b);
  });
});
