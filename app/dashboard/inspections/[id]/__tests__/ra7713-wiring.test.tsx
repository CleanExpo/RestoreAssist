import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// RA-7713: the job page is ~3,500 lines and not rendered in unit tests, so
// these guard that the page feeds the tested components the data that fixes
// each defect. The behaviour itself is tested on the components.
const source = readFileSync(
  join(process.cwd(), "app/dashboard/inspections/[id]/page.tsx"),
  "utf8",
);

describe("RA-7713 job page wiring", () => {
  it("part 9: the environmental card and tab read the array via latestEnvironmentalReading", () => {
    expect(source).toMatch(
      /<EnvironmentalSummary\s+environmentalData=\{inspection\.environmentalData\}/,
    );
    expect(source).toMatch(
      /latestEnvironmentalReading\(\s*data\.inspection\.environmentalData,?\s*\)/,
    );
    expect(source).not.toMatch(/inspection\.environmentalData\.ambientTemperature/);
  });

  it("part 11: readiness is capped by the Field Evidence Checklist's required progress", () => {
    expect(source).toMatch(
      /<FieldEvidenceChecklistPanel[\s\S]{0,120}onRequiredProgress=\{setRequiredEvidence\}/,
    );
    expect(source).toMatch(
      /<InspectionEvidenceReadinessPanel[\s\S]{0,800}requiredEvidence=\{requiredEvidence\}/,
    );
  });
});
