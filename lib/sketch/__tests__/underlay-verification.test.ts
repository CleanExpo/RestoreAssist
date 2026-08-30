import { describe, expect, it } from "vitest";
import {
  enforceUnverifiedUnderlayProvenance,
  evaluateUnderlayVerification,
} from "@/lib/sketch/underlay-verification";

function completeSketch(provenance = "operator_measured") {
  return {
    raSketchMeta: { fieldComplete: true },
    scaleConfig: {
      pxPerMetre: 80,
      description: "Known wall = 4.2 m",
      pointA: { x: 100, y: 100 },
      pointB: { x: 436, y: 100 },
      realMetres: 4.2,
    },
    objects: [
      { id: "room-1", data: { type: "room", provenance } },
      {
        id: "damage-1",
        data: { type: "damage", provenance: "field_observation" },
      },
    ],
  };
}

describe("underlay verification", () => {
  it("requires field completion and a valid two-point scale", () => {
    expect(
      evaluateUnderlayVerification({
        objects: [
          { data: { type: "room", provenance: "operator_measured" } },
        ],
      }),
    ).toMatchObject({ ok: false });
    expect(
      evaluateUnderlayVerification({
        ...completeSketch(),
        scaleConfig: { pxPerMetre: 0 },
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("two-point"),
    });
  });

  it("accepts completed, calibrated and confirmed room geometry", () => {
    expect(evaluateUnderlayVerification(completeSketch())).toEqual({
      ok: true,
      method: "two_point_scale_and_room_confirmation",
      roomCount: 1,
      pxPerMetre: 80,
      scaleDescription: "Known wall = 4.2 m",
    });
  });

  it("does not accept a room that is still reference-only", () => {
    expect(
      evaluateUnderlayVerification(completeSketch("underlay_reference")),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("confirmed"),
    });
  });

  it("rejects scalar-only calibration and missing structural provenance", () => {
    expect(
      evaluateUnderlayVerification({
        ...completeSketch(),
        scaleConfig: { pxPerMetre: 80, description: "claimed" },
      }),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("endpoints") });
    const sketch = completeSketch();
    sketch.objects[0].data.provenance = "";
    expect(evaluateUnderlayVerification(sketch)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("technician-confirmed"),
    });
  });

  it("forces only structural objects behind the reference firewall", () => {
    const result = enforceUnverifiedUnderlayProvenance({
      objects: [
        { id: "room-1", data: { type: "room", provenance: "field_verified" } },
        { id: "wall-1", data: { type: "wall" } },
        {
          id: "damage-1",
          data: { type: "damage", provenance: "field_observation" },
        },
        {
          id: "equipment-1",
          data: { type: "equipment", provenance: "field_observation" },
        },
      ],
    }) as { objects: Array<{ id: string; data: Record<string, unknown> }> };

    expect(result.objects[0].data.provenance).toBe("underlay_reference");
    expect(result.objects[1].data.provenance).toBe("underlay_reference");
    expect(result.objects[2].data.provenance).toBe("field_observation");
    expect(result.objects[3].data.provenance).toBe("field_observation");
  });
});
