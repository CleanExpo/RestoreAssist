import { describe, expect, it } from "vitest";
import {
  countHomeownerRoomsInSketch,
  sanitizeClientPromotedSketchData,
} from "../sanitize-client-promoted-sketch";
import {
  readAiSuggestedRoomIds,
  readRoomMeasurementEvidence,
} from "../sketch-field-status";

describe("sanitizeClientPromotedSketchData (RA-8241 / RA-8233)", () => {
  it("downgrades client operator_measured rooms to underlay_reference with homeowner adapter", () => {
    const out = sanitizeClientPromotedSketchData({
      objects: [
        {
          data: {
            type: "room",
            id: "home-1",
            provenance: "operator_measured",
            areaM2: 900,
            lengthM: 30,
            widthM: 30,
            captureAdapter: "manual",
            confirmedAt: "2020-01-01T00:00:00.000Z",
            confirmedBy: "forged",
          },
        },
      ],
      raSketchMeta: {
        roomMeasurementEvidence: [
          {
            fabricObjectId: "home-1",
            measuredAreaM2: 900,
            lengthM: 30,
            widthM: 30,
            geometryRevision: "g1",
            recordedBy: "client",
            recordedAt: "2020-01-01T00:00:00.000Z",
            status: "current",
          },
        ],
      },
    });

    expect(out).not.toBeNull();
    const room = (out!.objects as { data: Record<string, unknown> }[])[0].data;
    expect(room.provenance).toBe("underlay_reference");
    expect(room.captureAdapter).toBe("homeowner");
    expect(room.areaM2).toBe(900);
    expect(room.confirmedAt).toBeUndefined();
    expect(readRoomMeasurementEvidence(out)).toEqual([]);
  });

  it("keeps ai_suggested rooms and remembers their ids for the save route", () => {
    const out = sanitizeClientPromotedSketchData({
      objects: [
        {
          data: {
            type: "room",
            id: "ai-suggested-abc",
            provenance: "ai_suggested",
            captureAdapter: "cloud_ai",
            areaM2: 12,
          },
        },
      ],
    });

    const room = (out!.objects as { data: Record<string, unknown> }[])[0].data;
    expect(room.provenance).toBe("ai_suggested");
    expect(readAiSuggestedRoomIds(out)).toEqual(["ai-suggested-abc"]);
  });

  it("countHomeownerRoomsInSketch counts room polygons tagged homeowner", () => {
    const out = sanitizeClientPromotedSketchData({
      objects: [
        { data: { type: "room", id: "h1", provenance: "operator_measured" } },
        { data: { type: "wall", id: "w1" } },
      ],
    });
    expect(countHomeownerRoomsInSketch(out)).toBe(1);
  });
});
