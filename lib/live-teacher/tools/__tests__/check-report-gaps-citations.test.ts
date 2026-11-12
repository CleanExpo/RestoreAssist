import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    // RA-8327: make-safe rows are read through the list owner.
    makeSafeAction: { findMany: vi.fn() },
    fireSmokeDamageAssessment: { findFirst: vi.fn(async () => null) },
  },
}));

import { S500_FIELD_MAP, standardCite } from "@/lib/nir-standards-mapping";
import { prisma } from "@/lib/prisma";

import { checkReportGaps } from "../check-report-gaps";

// The Sidekick acceptance is a CITED checklist (backlog P0 #2): every gap row
// must carry the IICRC clause that makes it a gap, in the edition-qualified
// form (CLAUDE.md rule 12), sourced from the canonical standards field map.
describe("check_report_gaps clause citations", () => {
  beforeEach(() => {
    vi.mocked(prisma.inspection.findUnique).mockReset();
    // The owner reads rows from the same fixture the inspection read returned.
    vi.mocked(prisma.makeSafeAction.findMany).mockImplementation((async () => {
      const last = vi.mocked(prisma.inspection.findUnique).mock.results.at(-1)?.value;
      const insp = (await last) as { makeSafeActions?: unknown[] } | null | undefined;
      return insp?.makeSafeActions ?? [];
    }) as never);
  });

  it("cites the governing S500 clause on every gap row", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue({
      id: "insp_1",
      moistureReadings: [],
      photos: [],
      scopeItems: [],
      classifications: [],
      makeSafeActions: [
        { action: "water_stopped", applicable: true, completed: false },
      ],
    } as never);

    const { gaps } = await checkReportGaps({ inspectionId: "insp_1" });

    const byField = Object.fromEntries(gaps.map((g) => [g.field, g]));
    expect(byField.moistureReadings.clauseRef).toBe(
      S500_FIELD_MAP.moistureContent.clauseRef,
    );
    expect(byField.photos.clauseRef).toBe(
      S500_FIELD_MAP.photoDocumentation.clauseRef,
    );
    expect(byField.iicrcClassification.clauseRef).toBe(
      S500_FIELD_MAP.waterCategory.clauseRef,
    );
    // §10.6 per the verified section index (initial response / stabilisation);
    // the legacy §5.1 was a mis-citation the section index cannot resolve.
    expect(byField["makeSafe.water_stopped"].clauseRef).toBe(
      standardCite("S500", "10.6"),
    );

    // Every gap is cited and never with the map's not-found sentinel.
    for (const gap of gaps) {
      expect(gap.clauseRef).toBeTruthy();
      expect(gap.clauseRef).not.toBe("Standards reference not found");
      expect(gap.clauseRef).toMatch(/^S\d{3}:\d{4} §/u);
    }
  });

  it("the not-found row cites no clause rather than a bogus one", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(null);

    const { gaps } = await checkReportGaps({ inspectionId: "missing" });

    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe("inspection");
    expect(gaps[0].clauseRef).toBeNull();
  });
});

// RA-8327: the water_stopped gap follows the job's own make-safe list.
describe("check_report_gaps make-safe row follows the job's list", () => {
  beforeEach(() => {
    vi.mocked(prisma.inspection.findUnique).mockReset();
    vi.mocked(prisma.makeSafeAction.findMany).mockImplementation((async () => {
      const last = vi.mocked(prisma.inspection.findUnique).mock.results.at(-1)?.value;
      const insp = (await last) as { makeSafeActions?: unknown[] } | null | undefined;
      return insp?.makeSafeActions ?? [];
    }) as never);
  });

  const base = {
    id: "insp_1",
    moistureReadings: [{ id: "mr" }],
    photos: [{ id: "ph" }],
    scopeItems: [{ id: "si" }],
    classifications: [{ id: "cl" }],
  };

  it("an old open water_stopped row on a fire job is history, not a gap", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue({
      ...base,
      claimType: "FIRE",
      makeSafeActions: [
        { action: "water_stopped", applicable: true, completed: false },
      ],
    } as never);
    const { gaps } = await checkReportGaps({ inspectionId: "insp_1" });
    expect(gaps.map((g) => g.field)).not.toContain("makeSafe.water_stopped");
  });

  it("an open water_stopped row on a water job is a gap", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue({
      ...base,
      claimType: "WATER",
      makeSafeActions: [
        { action: "water_stopped", applicable: true, completed: false },
      ],
    } as never);
    const { gaps } = await checkReportGaps({ inspectionId: "insp_1" });
    expect(gaps.map((g) => g.field)).toContain("makeSafe.water_stopped");
  });
});
