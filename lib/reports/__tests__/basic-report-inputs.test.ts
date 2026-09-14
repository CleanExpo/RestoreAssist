import { describe, expect, it } from "vitest";
import { BASIC_REPORT_INPUTS_NOTE } from "@/lib/reports/basic-report-inputs";

describe("Basic report input honesty", () => {
  it("does not demand photos or IN_PROGRESS for Basic", () => {
    expect(BASIC_REPORT_INPUTS_NOTE).toMatch(/optional for Basic/i);
    expect(BASIC_REPORT_INPUTS_NOTE).toMatch(/Quick Fill/i);
    expect(BASIC_REPORT_INPUTS_NOTE).not.toMatch(/photos are required/i);
    expect(BASIC_REPORT_INPUTS_NOTE).not.toMatch(/must be IN_PROGRESS/i);
  });
});
