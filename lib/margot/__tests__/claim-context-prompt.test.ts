import { describe, it, expect } from "vitest";
import { formatClaimContextForPrompt } from "../claim-context-prompt";

describe("formatClaimContextForPrompt", () => {
  it("includes blocking gaps", () => {
    const text = formatClaimContextForPrompt({
      context: {
        inspectionId: "i1",
        stage: "DRAFT",
        claimType: "WATER",
        missingFields: ["clientId"],
        wetReadingCount: 2,
        baselineCaptured: false,
        monitoringPointCount: 1,
        completenessHint: "Complete: clientId",
      },
      completeness: {
        facts: [],
        blocking: ["client", "baseline"],
        completionPercent: 40,
      },
    });
    expect(text).toContain("Blocking gaps");
    expect(text).toContain("client, baseline");
  });
});
