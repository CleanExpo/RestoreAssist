import { describe, expect, it } from "vitest";
import { aiOwnershipExportFooter } from "@/lib/reports/ai-ownership-footer";

describe("aiOwnershipExportFooter", () => {
  it("mentions rewrite and acknowledge", () => {
    expect(aiOwnershipExportFooter()).toMatch(/rewrite/i);
    expect(aiOwnershipExportFooter()).toMatch(/acknowledge/i);
  });
});
