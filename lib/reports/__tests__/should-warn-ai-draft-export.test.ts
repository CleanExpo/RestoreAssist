import { describe, expect, it } from "vitest";
import { shouldWarnAiDraftOnExport } from "@/lib/reports/should-warn-ai-draft-export";

describe("shouldWarnAiDraftOnExport", () => {
  it("is true for pending drafts", () => {
    expect(
      shouldWarnAiDraftOnExport({
        detailedReport: "x",
        reportOwnershipAcknowledgedAt: null,
      }),
    ).toBe(true);
  });
});
