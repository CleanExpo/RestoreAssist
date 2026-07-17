import { describe, expect, it } from "vitest";
import { isAiDraftPending } from "@/lib/reports/ai-ownership-public";

describe("ai-ownership-public barrel", () => {
  it("re-exports isAiDraftPending", () => {
    expect(
      isAiDraftPending({
        detailedReport: "x",
        reportOwnershipAcknowledgedAt: null,
      }),
    ).toBe(true);
  });
});
