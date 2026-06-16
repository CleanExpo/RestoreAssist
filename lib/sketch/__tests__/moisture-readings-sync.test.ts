/**
 * RA-6763 pt2 — pin → SketchMoistureReading mapping. Pure, so the drying-log
 * contract is verified deterministically (no DB).
 */
import { describe, expect, it } from "vitest";
import { pinsToMoistureReadingInputs } from "../moisture-readings-sync";

describe("pinsToMoistureReadingInputs", () => {
  it("maps each pin's wme to a source='pin' reading row", () => {
    const rows = pinsToMoistureReadingInputs("sk1", [
      { wme: 18, material: "plasterboard", note: "wet" },
      { wme: 12, material: "timber" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      sketchId: "sk1",
      currentMc: 18,
      source: "pin",
      materialId: null,
      elementId: null,
      targetMc: null,
      waterCategory: null,
      dryStandardMet: false,
    });
    expect(rows[1].currentMc).toBe(12);
  });

  it("never asserts a dry-standard verdict for pin rows", () => {
    const rows = pinsToMoistureReadingInputs("sk1", [{ wme: 8 }]);
    expect(rows[0].dryStandardMet).toBe(false);
    expect(rows[0].targetMc).toBeNull();
    expect(rows[0].source).toBe("pin");
  });

  it("skips pins without a usable numeric reading", () => {
    const rows = pinsToMoistureReadingInputs("sk1", [
      { wme: 15 },
      { material: "timber" }, // no wme
      { wme: Number.NaN },
      { wme: "16" as unknown as number }, // non-number
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].currentMc).toBe(15);
  });

  it("returns [] for non-array / empty input", () => {
    expect(pinsToMoistureReadingInputs("sk1", null)).toEqual([]);
    expect(pinsToMoistureReadingInputs("sk1", undefined)).toEqual([]);
    expect(pinsToMoistureReadingInputs("sk1", [])).toEqual([]);
  });
});
