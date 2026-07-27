import { describe, expect, it } from "vitest";
import {
  prepareRoomPlanIngest,
  resolveSketchCaptureAdapter,
  sketchDataHasRoomPlan,
} from "../ingest-roomplan";
import type { CapturedRoom } from "../roomplan-to-fabric";

const SAMPLE: CapturedRoom = {
  rooms: [
    {
      label: "Bedroom",
      floorPolygon: [
        { x: 0, z: 0 },
        { x: 3, z: 0 },
        { x: 3, z: 4 },
        { x: 0, z: 4 },
      ],
    },
  ],
};

describe("prepareRoomPlanIngest", () => {
  it("tags rooms operator_measured + captureAdapter roomplan for editor ingest", () => {
    const elements = prepareRoomPlanIngest(SAMPLE);
    expect(elements).toHaveLength(1);
    expect(elements[0].data.provenance).toBe("operator_measured");
    expect(elements[0].data.captureAdapter).toBe("roomplan");
    expect(elements[0].data.type).toBe("room");
    expect(elements[0].label.text).toMatch(/Bedroom/);
  });

  it("returns [] for empty/degenerate captures", () => {
    expect(prepareRoomPlanIngest(null)).toEqual([]);
    expect(prepareRoomPlanIngest({ rooms: [] })).toEqual([]);
  });
});

describe("sketchDataHasRoomPlan / resolveSketchCaptureAdapter", () => {
  it("detects roomplan-tagged Fabric objects in canvas JSON", () => {
    expect(
      sketchDataHasRoomPlan({
        objects: [{ data: { type: "room", captureAdapter: "roomplan" } }],
      }),
    ).toBe(true);
    expect(
      sketchDataHasRoomPlan({
        objects: [{ data: { type: "room", provenance: "operator_measured" } }],
      }),
    ).toBe(false);
  });

  it("resolves adapter: explicit > roomplan detection > previous > manual", () => {
    expect(
      resolveSketchCaptureAdapter({
        sketchData: {},
        explicit: "cloud_ai",
      }),
    ).toBe("cloud_ai");
    expect(
      resolveSketchCaptureAdapter({
        sketchData: {
          objects: [{ data: { captureAdapter: "roomplan" } }],
        },
      }),
    ).toBe("roomplan");
    expect(
      resolveSketchCaptureAdapter({
        sketchData: {},
        previous: "underlay_import",
      }),
    ).toBe("underlay_import");
    expect(resolveSketchCaptureAdapter({ sketchData: {} })).toBe("manual");
  });
});
