/**
 * RA-8547 — the forensic report PDF must print moisture rows only from saved
 * readings. No placeholder row, no fixed dry standard, no derived WET/DRY.
 */
import { describe, expect, it } from "vitest";
import {
  buildForensicMoistureRows,
  MOISTURE_NOT_RECORDED,
  moistureNotesLines,
  moistureRowsNotShownNote,
  psychrometricRowsNotShownNote,
} from "../forensic-moisture-rows";

describe("buildForensicMoistureRows (RA-8547)", () => {
  it("returns no rows when the job has no saved readings", () => {
    expect(buildForensicMoistureRows({})).toEqual([]);
    expect(
      buildForensicMoistureRows({ moistureReadings: null, tier2Readings: [] }),
    ).toEqual([]);
    expect(buildForensicMoistureRows({ moistureReadings: "not json" })).toEqual(
      [],
    );
  });

  it("builds no rows from AI scope areas alone", () => {
    const rows = buildForensicMoistureRows({
      scopeAreas: [
        { name: "Lounge", materials: ["Carpet"], moisture: 35 },
        { name: "Hall", materials: "Plasterboard", moistureReading: 8 },
      ],
    });
    expect(rows).toEqual([]);
  });

  it("prints 'not recorded' for a reading saved without a dry standard", () => {
    const rows = buildForensicMoistureRows({
      tier2Readings: [
        { location: "Kitchen", material: "Timber", reading: 22, status: "WET" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].dryStandard).toBe(MOISTURE_NOT_RECORDED);
    expect(JSON.stringify(rows)).not.toContain("12%");
  });

  it("keeps a saved dry standard as recorded", () => {
    const rows = buildForensicMoistureRows({
      moistureReadings: JSON.stringify([
        {
          location: "Bed 1",
          material: "Carpet",
          reading: 14,
          dryStandard: "16 WME",
        },
      ]),
    });
    expect(rows[0].dryStandard).toBe("16 WME");
  });

  it("prints no status for a reading saved without one, whatever its value", () => {
    const rows = buildForensicMoistureRows({
      tier2Readings: [
        { location: "Laundry", material: "Plasterboard", reading: 45 },
        { location: "Hall", material: "Plasterboard", reading: 5 },
      ],
    });
    expect(rows.map((r) => r.status)).toEqual([null, null]);
  });

  it("prints no status for an untouched report.moistureReadings row without one", () => {
    const rows = buildForensicMoistureRows({
      moistureReadings: [
        { location: "Ensuite", material: "Tile", reading: 30 },
      ],
    });
    expect(rows[0].status).toBeNull();
    expect(rows[0].dryStandard).toBe(MOISTURE_NOT_RECORDED);
  });

  it("keeps a saved status and a zero reading as recorded", () => {
    const rows = buildForensicMoistureRows({
      tier2Readings: [
        { location: "Study", material: "Timber", reading: 0, status: "DRY" },
      ],
    });
    expect(rows[0]).toEqual({
      location: "Study",
      material: "Timber",
      reading: "0",
      dryStandard: MOISTURE_NOT_RECORDED,
      status: "DRY",
    });
  });
});

describe("moistureRowsNotShownNote (RA-8547 follow-up)", () => {
  it("returns no note when every reading is shown", () => {
    expect(moistureRowsNotShownNote(0)).toBeNull();
    expect(moistureRowsNotShownNote(-2)).toBeNull();
  });

  it("states how many saved readings are not shown", () => {
    expect(moistureRowsNotShownNote(1)).toBe(
      "1 further saved moisture reading is not shown in this table.",
    );
    expect(moistureRowsNotShownNote(3)).toBe(
      "3 further saved moisture readings are not shown in this table.",
    );
  });
});

describe("forensic readings helpers (RA-8548)", () => {
  it("prints a saved unit code as a label, never a derived one", () => {
    const rows = buildForensicMoistureRows({
      moistureReadings: [
        {
          location: "Hall",
          surfaceType: "Timber",
          moistureLevel: 17,
          unit: "WME",
        },
        { location: "Bath", surfaceType: "Tile", moistureLevel: 4 },
      ],
    });
    expect(rows.map((r) => r.reading)).toEqual(["17 WME", "4"]);
  });

  it("declares psychrometric readings the table could not show", () => {
    expect(psychrometricRowsNotShownNote(0)).toBeNull();
    expect(psychrometricRowsNotShownNote(2)).toBe(
      "2 further saved psychrometric readings are not shown in this table.",
    );
  });

  it("keeps every note line that fits and declares a cut", () => {
    const wrap = (text: string) => text.split(" ");
    expect(moistureNotesLines(["a b"], wrap, 6)).toEqual(["a", "b"]);
    expect(moistureNotesLines(["a b c d"], wrap, 3)).toEqual([
      "a",
      "b",
      "The recorded moisture notes continue in the saved tier 2 answer.",
    ]);
    expect(moistureNotesLines([], wrap, 3)).toEqual([]);
  });
});
