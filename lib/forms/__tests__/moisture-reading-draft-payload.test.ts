/**
 * RA-7610 B2: the NIR draft-save payload must send sketchRoomId so a
 * delete-and-recreate snapshot does not blank a linked reading.
 */
import { describe, expect, it } from "vitest";
import { buildMoistureReadingDraftPayload } from "../moisture-reading-draft-payload";

describe("buildMoistureReadingDraftPayload — RA-7610 room link", () => {
  it("keeps sketchRoomId on a reading linked to a drawn room", () => {
    const payload = buildMoistureReadingDraftPayload(
      {
        location: "Living room",
        surfaceType: "carpet",
        moistureLevel: 22,
        depth: "Surface",
        sketchRoomId: "sr-living",
      },
      { mapX: 0.4, mapY: 0.6 },
    );

    expect(payload.sketchRoomId).toBe("sr-living");
    expect(payload.location).toBe("Living room");
    expect(payload.mapX).toBe(0.4);
    expect(payload.mapY).toBe(0.6);
  });

  it("sends null sketchRoomId for a free-text reading", () => {
    const payload = buildMoistureReadingDraftPayload(
      {
        location: "Subfloor hatch",
        surfaceType: "timber",
        moistureLevel: 19,
        depth: "Surface",
      },
      null,
    );

    expect(payload.sketchRoomId).toBeNull();
  });
});
