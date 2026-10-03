// RA-7001 regression: the NIR technician form stores affected-area size in m²
// (its `affectedSquareFootage` state field is a misnomer). These tests guard
// that the submission payload sends that value under the canonical
// `affectedAreaSqm` key, so the /affected-areas route stores it as-is instead of
// shrinking it ~10.76× by treating m² as square feet.
import { describe, it, expect } from "vitest";
import { buildAffectedAreaPayload, hydrateAffectedAreaDraft } from "../affected-area-payload";
import { deriveAreaColumns, sqmToSqft } from "@/lib/units";

const entry = (affectedSquareFootage: number) => ({
  roomZoneId: "Bathroom",
  affectedSquareFootage, // metric: holds m²
  waterSource: "Category 3",
  timeSinceLoss: 48,
  length: 4,
  width: 3,
  height: 2.7,
  materials: ["Carpet", "Underlay"],
});

describe("buildAffectedAreaPayload — NIR affected-area submission (RA-7001)", () => {
  it("submits the m² area under the canonical affectedAreaSqm key", () => {
    const payload = buildAffectedAreaPayload(entry(12));
    expect(payload.affectedAreaSqm).toBe(12);
    // The deprecated sq-ft key must not carry the raw m² value — the route
    // derives it. A stray sq-ft key here would re-trigger the shrink bug.
    expect(
      (payload as Record<string, unknown>).affectedSquareFootage,
    ).toBeUndefined();
  });

  it("round-trips through the route's deriveAreaColumns: 20 m² in → 20 m² stored", () => {
    const cols = deriveAreaColumns(buildAffectedAreaPayload(entry(20)));
    expect(cols).not.toBeNull();
    expect(cols!.affectedAreaSqm).toBe(20);
    // Deprecated sq-ft column stays consistent for the IICRC engine (≈215.28).
    expect(cols!.affectedSquareFootage).toBeCloseTo(sqmToSqft(20), 9);
  });

  it("keeps a 12 m² Cat-3 area above the 10 m² SafeWork mould-notification threshold", () => {
    // Before the fix this collapsed to ~1.11 m² and suppressed the WHS gate.
    const cols = deriveAreaColumns(buildAffectedAreaPayload(entry(12)));
    expect(cols!.affectedAreaSqm).toBeGreaterThanOrEqual(10);
  });

  it("retains a stable row ID and the distinct room label in a draft snapshot", () => {
    const payload = buildAffectedAreaPayload({
      ...entry(12),
      id: "7df236bb-358c-413f-95ed-86a8a648c4f0",
      roomZoneId: "Bedroom 4",
    });
    expect(payload.id).toBe("7df236bb-358c-413f-95ed-86a8a648c4f0");
    expect(payload.roomZoneId).toBe("Bedroom 4");
  });

  it("rehydrates its own description and metric area on reload", () => {
    const draft = hydrateAffectedAreaDraft({
      id: "area_12345678",
      roomZoneId: "Living Room — Rear Lounge",
      affectedAreaSqm: 12,
      affectedSquareFootage: sqmToSqft(12),
      waterSource: "Clean Water",
      timeSinceLoss: null,
      description: "Dimensions: 4m × 3m × 2.7m. Materials: Carpet, Underlay",
    });
    expect(draft).toMatchObject({
      id: "area_12345678",
      roomType: "Living Room",
      affectedSquareFootage: 12,
      length: 4,
      width: 3,
      height: 2.7,
      materials: ["Carpet", "Underlay"],
      timeSinceLoss: null,
    });
  });

  it("converts an old square-foot row and leaves unknown materials unknown", () => {
    const draft = hydrateAffectedAreaDraft({
      id: "area_12345678",
      roomZoneId: "Front Lounge",
      affectedSquareFootage: sqmToSqft(20),
      waterSource: "Clean Water",
      description: "Historical free text",
    });
    expect(draft.affectedSquareFootage).toBeCloseTo(20, 9);
    expect(draft.roomType).toBe("Other");
    expect(draft.materials).toEqual([]);
    expect(draft.length).toBe(0);
    const payload = buildAffectedAreaPayload(draft);
    expect(payload).not.toHaveProperty("description");
    expect(payload).not.toHaveProperty("height");
  });

  it("omits an untouched overlong historical note so draft save retains it in place", () => {
    const draft = hydrateAffectedAreaDraft({
      id: "area_12345678",
      roomZoneId: "Bedroom",
      affectedAreaSqm: 20,
      waterSource: "Clean Water",
      description: "N".repeat(2050),
    });
    const payload = buildAffectedAreaPayload(draft);
    expect(payload.id).toBe("area_12345678");
    expect(payload).not.toHaveProperty("description");
  });

  it("keeps a historical note while adding verified dimensions in place", () => {
    const draft = hydrateAffectedAreaDraft({
      id: "area_12345678",
      roomZoneId: "Front Lounge",
      affectedAreaSqm: 20,
      waterSource: "Clean Water",
      description: "Historic client note",
    });
    const edited = {
      ...draft,
      length: 5,
      width: 4,
      height: 2.7,
      materials: ["Carpet"],
      detailsKnown: true,
    };
    const saved = buildAffectedAreaPayload(edited);
    expect(saved.id).toBe("area_12345678");
    expect(saved.description).toBe(
      "Dimensions: 5m × 4m × 2.7m. Materials: Carpet\n\nOriginal note: Historic client note",
    );
    const reopened = hydrateAffectedAreaDraft({
      ...draft,
      description: saved.description,
    });
    expect(reopened).toMatchObject({
      id: "area_12345678",
      length: 5,
      width: 4,
      height: 2.7,
      materials: ["Carpet"],
      originalDescription: "Historic client note",
      detailsKnown: true,
    });
    expect(buildAffectedAreaPayload(reopened).description).toBe(saved.description);
  });
});
