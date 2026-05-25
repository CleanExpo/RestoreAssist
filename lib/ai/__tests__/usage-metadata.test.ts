import { describe, expect, it } from "vitest";
import { buildAiUsageMetadata } from "../usage-metadata";

describe("buildAiUsageMetadata", () => {
  it("generates usage metadata from task policy", () => {
    const metadata = buildAiUsageMetadata({
      taskClass: "support_ticket_analysis",
      providerFamily: "anthropic-platform",
      model: "claude-haiku-4-5-20251001",
      tokenUsage: {
        inputTokens: 120,
        outputTokens: 80,
        estimatedCostUsd: 0.001,
      },
      executionMode: "synchronous",
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        blocked: false,
        taskClass: "support_ticket_analysis",
        providerFamily: "anthropic-platform",
        model: "claude-haiku-4-5-20251001",
        maxEstimatedCostUsd: 0.02,
        estimatedCostUsd: 0.001,
        inputTokens: 120,
        outputTokens: 80,
        requiresUsageLogging: true,
        requiresBudgetCheck: false,
        allowsFallback: false,
        tenantContextRequired: false,
        tenantContextStatus: "not_required",
        executionMode: "synchronous",
      }),
    );
  });

  it("returns blocked metadata for missing task policy", () => {
    expect(buildAiUsageMetadata({ taskClass: "unknown" })).toEqual({
      blocked: true,
      reason: "missing_task_policy",
      taskClass: "unknown",
    });
  });

  it("keeps cost estimates optional when token counts are unavailable", () => {
    const metadata = buildAiUsageMetadata({
      taskClass: "support_response_draft",
      providerFamily: "anthropic-platform",
      model: "claude-haiku-4-5-20251001",
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        blocked: false,
        maxEstimatedCostUsd: 0.02,
      }),
    );
    if (!metadata.blocked) {
      expect(metadata.inputTokens).toBeUndefined();
      expect(metadata.outputTokens).toBeUndefined();
      expect(metadata.estimatedCostUsd).toBeUndefined();
    }
  });

  it("marks required tenant context as unavailable when not supplied", () => {
    const metadata = buildAiUsageMetadata({
      taskClass: "fast_classification",
      providerFamily: "anthropic-platform",
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        blocked: false,
        tenantContextRequired: true,
        tenantContextStatus: "unavailable",
        tenantContextUnavailableReason: "tenant context not supplied",
      }),
    );
  });

  it("accepts tenant/account context without provider calls", () => {
    const metadata = buildAiUsageMetadata({
      taskClass: "fast_classification",
      providerFamily: "anthropic-platform",
      tenantContext: {
        workspaceId: "workspace_1",
        memberId: "member_1",
      },
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        blocked: false,
        tenantContextStatus: "present",
        tenantContext: {
          workspaceId: "workspace_1",
          memberId: "member_1",
        },
      }),
    );
  });
});
