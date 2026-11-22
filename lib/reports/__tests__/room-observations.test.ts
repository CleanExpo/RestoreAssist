/**
 * RA-7694 acceptance: an intermittent musty odour recorded in one room shows in
 * that room's section of the report PDF. Plus the printing rules.
 */
import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import {
  ROOM_OBSERVATIONS_NOTICE,
  roomObservationGroups,
  roomObservationsOmittedNotice,
  shouldPrintRoomObservations,
  type ReportRoomObservation,
} from "../room-observations";

async function pdfText(data: Parameters<typeof generateIICRCReportPDF>[0]): Promise<string> {
  const bytes = await generateIICRCReportPDF(data, {});
  const parser = new PDFParse({ data: bytes });
  return (await parser.getText()).text;
}

const musty: ReportRoomObservation = {
  roomLabel: "Bedroom 2",
  kind: "ODOUR",
  basis: "OBSERVED",
  odourDescriptor: "musty",
  odourPattern: "INTERMITTENT",
  odourIntensity: 2,
  observedAt: "2026-11-20T01:00:00.000Z",
};

describe("room observation rows", () => {
  it("states an intermittent musty odour with intensity and basis", () => {
    const [g] = roomObservationGroups([musty]);
    expect(g.room).toBe("Bedroom 2");
    expect(g.rows[0][0]).toBe("Odour:");
    expect(g.rows[0][1]).toMatch(/^musty; intermittent; intensity 2 of 3 \(moderate\)\. Observed, /);
  });

  it("groups by room, keeping first-recorded order, ignoring case", () => {
    const groups = roomObservationGroups([
      musty,
      { roomLabel: "Hall", kind: "STAINING", basis: "OBSERVED", surface: "ceiling" },
      { roomLabel: "bedroom 2", kind: "VISIBLE_GROWTH", basis: "OBSERVED", areaM2: 1.5, surface: "wall" },
    ]);
    expect(groups.map((g) => g.room)).toEqual(["Bedroom 2", "Hall"]);
    expect(groups[0].rows.map(([l]) => l)).toEqual(["Odour:", "Visible growth:"]);
    expect(groups[0].rows[1][1]).toMatch(/^on wall; about 1\.5 m2 visible\. Observed/);
  });

  it("never prints a hypothesis as an observation", () => {
    const [g] = roomObservationGroups([
      { roomLabel: "Hall", kind: "VISIBLE_GROWTH", basis: "HYPOTHESISED", surface: "wall" },
    ]);
    expect(g.rows[0][1]).toContain("Hypothesis, not confirmed");
    expect(g.rows[0][1]).not.toMatch(/\bObserved\b/);
  });

  it("prints nothing for no records, and never pads with None", () => {
    expect(shouldPrintRoomObservations([])).toBe(false);
    expect(shouldPrintRoomObservations(null)).toBe(false);
    expect(shouldPrintRoomObservations(undefined)).toBe(false);
    expect(roomObservationGroups([])).toEqual([]);
  });

  it("names a room that has no label rather than dropping the record", () => {
    const [g] = roomObservationGroups([{ roomLabel: "  ", kind: "STAINING", basis: "OBSERVED" }]);
    expect(g.room).toBe("Room not named");
  });

  it("says how many observations a bounded read left out, and nothing when none", () => {
    expect(roomObservationsOmittedNotice(0)).toBeNull();
    expect(roomObservationsOmittedNotice(null)).toBeNull();
    expect(roomObservationsOmittedNotice(1)).toBe("1 further recorded observation is not shown here.");
    expect(roomObservationsOmittedNotice(3)).toBe("3 further recorded observations are not shown here.");
  });

  it("the notice rules out species, diagnosis, condition and clearance", () => {
    expect(ROOM_OBSERVATIONS_NOTICE).toMatch(/not a diagnosis/);
    expect(ROOM_OBSERVATIONS_NOTICE).toMatch(/species/);
    expect(ROOM_OBSERVATIONS_NOTICE).toMatch(/condition or clearance/);
  });
});

describe("report PDF section 6C (RA-7694 acceptance)", () => {
  it("shows the intermittent musty odour under the room name", async () => {
    const text = await pdfText({ id: "ro-fixture", claimType: "WATER", roomObservations: [musty] });
    expect(text).toContain("Room observations");
    expect(text).toContain("Bedroom 2");
    expect(text).toMatch(/musty; intermittent; intensity 2 of 3/);
    expect(text.indexOf("Bedroom 2")).toBeLessThan(text.indexOf("musty; intermittent"));
  }, 30_000);

  it("says in the PDF when recorded observations were left out", async () => {
    const text = await pdfText({
      id: "ro-omitted",
      claimType: "WATER",
      roomObservations: [musty],
      roomObservationsOmitted: 2,
    });
    expect(text).toContain("2 further recorded observations are not shown here.");
  }, 30_000);

  it("prints no such section when nothing was recorded (negative control)", async () => {
    const text = await pdfText({ id: "ro-none", claimType: "WATER", roomObservations: [] });
    expect(text).not.toContain("Room observations");
  }, 30_000);
});
