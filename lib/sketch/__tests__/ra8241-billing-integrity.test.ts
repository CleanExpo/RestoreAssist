/**
 * RA-8241 — forged promote → authoritative sketch bills zero until measured.
 */
import { describe, expect, it } from "vitest";
import { sanitizeClientPromotedSketchData } from "../sanitize-client-promoted-sketch";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import { measuredSketchData } from "../measured-sketch-data";

describe("RA-8241 billing integrity", () => {
  it("sanitized homeowner blob yields zero billable m²", () => {
    const sanitized = sanitizeClientPromotedSketchData({
      scaleConfig: { pxPerMetre: 100 },
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 300, y: 0 },
            { x: 300, y: 300 },
            { x: 0, y: 300 },
          ],
          data: {
            type: "room",
            id: "h1",
            provenance: "operator_measured",
            areaM2: 500,
            captureAdapter: "manual",
          },
        },
      ],
    });
    expect(sanitized).not.toBeNull();
    const estimate = extractSketchEstimate([
      {
        floorLabel: "Ground",
        sketchData: measuredSketchData(sanitized!),
        equipmentPoints: null,
        moisturePoints: null,
        savedRooms: null,
      },
    ]);
    expect(estimate.totalRoomAreaM2).toBe(0);
    const room = (sanitized!.objects as { data: Record<string, unknown> }[])[0]
      .data;
    expect(room.areaM2).toBe(9);
    expect(room.captureAdapter).toBe("homeowner");
  });
});
