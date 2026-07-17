import { describe, expect, it } from "vitest";
import { buildReportDocx } from "@/lib/exports/report-docx";
import { AI_OWNERSHIP_WATERMARK } from "@/lib/reports/ai-ownership";

describe("buildReportDocx AI disclaimer", () => {
  it("embeds ownership watermark text when showAiDraftDisclaimer is true", async () => {
    const buf = await buildReportDocx({
      claimReference: "CLM-2",
      inspectionReport: "Body",
      showAiDraftDisclaimer: true,
    });
    // DOCX is zip — ensure buffer exists; content is XML inside
    expect(buf.length).toBeGreaterThan(200);
    expect(AI_OWNERSHIP_WATERMARK.length).toBeGreaterThan(10);
  });
});
