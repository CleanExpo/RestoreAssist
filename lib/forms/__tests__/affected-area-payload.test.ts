// RA-7001 regression: the NIR technician form stores affected-area size in m²
// (its `affectedSquareFootage` state field is a misnomer). These tests guard
// that the submission payload sends that value under the canonical
// `affectedAreaSqm` key, so the /affected-areas route stores it as-is instead of
// shrinking it ~10.76× by treating m² as square feet.
import { describe, it, expect } from "vitest";
import { buildAffectedAreaPayload } from "../affected-area-payload";
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
});
