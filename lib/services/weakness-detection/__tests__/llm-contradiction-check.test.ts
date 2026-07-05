import { beforeEach, describe, expect, it, vi } from "vitest";

const routeAiRequest = vi.fn();

vi.mock("@/lib/ai/model-router", () => ({
  routeAiRequest: (...args: unknown[]) => routeAiRequest(...args),
}));

import { llmContradictionChecker } from "../llm-contradiction-check";
import type { LlmContradictionCheckInput } from "../llm-contradiction-check";
import type { WeaknessFinding } from "../types";

const causationCandidate: WeaknessFinding = {
  id: "det_1",
  checkClass: "unsupported_causation",
  severity: "P1",
  evidenceAnchor: {
    reportSectionId: "technicianNotes",
    field: "technicianNotes",
    quotedText: "caused by",
  },
  description: 'Cause-attribution phrasing "caused by" has no documented source.',
  suggestedAction: "Document the source of loss or soften the wording.",
  detectionMethod: "deterministic",
};

function baseInput(overrides: Partial<LlmContradictionCheckInput> = {}): LlmContradictionCheckInput {
  return {
    report: {
      technicianNotes: "Ceiling stain caused by a roof leak.",
      recommendations: ["Repaint the ceiling once dry."],
    },
    pendingLlmReview: [
      {
        reportSectionId: "technicianNotes",
        reason: "Causation candidate needs LLM adjudication.",
      },
    ],
    causationCandidates: [causationCandidate],
    apiKey: "workspace-anthropic-key",
    byokModel: "claude-sonnet-4-6",
    ...overrides,
  };
}

beforeEach(() => {
  routeAiRequest.mockReset();
});

describe("llmContradictionChecker.review", () => {
  it("returns a parsed llm finding when the model reports a contradiction", async () => {
    routeAiRequest.mockResolvedValueOnce({
      text: JSON.stringify({
        findings: [
          {
            checkClass: "contradiction",
            severity: "P1",
            reportSectionId: "recommendations",
            field: "recommendations[0]",
            quotedText: "Repaint the ceiling once dry.",
            description:
              "Recommendation to repaint contradicts the note that the area is still wet.",
            suggestedAction: "Reconcile the drying status before recommending repainting.",
          },
        ],
      }),
    });

    const findings = await llmContradictionChecker.review(baseInput());

    expect(routeAiRequest).toHaveBeenCalledTimes(1);
    const [req, config] = routeAiRequest.mock.calls[0];
    expect(req).toMatchObject({ taskType: "weakness_detection" });
    expect(config).toEqual({
      byokModel: "claude-sonnet-4-6",
      byokApiKey: "workspace-anthropic-key",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      checkClass: "contradiction",
      severity: "P1",
      detectionMethod: "llm",
      evidenceAnchor: {
        reportSectionId: "recommendations",
        field: "recommendations[0]",
      },
    });
  });

  it("returns no findings on a clean pass", async () => {
    routeAiRequest.mockResolvedValueOnce({ text: '{"findings":[]}' });

    const findings = await llmContradictionChecker.review(baseInput());

    expect(findings).toEqual([]);
  });

  it("degrades to a single P2 unavailable finding on a malformed response", async () => {
    routeAiRequest.mockResolvedValueOnce({
      text: "Sorry, I can't help with that request.",
    });

    const findings = await llmContradictionChecker.review(baseInput());

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "P2",
      detectionMethod: "llm",
      evidenceAnchor: "unverified/missing",
    });
    expect(findings[0].description).toContain("LLM review unavailable");
  });

  it("degrades to a single P2 unavailable finding when the API call throws", async () => {
    routeAiRequest.mockRejectedValueOnce(new Error("network down"));

    const findings = await llmContradictionChecker.review(baseInput());

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("P2");
    expect(findings[0].description).toContain("LLM review unavailable");
  });

  it("does not spend when nothing was deferred to the LLM", async () => {
    const findings = await llmContradictionChecker.review(
      baseInput({ pendingLlmReview: [], causationCandidates: [] }),
    );

    expect(routeAiRequest).not.toHaveBeenCalled();
    expect(findings).toEqual([]);
  });
});
