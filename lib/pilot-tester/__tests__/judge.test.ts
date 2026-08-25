import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const assessmentGenerationFindFirst = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const txQueryRaw = vi.hoisted(() => vi.fn());
const receiptFindUnique = vi.hoisted(() => vi.fn());
const receiptFindFirst = vi.hoisted(() => vi.fn());
const receiptCreate = vi.hoisted(() => vi.fn());
const receiptUpdateMany = vi.hoisted(() => vi.fn());
const budgetUpdateMany = vi.hoisted(() => vi.fn());
const budgetFindFirst = vi.hoisted(() => vi.fn());
const createMessage = vi.hoisted(() => vi.fn());
const requireAiTaskPolicy = vi.hoisted(() => vi.fn());
const txWorkspaceFindFirst = vi.hoisted(() => vi.fn());
const txWorkspaceMemberFindFirst = vi.hoisted(() => vi.fn());
const noChargeFindUnique = vi.hoisted(() => vi.fn());
const noChargeCreate = vi.hoisted(() => vi.fn());
const noChargeFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...a: unknown[]) => transaction(...a),
    assessmentGeneration: {
      findFirst: assessmentGenerationFindFirst,
    },
    pilotJudgeReceipt: {},
  },
}));
vi.mock("@/lib/ai/task-policy", () => ({
  requireAiTaskPolicy: (...a: unknown[]) => requireAiTaskPolicy(...a),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: (...a: unknown[]) => createMessage(...a) };
  },
}));

import {
  JUDGE_SYSTEM_PROMPT,
  PILOT_JUDGE_REQUIRED_RUBRIC_MARKERS,
  judgePilotAssessment as judgePilotAssessmentImpl,
  pilotJudgeRubricFailures,
  resolveUnresolvedPilotJudge,
} from "@/lib/pilot-tester/judge";

const judgePilotAssessment = (
  input: Omit<Parameters<typeof judgePilotAssessmentImpl>[0], "actorUserId"> & { actorUserId?: string },
) => judgePilotAssessmentImpl({ actorUserId: "admin-1", ...input });

const originalJudgeKey = process.env.PILOT_TESTER_JUDGE_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PILOT_TESTER_JUDGE_API_KEY = "test-key";
  requireAiTaskPolicy.mockReturnValue({
    allowedProviderFamilies: ["anthropic-premium"],
    requiresTenantContext: true,
    requiresUsageLogging: true,
    requiresBudgetCheck: true,
    allowsFallback: false,
    maxInputTokens: 120_000,
    maxOutputTokens: 400,
    maxEstimatedCostUsd: 2,
  });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      $queryRaw: txQueryRaw,
      workspace: { findFirst: txWorkspaceFindFirst },
      workspaceMember: { findFirst: txWorkspaceMemberFindFirst },
    pilotBudgetReservation: {
      findFirst: budgetFindFirst,
      updateMany: budgetUpdateMany,
    },
      assessmentGeneration: {
        findFirst: assessmentGenerationFindFirst,
      },
      pilotJudgeReceipt: {
        findUnique: receiptFindUnique,
        findFirst: receiptFindFirst,
        create: receiptCreate,
        updateMany: receiptUpdateMany,
      },
      pilotNoChargeApproval: { findUnique: noChargeFindUnique, create: noChargeCreate, findMany: noChargeFindMany },
    }),
  );
  receiptFindUnique.mockResolvedValue(null);
  receiptFindFirst.mockResolvedValue({ costUsd: 2 });
  budgetFindFirst.mockResolvedValue({
    id: "reservation-1", reservedUsd: 5, judgeCostUsd: 0, adjusterCostUsd: 0,
    failedAttemptCostUsd: 0, assessmentGenerations: [], generationReceipts: [], judgeReceipts: [], adjusterReceipts: [],
  });
  receiptCreate.mockResolvedValue({ id: "receipt-1" });
  receiptUpdateMany.mockResolvedValue({ count: 1 });
  budgetUpdateMany.mockResolvedValue({ count: 1 });
  txWorkspaceFindFirst.mockResolvedValue({ ownerId: "admin-1" });
  txWorkspaceMemberFindFirst.mockResolvedValue({ id: "member-1" });
  noChargeFindUnique.mockResolvedValue(null);
  noChargeCreate.mockResolvedValue({ id: "approval-1" });
  noChargeFindMany.mockResolvedValue([{ approvedById: "admin-1", evidenceReference: "provider-ledger:no-event-456" }]);
});

afterEach(() => {
  if (originalJudgeKey === undefined) delete process.env.PILOT_TESTER_JUDGE_API_KEY;
  else process.env.PILOT_TESTER_JUDGE_API_KEY = originalJudgeKey;
});

describe("judgePilotAssessment", () => {
  it("rejects authority revoked after receipt claim but before provider dispatch", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({ pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1" });
    txWorkspaceFindFirst
      .mockResolvedValueOnce({ ownerId: "admin-1" })
      .mockResolvedValue({ ownerId: "different-owner" });
    txWorkspaceMemberFindFirst.mockResolvedValue(null);

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot", inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1", assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-boundary-123",
    })).rejects.toMatchObject({ status: 404, message: "Pilot sandbox workspace not found" });
    expect(receiptCreate).toHaveBeenCalledTimes(1);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("counts unresolved provider maxima as held capacity", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({ pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1" });
    requireAiTaskPolicy.mockReturnValue({
      allowedProviderFamilies: ["anthropic-premium"], requiresTenantContext: true,
      requiresUsageLogging: true, requiresBudgetCheck: true, allowsFallback: false,
      maxInputTokens: 120_000, maxOutputTokens: 400, maxEstimatedCostUsd: 0.02,
    });
    budgetFindFirst.mockResolvedValue({
      id: "reservation-1", reservedUsd: 0.03, judgeCostUsd: 0, adjusterCostUsd: 0,
      failedAttemptCostUsd: 0, assessmentGenerations: [], generationReceipts: [],
      judgeReceipts: [], adjusterReceipts: [{ authorisedMaxCostUsd: 0.02 }],
    });
    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot", inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1", assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-held-123",
    })).rejects.toThrow(/cannot guarantee/);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("counts an in-flight generation maximum before allowing a judge claim", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({ pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1" });
    requireAiTaskPolicy.mockReturnValue({
      allowedProviderFamilies: ["anthropic-premium"], requiresTenantContext: true,
      requiresUsageLogging: true, requiresBudgetCheck: true, allowsFallback: false,
      maxInputTokens: 120_000, maxOutputTokens: 400, maxEstimatedCostUsd: 0.02,
    });
    budgetFindFirst.mockResolvedValue({
      id: "reservation-1", reservedUsd: 0.03, judgeCostUsd: 0, adjusterCostUsd: 0,
      failedAttemptCostUsd: 0, assessmentGenerations: [],
      generationReceipts: [{ authorisedMaxCostUsd: 0.02 }], judgeReceipts: [], adjusterReceipts: [],
    });
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        professionalism: 8, specificity: 8, consistency: 8, actionability: 8, rationale: "Mutant reached provider",
      }) }],
      usage: { input_tokens: 1_000, output_tokens: 200 },
    });
    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot", inspectionId: "inspection-1", assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload), idempotencyKey: "judge-generation-hold-123",
    })).rejects.toThrow(/cannot guarantee/);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("increments accounting for two successful assessment generations", async () => {
    const firstPayload = { assessmentGenerationId: "gen-1" };
    const secondPayload = { assessmentGenerationId: "gen-2" };
    assessmentGenerationFindFirst
      .mockResolvedValueOnce({ pilotArtefactPayload: firstPayload, pilotBudgetReservationId: "reservation-1" })
      .mockResolvedValueOnce({ pilotArtefactPayload: secondPayload, pilotBudgetReservationId: "reservation-1" });
    createMessage
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ professionalism: 8, specificity: 8, consistency: 8, actionability: 8, rationale: "First" }) }],
        usage: { input_tokens: 1_000, output_tokens: 200 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ professionalism: 9, specificity: 9, consistency: 9, actionability: 9, rationale: "Second" }) }],
        usage: { input_tokens: 1_000, output_tokens: 200 },
      });
    await judgePilotAssessment({
      workspaceId: "ws-pilot", inspectionId: "inspection-1", assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(firstPayload), idempotencyKey: "judge-gen-one-123",
    });
    await judgePilotAssessment({
      workspaceId: "ws-pilot", inspectionId: "inspection-1", assessmentGenerationId: "gen-2",
      assessmentSha256: sha256Json(secondPayload), idempotencyKey: "judge-gen-two-123",
    });
    expect(budgetUpdateMany).toHaveBeenCalledTimes(2);
    expect(budgetUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { judgeCostUsd: { increment: 0.002 } } }));
    expect(budgetUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { judgeCostUsd: { increment: 0.002 } } }));
  });
  it("rejects an actor revoked between route validation and the locked receipt claim", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({ pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1" });
    txWorkspaceFindFirst.mockResolvedValue({ ownerId: "different-owner" });
    txWorkspaceMemberFindFirst.mockResolvedValue(null);
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        professionalism: 8, specificity: 8, consistency: 8, actionability: 8, rationale: "Should never be reached",
      }) }],
      usage: { input_tokens: 1_000, output_tokens: 200 },
    });
    await expect(judgePilotAssessment({
      actorUserId: "revoked-admin", workspaceId: "ws-pilot", inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1", assessmentSha256: sha256Json(payload), idempotencyKey: "judge-key-123",
    })).rejects.toMatchObject({ status: 404, code: "PILOT_SANDBOX_NOT_FOUND" });
    expect(receiptCreate).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("refuses a two-cent provider maximum before calling it when only one cent remains", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({ pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1" });
    requireAiTaskPolicy.mockReturnValue({
      allowedProviderFamilies: ["anthropic-premium"], requiresTenantContext: true,
      requiresUsageLogging: true, requiresBudgetCheck: true, allowsFallback: false,
      maxInputTokens: 120_000, maxOutputTokens: 400, maxEstimatedCostUsd: 0.02,
    });
    budgetFindFirst.mockResolvedValue({
      id: "reservation-1", reservedUsd: 0.01, judgeCostUsd: 0, adjusterCostUsd: 0,
      failedAttemptCostUsd: 0, assessmentGenerations: [], generationReceipts: [], judgeReceipts: [], adjusterReceipts: [],
    });
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        professionalism: 8, specificity: 8, consistency: 8, actionability: 8, rationale: "Should never spend",
      }) }],
      usage: { input_tokens: 1_000, output_tokens: 200 },
    });
    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot", inspectionId: "inspection-1", assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload), idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/cannot guarantee/);
    expect(receiptCreate).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("records failed-attempt provider cost before rejecting invalid JSON", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
      usage: { input_tokens: 1_000, output_tokens: 200 },
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/invalid JSON/);

    expect(budgetUpdateMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", workspaceId: "ws-pilot", reconciledAt: null },
      data: { failedAttemptCostUsd: { increment: 0.002 } },
    });
    expect(receiptUpdateMany).toHaveBeenCalledWith({
      where: { id: "receipt-1", workspaceId: "ws-pilot", reservationId: "reservation-1", status: "PENDING" },
      data: expect.objectContaining({
        status: "FAILED",
        costUsd: 0.002,
        errorStatus: 502,
        errorMessage: "Pilot judge provider returned invalid JSON",
      }),
    });
  });

  it("does not record failed-attempt cost before the provider has returned a billable response", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    createMessage.mockRejectedValue(new Error("upstream down"));

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/provider request failed/);

    expect(budgetUpdateMany).not.toHaveBeenCalled();
    expect(receiptUpdateMany).toHaveBeenCalledWith({
      where: { id: "receipt-1", workspaceId: "ws-pilot", reservationId: "reservation-1", status: "PENDING" },
      data: expect.objectContaining({
        status: "UNRESOLVED",
        errorStatus: 502,
        errorMessage: "Pilot judge provider request failed",
      }),
    });
  });

  it("keeps a syntactically valid provider response unresolved when usage is absent", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        professionalism: 10, specificity: 10, consistency: 10, actionability: 10,
        rationale: "A response which must not become free evidence",
      }) }],
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot", inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1", assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/usage or cost evidence is unresolved/);

    expect(budgetUpdateMany).not.toHaveBeenCalled();
    expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING" }),
      data: expect.objectContaining({ status: "UNRESOLVED" }),
    }));
  });

  it("persists a successful judge receipt and records provider cost once", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    createMessage.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        professionalism: 8,
        specificity: 7,
        consistency: 9,
        actionability: 6,
        rationale: "Useful and specific",
      }) }],
      usage: { input_tokens: 1_000, output_tokens: 200 },
    });

    const receipt = await judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    });

    expect(receipt.composite).toBe(75);
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringMatching(/PROFESSIONALISM:[\s\S]*SPECIFICITY:[\s\S]*CONSISTENCY:[\s\S]*ACTIONABILITY:[\s\S]*Use Australian English\./),
      messages: [{ role: "user", content: `Grade this exact assessment JSON:\n${JSON.stringify(payload)}` }],
    }));
    expect(budgetUpdateMany).toHaveBeenCalledTimes(1);
    expect(budgetUpdateMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", workspaceId: "ws-pilot", reconciledAt: null },
      data: { judgeCostUsd: { increment: 0.002 } },
    });
    expect(receiptCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "ws-pilot",
        reservationId: "reservation-1",
        inspectionId: "inspection-1",
        assessmentGenerationId: "gen-1",
        assessmentSha256: sha256Json(payload),
        idempotencyKey: "judge-key-123",
        status: "PENDING",
        leaseExpiresAt: expect.any(Date),
      }),
      select: { id: true },
    });
    expect(receiptUpdateMany).toHaveBeenCalledWith({
      where: { id: "receipt-1", workspaceId: "ws-pilot", reservationId: "reservation-1", status: "PENDING" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        costUsd: 0.002,
        receipt: expect.objectContaining({ composite: 75, costUsd: 0.002 }),
      }),
    });
  });

  it("detects deletion of every required rubric dimension and language rule", () => {
    expect(pilotJudgeRubricFailures(JUDGE_SYSTEM_PROMPT)).toEqual([]);
    for (const marker of PILOT_JUDGE_REQUIRED_RUBRIC_MARKERS) {
      const mutant = JUDGE_SYSTEM_PROMPT.replace(marker, "REMOVED:");
      expect(pilotJudgeRubricFailures(mutant), marker).toContain(marker);
    }
  });

  it("fails closed when the task policy does not authorise the actual provider family", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    requireAiTaskPolicy.mockReturnValue({
      allowedProviderFamilies: ["openai-premium"], requiresTenantContext: true,
      requiresUsageLogging: true, requiresBudgetCheck: true, allowsFallback: false,
      maxInputTokens: 120_000, maxOutputTokens: 400, maxEstimatedCostUsd: 2,
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot", inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1", assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-policy-123",
    })).rejects.toMatchObject({ status: 503 });
    expect(createMessage).not.toHaveBeenCalled();
    expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", errorStatus: 503 }),
    }));
  });

  it("replays a completed idempotency receipt without a second provider call or cost write", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    const stored = {
      professionalism: 8,
      specificity: 8,
      consistency: 8,
      actionability: 8,
      composite: 80,
      rationale: "Stored",
      modelUsed: "claude-haiku-4-5-20251001",
      costUsd: 0.004,
      latencyMs: 25,
    };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    receiptFindUnique.mockResolvedValue({
      workspaceId: "ws-pilot",
      reservationId: "reservation-1",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      status: "SUCCEEDED",
      receipt: stored,
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).resolves.toEqual(stored);

    expect(createMessage).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
    expect(receiptUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects conflicting Idempotency-Key reuse before provider or cost work", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    receiptFindUnique.mockResolvedValue({
      workspaceId: "ws-pilot",
      reservationId: "reservation-1",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: "b".repeat(64),
      status: "SUCCEEDED",
      receipt: {},
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/reused/);

    expect(createMessage).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects an in-flight duplicate before provider or cost work", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    receiptFindUnique.mockResolvedValue({
      workspaceId: "ws-pilot",
      reservationId: "reservation-1",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      status: "PENDING",
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/already in progress/);

    expect(createMessage).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("calls provider and records cost only once when the same key retries during an in-flight call", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    receiptFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        workspaceId: "ws-pilot",
        reservationId: "reservation-1",
        inspectionId: "inspection-1",
        assessmentGenerationId: "gen-1",
        assessmentSha256: sha256Json(payload),
        status: "PENDING",
      });

    let resolveProvider!: (value: unknown) => void;
    const provider = new Promise((resolve) => { resolveProvider = resolve; });
    createMessage.mockReturnValueOnce(provider);

    const request = {
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    };
    const first = judgePilotAssessment(request);
    await vi.waitFor(() => expect(createMessage).toHaveBeenCalledTimes(1));

    await expect(judgePilotAssessment(request)).rejects.toThrow(/already in progress/);
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(budgetUpdateMany).not.toHaveBeenCalled();

    resolveProvider({
      content: [{ type: "text", text: JSON.stringify({
        professionalism: 9,
        specificity: 9,
        consistency: 9,
        actionability: 9,
        rationale: "Strong",
      }) }],
      usage: { input_tokens: 1_000, output_tokens: 200 },
    });
    await expect(first).resolves.toMatchObject({ composite: 90, costUsd: 0.002 });

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(budgetUpdateMany).toHaveBeenCalledTimes(1);
    expect(receiptUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("keeps unresolved provider outcomes non-retryable by the same key before provider or cost work", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    receiptFindUnique.mockResolvedValue({
      workspaceId: "ws-pilot",
      reservationId: "reservation-1",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      status: "UNRESOLVED",
      errorMessage: "Pilot judge provider request failed",
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/provider request failed/);

    expect(createMessage).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects malformed idempotency keys as validation errors", async () => {
    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: "a".repeat(64),
      idempotencyKey: "bad key",
    })).rejects.toMatchObject({ status: 400 });
    expect(assessmentGenerationFindFirst).not.toHaveBeenCalled();
  });

  it("replays a completed generation receipt before policy, provider, or unreconciled gates", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    const stored = {
      professionalism: 10,
      specificity: 10,
      consistency: 10,
      actionability: 10,
      composite: 100,
      rationale: "Stored",
      modelUsed: "claude-haiku-4-5-20251001",
      costUsd: 0.004,
      latencyMs: 25,
    };
    requireAiTaskPolicy.mockImplementation(() => {
      throw new Error("policy should not be consulted for replay");
    });
    receiptFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      workspaceId: "ws-pilot",
      reservationId: "reservation-1",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "different-key-123",
      status: "SUCCEEDED",
      receipt: stored,
      errorStatus: null,
      errorMessage: null,
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "new-key-12345678",
    })).resolves.toEqual(stored);

    expect(assessmentGenerationFindFirst).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("fails before claiming a receipt when the server judge policy is missing", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    assessmentGenerationFindFirst.mockResolvedValue({
      pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    requireAiTaskPolicy.mockImplementation(() => {
      throw new Error("Missing AI task policy");
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).rejects.toMatchObject({ status: 503 });

    expect(receiptCreate).not.toHaveBeenCalled();
    expect(receiptUpdateMany).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a second active receipt for the same generation before provider or cost work", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    receiptFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      workspaceId: "ws-pilot",
      reservationId: "reservation-1",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "different-key-123",
      status: "PENDING",
      receipt: null,
      errorStatus: null,
      errorMessage: null,
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "new-key-12345678",
    })).rejects.toThrow(/already in progress/);

    expect(assessmentGenerationFindFirst).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("revalidates unreconciled and unexpired reservation state under the workspace lock before provider work", async () => {
    assessmentGenerationFindFirst.mockResolvedValue(null);

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: "a".repeat(64),
      idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/unreconciled/);

    expect(assessmentGenerationFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        pilotBudgetReservation: {
          is: expect.objectContaining({
            reconciledAt: null,
            expiresAt: { gt: expect.any(Date) },
          }),
        },
      }),
    }));
    expect(createMessage).not.toHaveBeenCalled();
    expect(receiptCreate).not.toHaveBeenCalled();
  });

  it("rejects corrupt stored composites instead of replaying forged receipts", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] } };
    receiptFindUnique.mockResolvedValue({
      workspaceId: "ws-pilot",
      reservationId: "reservation-1",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      status: "SUCCEEDED",
      receipt: {
        professionalism: 10,
        specificity: 10,
        consistency: 10,
        actionability: 10,
        composite: 90,
        rationale: "Forged",
        modelUsed: "claude-haiku-4-5-20251001",
        costUsd: 0.004,
        latencyMs: 25,
      },
      errorStatus: null,
      errorMessage: null,
    });

    await expect(judgePilotAssessment({
      workspaceId: "ws-pilot",
      inspectionId: "inspection-1",
      assessmentGenerationId: "gen-1",
      assessmentSha256: sha256Json(payload),
      idempotencyKey: "judge-key-123",
    })).rejects.toThrow(/corrupt/);
  });
  it("resolves an ambiguous judge outcome with an exact confirmed charge before releasing reconciliation", async () => {
    receiptFindFirst.mockResolvedValue({ id: "receipt-1", reservationId: "reservation-1", status: "UNRESOLVED", resolutionOutcome: null, authorisedMaxCostUsd: 0.02 });
    await expect(resolveUnresolvedPilotJudge({
      workspaceId: "ws-pilot", receiptId: "receipt-1", outcome: "CHARGED", costUsd: 0.012,
      evidenceReference: "provider-ledger:event-123", actorUserId: "admin-1",
    })).resolves.toMatchObject({ status: "FAILED", resolutionOutcome: "CHARGED" });
    expect(budgetUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { failedAttemptCostUsd: { increment: 0.012 } },
    }));
    expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "receipt-1", status: "UNRESOLVED" },
      data: expect.objectContaining({ status: "FAILED", resolutionOutcome: "CHARGED", resolvedById: "admin-1" }),
    }));
  });

  it("records a confirmed recovery charge above its immutable held maximum as overage", async () => {
    receiptFindFirst.mockResolvedValue({
      id: "receipt-1", reservationId: "reservation-1", status: "UNRESOLVED",
      resolutionOutcome: null, authorisedMaxCostUsd: 0.02,
    });
    await expect(resolveUnresolvedPilotJudge({
      workspaceId: "ws-pilot", receiptId: "receipt-1", outcome: "CHARGED", costUsd: 0.03,
      evidenceReference: "provider-ledger:event-overmax", actorUserId: "admin-1",
    })).resolves.toMatchObject({ status: "OVERAGE" });
    expect(budgetUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { failedAttemptCostUsd: { increment: 0.03 } },
    }));
  });

  it("rechecks current permission under the accounting lock and rejects a revoked actor", async () => {
    receiptFindFirst.mockResolvedValue({ id: "receipt-1", reservationId: "reservation-1", status: "UNRESOLVED", resolutionOutcome: null, authorisedMaxCostUsd: 0.02 });
    txWorkspaceFindFirst.mockResolvedValue({ ownerId: "different-owner" });
    txWorkspaceMemberFindFirst.mockResolvedValue(null);

    await expect(resolveUnresolvedPilotJudge({
      workspaceId: "ws-pilot", receiptId: "receipt-1", outcome: "CHARGED", costUsd: 0.012,
      evidenceReference: "provider-ledger:event-123", actorUserId: "revoked-admin",
    })).rejects.toMatchObject({ status: 404, code: "PILOT_SANDBOX_NOT_FOUND" });
    expect(budgetUpdateMany).not.toHaveBeenCalled();
    expect(receiptUpdateMany).not.toHaveBeenCalled();
  });

  it("requires two distinct current-admin approvals before confirmed-not-charged resolution", async () => {
    receiptFindFirst.mockResolvedValue({ id: "receipt-1", reservationId: "reservation-1", status: "UNRESOLVED", resolutionOutcome: null, authorisedMaxCostUsd: 0.02 });
    await expect(resolveUnresolvedPilotJudge({
      workspaceId: "ws-pilot", receiptId: "receipt-1", outcome: "CONFIRMED_NOT_CHARGED" as never, costUsd: 0,
      evidenceReference: "provider-ledger:no-event-456", actorUserId: "admin-1",
    })).resolves.toMatchObject({ status: "UNRESOLVED", approvalCount: 1 });
    expect(budgetUpdateMany).not.toHaveBeenCalled();
    expect(receiptUpdateMany).not.toHaveBeenCalled();

    noChargeFindMany.mockResolvedValue([
      { approvedById: "admin-1", evidenceReference: "provider-ledger:no-event-456" },
      { approvedById: "admin-2", evidenceReference: "provider-ledger:no-event-456" },
    ]);
    txWorkspaceFindFirst.mockResolvedValue({ ownerId: "admin-2" });
    await expect(resolveUnresolvedPilotJudge({
      workspaceId: "ws-pilot", receiptId: "receipt-1", outcome: "CONFIRMED_NOT_CHARGED", costUsd: 0,
      evidenceReference: "provider-ledger:no-event-456", actorUserId: "admin-2",
    })).resolves.toMatchObject({ status: "NOT_CHARGED" });
    expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "NOT_CHARGED", costUsd: 0, resolvedById: "admin-2" }),
    }));
  });

  it("refuses unsupported zero-cost claims instead of silently releasing an unresolved hold", async () => {
    await expect(resolveUnresolvedPilotJudge({
      workspaceId: "ws-pilot", receiptId: "receipt-1", outcome: "CONFIRMED_NOT_CHARGED" as never, costUsd: 0,
      evidenceReference: "none", actorUserId: "admin-1",
    })).rejects.toMatchObject({ status: 400 });
    expect(receiptUpdateMany).not.toHaveBeenCalled();
  });
});

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
