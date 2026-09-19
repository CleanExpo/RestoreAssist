import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASIC_REPORT_INPUTS_NOTE } from "@/lib/reports/basic-report-inputs";
import {
  FORBIDDEN_PREREQUISITE_CLAIMS,
  findPrerequisiteClaims,
} from "./prerequisite-claims";

// The RA-7550 sources that tell a user what Basic needs before Generate.
// prerequisite-copy-contract.test.ts holds the closed-world check for them.
const BASIC_COPY_SOURCES = [
  "lib/reports/basic-report-inputs.ts",
  "components/initial-data-entry/ReportTypeSelection.tsx",
  "components/InspectionReportViewer.tsx",
  "components/InitialDataEntryForm.tsx",
  "data/content/help/reports/first-ai-report.mdx",
  "data/content/help/getting-started/first-inspection.mdx",
];

describe("Basic report input honesty", () => {
  it("does not demand photos or IN_PROGRESS for Basic", () => {
    expect(BASIC_REPORT_INPUTS_NOTE).toBe(
      "Basic reports need client name, address, postcode, and the technician field report. Photos and an in-progress inspection status are optional for Basic. Quick Fill can populate those fields.",
    );
    expect(findPrerequisiteClaims(BASIC_REPORT_INPUTS_NOTE)).toEqual([]);
  });

  it.each(BASIC_COPY_SOURCES)(
    "%s makes no photo or IN_PROGRESS prerequisite claim",
    (rel) => {
      const text = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(findPrerequisiteClaims(text), rel).toEqual([]);
    },
  );

  it("the forbidden list catches each known regression", () => {
    const regressions = [
      "Photos are required and inspection must be IN_PROGRESS for Basic.",
      "Basic requires an inspection in IN_PROGRESS status.",
      "Basic requires an inspection in `IN_PROGRESS` status.",
      "You need at least 4 photos before Generate.",
      "Generate stays disabled until photos are attached.",
      "The inspection must be in progress.",
      "Photos\n            are required for Basic.",
    ];
    for (const r of regressions) {
      expect(findPrerequisiteClaims(r), r).not.toEqual([]);
    }
    // The true negative copy must stay allowed.
    expect(
      findPrerequisiteClaims(
        "Basic does not require photos or an `IN_PROGRESS` status.",
      ),
    ).toEqual([]);
    expect(FORBIDDEN_PREREQUISITE_CLAIMS.length).toBeGreaterThan(0);
  });
});
