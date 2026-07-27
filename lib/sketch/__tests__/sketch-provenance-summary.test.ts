import { describe, it, expect } from "vitest";
import {
  summarizeSketchProvenance,
  formatProvenanceLegend,
} from "@/lib/sketch/sketch-provenance-summary";

describe("sketch-provenance-summary", () => {
  it("counts LiDAR confirmed, hand-drawn, and pending RoomPlan rooms", () => {
    const summary = summarizeSketchProvenance({
      objects: [
        {
          type: "polygon",
          data: {
            type: "room",
            provenance: "operator_measured",
            captureAdapter: "roomplan",
          },
        },
        {
          type: "polygon",
          data: {
            type: "room",
            provenance: "operator_measured",
          },
        },
        {
          type: "polygon",
          data: {
            type: "room",
            provenance: "underlay_reference",
            captureAdapter: "roomplan",
          },
        },
        {
          type: "polygon",
          data: {
            type: "room",
            provenance: "underlay_reference",
          },
        },
        {
          type: "line",
          data: { type: "wall" },
        },
      ],
    });

    expect(summary).toEqual({
      lidarMeasured: 1,
      handDrawnMeasured: 1,
      lidarPending: 1,
      referenceOther: 1,
    });
  });

  it("formats a compact provenance legend and returns null when empty", () => {
    expect(formatProvenanceLegend({
      lidarMeasured: 0,
      handDrawnMeasured: 0,
      lidarPending: 0,
      referenceOther: 0,
    })).toBeNull();

    expect(
      formatProvenanceLegend({
        lidarMeasured: 2,
        handDrawnMeasured: 1,
        lidarPending: 1,
        referenceOther: 0,
      }),
    ).toBe(
      "Provenance: 2 LiDAR confirmed · 1 hand-drawn · 1 LiDAR pending confirmation (not billed)",
    );
  });
});
