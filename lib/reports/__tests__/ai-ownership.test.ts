import { describe, expect, it } from "vitest";
import {
  canAcknowledgeAiOwnership,
  isAiDraftPending,
  aiDraftResetOnGenerate,
} from "@/lib/reports/ai-ownership";

describe("ai-ownership helpers", () => {
  it("treats unacknowledged detailedReport as pending draft", () => {
    expect(
      isAiDraftPending({
        detailedReport: "body",
        reportOwnershipAcknowledgedAt: null,
      }),
    ).toBe(true);
  });

  it("clears pending after acknowledgement", () => {
    expect(
      isAiDraftPending({
        detailedReport: "body",
        reportOwnershipAcknowledgedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it("requires human edit before acknowledge", () => {
    const generated = new Date("2026-01-01T00:00:00Z");
    expect(
      canAcknowledgeAiOwnership({
        detailedReport: "body",
        aiDraftGeneratedAt: generated,
        aiDraftHumanEditedAt: null,
        reportOwnershipAcknowledgedAt: null,
      }),
    ).toBe(false);
    expect(
      canAcknowledgeAiOwnership({
        detailedReport: "body",
        aiDraftGeneratedAt: generated,
        aiDraftHumanEditedAt: new Date("2026-01-01T01:00:00Z"),
        reportOwnershipAcknowledgedAt: null,
      }),
    ).toBe(true);
  });

  it("aiDraftResetOnGenerate clears ack and human edit", () => {
    const data = aiDraftResetOnGenerate();
    expect(data.aiDraftGeneratedAt).toBeInstanceOf(Date);
    expect(data.aiDraftHumanEditedAt).toBeNull();
    expect(data.reportOwnershipAcknowledgedAt).toBeNull();
    expect(data.reportOwnershipAcknowledgedBy).toBeNull();
  });
});
