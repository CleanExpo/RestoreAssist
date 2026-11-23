import { describe, expect, it } from "vitest";
import {
  buildInvestigationOverlay,
  findUnsupportedConditionWording,
  isSketchViewMode,
  SUPPORTED_PATHWAY_KINDS,
  UNASSIGNED_ROOM_LABEL,
  VALUE_BASIS_LABEL,
  type BuildInvestigationOverlayInput,
} from "@/lib/sketch/investigation-overlay";
import type { DamageMarker } from "@/lib/sketch/damage-markers";

const W = 1000;
const H = 800;

function marker(p: Partial<DamageMarker> = {}): DamageMarker {
  return {
    id: "m1",
    type: "water_cat1",
    severity: "moderate",
    room_label: "Kitchen",
    x: 100,
    y: 100,
    ...p,
  };
}

function input(
  p: Partial<BuildInvestigationOverlayInput> = {},
): BuildInvestigationOverlayInput {
  return {
    moisturePins: [],
    damageMarkers: [],
    evidencePins: [],
    width: W,
    height: H,
    ...p,
  };
}

/** Every human-readable string the overlay produces. */
function allText(o: ReturnType<typeof buildInvestigationOverlay>): string[] {
  return [
    o.source.note,
    o.pathways.note,
    ...o.receptors.map((r) => r.roomLabel),
    ...o.observations.flatMap((ob) => [
      ob.title,
      ob.roomLabel,
      ...ob.gaps,
      ...ob.values.map((v) => `${v.label} ${v.value}`),
    ]),
  ];
}

describe("buildInvestigationOverlay", () => {
  it("returns an empty, honest overlay for an empty floor", () => {
    const o = buildInvestigationOverlay(input());
    expect(o.observations).toEqual([]);
    expect(o.receptors).toEqual([]);
    expect(o.source.status).toBe("not_recorded");
    expect(o.pathways.status).toBe("not_recorded");
    expect(o.gapCount).toBe(0);
  });

  it("binds each observation back to its owning record id", () => {
    const o = buildInvestigationOverlay(
      input({
        moisturePins: [
          { id: "p1", x: 10, y: 10, wme: 28, material: "timber", iicrClass: 3 },
        ],
        damageMarkers: [marker()],
        evidencePins: [{ id: "e1", kind: "photo", x: 500, y: 500 }],
      }),
    );
    expect(o.observations.map((ob) => ob.id)).toEqual([
      "instrument_reading:p1",
      "technician_marker:m1",
      "photo:e1",
    ]);
    expect(o.observations.map((ob) => ob.sourceRecordId)).toEqual([
      "p1",
      "m1",
      "e1",
    ]);
  });

  it("labels the WME reading observed and the derived class calculated", () => {
    const o = buildInvestigationOverlay(
      input({
        moisturePins: [
          { id: "p1", x: 10, y: 10, wme: 28, material: "timber", iicrClass: 3 },
        ],
      }),
    );
    const values = o.observations[0].values;
    expect(values.find((v) => v.label === "WME")?.basis).toBe("observed");
    expect(values.find((v) => v.label === "Moisture class")?.basis).toBe(
      "calculated",
    );
  });

  it("states missing instrument and calibration evidence as gaps", () => {
    const o = buildInvestigationOverlay(
      input({
        moisturePins: [
          { id: "p1", x: 10, y: 10, wme: 28, material: "timber", iicrClass: 3 },
        ],
      }),
    );
    expect(o.observations[0].gaps).toEqual(
      expect.arrayContaining([
        "Instrument identity not recorded",
        "Calibration check not recorded",
      ]),
    );
    expect(o.gapCount).toBe(o.observations[0].gaps.length);
  });

  it("flags a damage marker with no nearby photo, and clears it when one is close", () => {
    const alone = buildInvestigationOverlay(
      input({ damageMarkers: [marker()] }),
    );
    expect(alone.observations[0].gaps).toContain(
      "No photo pinned near this marker",
    );

    const covered = buildInvestigationOverlay(
      input({
        damageMarkers: [marker()],
        evidencePins: [{ id: "e1", kind: "photo", x: 120, y: 110, caption: "Kick board" }],
      }),
    );
    expect(covered.observations[0].gaps).toEqual([]);
  });

  it("uses normalised coordinates over legacy pixels when present", () => {
    const o = buildInvestigationOverlay(
      input({ damageMarkers: [marker({ x: 1, y: 1, nx: 0.5, ny: 0.25 })] }),
    );
    expect(o.observations[0].sceneX).toBe(500);
    expect(o.observations[0].sceneY).toBe(200);
  });

  it("groups receptors by room and keeps location when no room is drawn", () => {
    const o = buildInvestigationOverlay(
      input({
        moisturePins: [
          { id: "p1", x: 10, y: 10, wme: 28, material: "timber", iicrClass: 3 },
          { id: "p2", x: 900, y: 700, wme: 15, material: "gypsum", iicrClass: 1 },
        ],
        damageMarkers: [marker({ id: "m2" })],
        resolveRoomLabel: (x) => (x < 500 ? "Kitchen" : ""),
      }),
    );
    const kitchen = o.receptors.find((r) => r.roomLabel === "Kitchen");
    expect(kitchen?.observationIds.sort()).toEqual([
      "instrument_reading:p1",
      "technician_marker:m2",
    ]);
    expect(
      o.receptors.find((r) => r.roomLabel === UNASSIGNED_ROOM_LABEL)
        ?.observationIds,
    ).toEqual(["instrument_reading:p2"]);
  });

  it("never treats a photo alone as a receptor", () => {
    const o = buildInvestigationOverlay(
      input({ evidencePins: [{ id: "e1", kind: "photo", x: 1, y: 1 }] }),
    );
    expect(o.observations).toHaveLength(1);
    expect(o.receptors).toEqual([]);
  });

  it("ignores non-photo evidence pins and non-finite readings", () => {
    const o = buildInvestigationOverlay(
      input({
        moisturePins: [
          { id: "p1", x: 1, y: 1, wme: Number.NaN, material: "timber", iicrClass: 1 },
        ],
        evidencePins: [{ id: "v1", kind: "voice", x: 1, y: 1 }],
      }),
    );
    expect(o.observations).toEqual([]);
  });

  it("never infers a source or a pathway from pin positions", () => {
    const o = buildInvestigationOverlay(
      input({
        moisturePins: [
          { id: "p1", x: 10, y: 10, wme: 40, material: "timber", iicrClass: 4 },
          { id: "p2", x: 20, y: 10, wme: 12, material: "timber", iicrClass: 1 },
        ],
        damageMarkers: [marker({ type: "water_cat3" })],
      }),
    );
    expect(o.source.status).toBe("not_recorded");
    expect(o.pathways.status).toBe("not_recorded");
  });

  it("marks a water-only floor and emits no microbial wording for it", () => {
    const o = buildInvestigationOverlay(
      input({
        damageMarkers: [marker()],
        moisturePins: [
          { id: "p1", x: 10, y: 10, wme: 28, material: "timber", iicrClass: 3 },
        ],
      }),
    );
    expect(o.waterOnly).toBe(true);
    for (const t of allText(o)) {
      expect(t).not.toMatch(/mould|microbial|spore|fung/i);
    }
  });

  it("does not mark a floor water-only once a mould marker exists", () => {
    const o = buildInvestigationOverlay(
      input({ damageMarkers: [marker({ type: "mould" })] }),
    );
    expect(o.waterOnly).toBe(false);
  });

  it("never generates safe, clearance or health-risk wording itself", () => {
    const o = buildInvestigationOverlay(
      input({
        damageMarkers: [marker({ type: "mould", severity: "low" })],
        moisturePins: [
          { id: "p1", x: 10, y: 10, wme: 9, material: "timber", iicrClass: 1 },
        ],
        evidencePins: [{ id: "e1", kind: "photo", x: 10, y: 10 }],
      }),
    );
    for (const t of allText(o)) {
      expect(findUnsupportedConditionWording(t)).toEqual([]);
    }
  });

  it("flags unsupported 'safe' wording in technician notes and captions", () => {
    const o = buildInvestigationOverlay(
      input({
        damageMarkers: [marker({ notes: "Area is safe to reoccupy" })],
        evidencePins: [
          { id: "e1", kind: "photo", x: 900, y: 700, caption: "Mould-free after clean" },
        ],
      }),
    );
    expect(o.observations[0].flaggedWording).toContain("safe");
    expect(o.observations[1].flaggedWording).toContain("mould-free");
  });
});

describe("findUnsupportedConditionWording", () => {
  it.each([
    "safe",
    "cleared",
    "clearance achieved",
    "no health risk",
    "health risk is low",
    "spore dose",
  ])("flags %s", (text) => {
    expect(findUnsupportedConditionWording(text).length).toBeGreaterThan(0);
  });

  it.each(["Wet skirting, east wall", "Staining on plasterboard", "safety glasses worn"])(
    "does not flag %s",
    (text) => {
      expect(findUnsupportedConditionWording(text)).toEqual([]);
    },
  );
});

describe("vocabulary", () => {
  it("fixes the pathway kinds and basis labels", () => {
    expect([...SUPPORTED_PATHWAY_KINDS]).toEqual([
      "liquid",
      "vapour",
      "air",
      "heat",
      "particle",
    ]);
    expect(VALUE_BASIS_LABEL).toEqual({
      observed: "Observed",
      calculated: "Calculated",
      illustrated: "Illustrated",
    });
    expect(isSketchViewMode("investigation")).toBe(true);
    expect(isSketchViewMode("assembly")).toBe(false);
  });
});
