import { describe, expect, it } from "vitest";
import { collectRoomsNeedingMeasurement } from "../rooms-needing-measurement";

describe("collectRoomsNeedingMeasurement", () => {
  it("lists ai_suggested and homeowner underlay rooms", () => {
    const rooms = collectRoomsNeedingMeasurement([
      {
        floorLabel: "Ground",
        sketchData: {
          objects: [
            {
              data: {
                type: "room",
                id: "ai-1",
                label: "Bed",
                provenance: "ai_suggested",
              },
            },
            {
              data: {
                type: "room",
                id: "ho-1",
                label: "Kitchen",
                provenance: "underlay_reference",
                captureAdapter: "homeowner",
              },
            },
            {
              data: {
                type: "room",
                id: "ok-1",
                provenance: "operator_measured",
              },
            },
          ],
        },
      },
    ]);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.id).sort()).toEqual(["ai-1", "ho-1"]);
  });
});
