import { describe, expect, it } from "vitest";
import {
  canAcknowledgeAiOwnership,
  getAiOwnershipStatus,
  getAiOwnershipStatusMeta,
  getAiOwnershipSteps,
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

  it("maps lifecycle statuses for badges and steppers", () => {
    expect(getAiOwnershipStatus({})).toBe("no_content");
    expect(
      getAiOwnershipStatus({
        detailedReport: "body",
        aiDraftGeneratedAt: "2026-01-01T00:00:00Z",
        aiDraftHumanEditedAt: null,
      }),
    ).toBe("ai_draft");
    expect(
      getAiOwnershipStatus({
        detailedReport: "body",
        aiDraftGeneratedAt: "2026-01-01T00:00:00Z",
        aiDraftHumanEditedAt: "2026-01-01T02:00:00Z",
      }),
    ).toBe("ready_to_acknowledge");
    expect(
      getAiOwnershipStatus({
        detailedReport: "body",
        reportOwnershipAcknowledgedAt: "2026-01-02T00:00:00Z",
      }),
    ).toBe("owned");
  });

  it("infers list status from stamps without report body", () => {
    expect(
      getAiOwnershipStatus({
        aiDraftGeneratedAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe("ai_draft");
    expect(
      getAiOwnershipStatus({
        reportOwnershipAcknowledgedAt: "2026-01-02T00:00:00Z",
      }),
    ).toBe("owned");
  });

  it("builds four ownership steps with progressive state", () => {
    const steps = getAiOwnershipSteps({
      detailedReport: "body",
      aiDraftGeneratedAt: "2026-01-01T00:00:00Z",
      aiDraftHumanEditedAt: null,
    });
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.id)).toEqual([
      "draft",
      "rewrite",
      "acknowledge",
      "export",
    ]);
    expect(steps[0].state).toBe("complete");
    expect(steps[1].state).toBe("current");
    expect(steps[2].state).toBe("upcoming");
    expect(steps[3].state).toBe("upcoming");
  });

  it("marks export ready only when owned", () => {
    expect(
      getAiOwnershipStatusMeta({
        detailedReport: "body",
        reportOwnershipAcknowledgedAt: "2026-01-02T00:00:00Z",
      }).exportReady,
    ).toBe(true);
    expect(
      getAiOwnershipStatusMeta({
        detailedReport: "body",
        aiDraftGeneratedAt: "2026-01-01T00:00:00Z",
      }).exportReady,
    ).toBe(false);
  });
});
