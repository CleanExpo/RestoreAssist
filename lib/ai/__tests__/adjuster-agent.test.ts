/**
 * RA-1131: Unit tests for adjuster-agent — runAdjusterAgent
 *
 * AI client and Prisma are mocked — no real API calls or DB access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const receiptFindUnique = vi.hoisted(() => vi.fn());
const receiptFindFirst = vi.hoisted(() => vi.fn());
const receiptCreate = vi.hoisted(() => vi.fn());
const receiptUpdateMany = vi.hoisted(() => vi.fn());
const budgetUpdateMany = vi.hoisted(() => vi.fn());
const budgetFindFirst = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const requirePilotWorkspace = vi.hoisted(() => vi.fn());
const requirePilotWorkspaceActorInTransaction = vi.hoisted(() => vi.fn());
const withPilotWorkspaceProviderAuthority = vi.hoisted(() => vi.fn());
const MockPilotContractError = vi.hoisted(() => class extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
});
const requireAiTaskPolicy = vi.hoisted(() => vi.fn());

// ── Mock Prisma ───────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: vi.fn(),
    },
    assessmentGeneration: { findFirst: vi.fn() },
    pilotAdjusterReceipt: { updateMany: receiptUpdateMany },
    $transaction: transaction,
  },
}));

// ── Mock restoreassist-ai-client ──────────────────────────────────────────────

vi.mock("@/lib/ai/restoreassist-ai-client", () => ({
  restoreAssistAiDispatch: vi.fn(),
}));
vi.mock("@/lib/pilot-tester/budget-contract", () => ({
  requirePilotWorkspace,
  requirePilotWorkspaceActorInTransaction,
  withPilotWorkspaceProviderAuthority,
  PilotContractError: MockPilotContractError,
}));
vi.mock("@/lib/ai/task-policy", () => ({ requireAiTaskPolicy }));

import { prisma } from "@/lib/prisma";
import { restoreAssistAiDispatch } from "@/lib/ai/restoreassist-ai-client";
import { resolveUnresolvedPilotAdjuster, runAdjusterAgent } from "@/lib/ai/adjuster-agent";

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockDispatch = restoreAssistAiDispatch as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.inspection.findUnique as ReturnType<typeof vi.fn>;
const mockFindGeneration = prisma.assessmentGeneration.findFirst as ReturnType<typeof vi.fn>;

function makeInspection(
  overrides: Partial<ReturnType<typeof baseInspection>> = {},
) {
  return { ...baseInspection(), ...overrides };
}

function baseInspection() {
  return {
    id: "insp-001",
    inspectionNumber: "NIR-2026-04-0001",
    propertyAddress: "12 Main St, Sydney NSW 2000",
    propertyPostcode: "2000",
    status: "COMPLETED",
    inspectionDate: new Date("2026-04-01"),
    makeSafeActions: [
      { action: "water_stopped", applicable: true, completed: true },
      { action: "power_isolated", applicable: true, completed: true },
    ],
    scopeVariations: [],
    moistureReadings: [
      {
        location: "Lounge",
        surfaceType: "drywall",
        moistureLevel: 25,
        createdAt: new Date("2026-04-01"),
      },
      {
        location: "Lounge",
        surfaceType: "drywall",
        moistureLevel: 20,
        createdAt: new Date("2026-04-02"),
      },
      {
        location: "Lounge",
        surfaceType: "drywall",
        moistureLevel: 16,
        createdAt: new Date("2026-04-03"),
      },
      {
        location: "Lounge",
        surfaceType: "drywall",
        moistureLevel: 13,
        createdAt: new Date("2026-04-04"),
      },
    ],
    costEstimates: [
      { category: "Labor", description: "Drying technician", subtotal: 800 },
      {
        category: "Equipment",
        description: "Dehumidifier hire",
        subtotal: 400,
      },
    ],
  };
}

function aiJson(recommendation: string, extras?: object): string {
  return JSON.stringify({
    recommendation,
    findings: [
      {
        code: "MAKE_SAFE_OK",
        description: "All stabilisation actions complete",
        severity: "info",
      },
    ],
    clauseCompliance: [
      {
        citation: "ANSI/IICRC S500:2021 §4.1",
        status: "compliant",
        note: "Cat 1 clean water",
      },
      { citation: "ANSI/IICRC S500:2021 §5.1", status: "compliant" },
      {
        citation: "ANSI/IICRC S500:2021 §7.1",
        status: "compliant",
        note: "Drying targets met",
      },
      { citation: "ANSI/IICRC S500:2021 §8", status: "compliant" },
    ],
    anomalies: [],
    costReasonableness: "within-range",
    suggestedQuestions: [],
    ...extras,
  });
}

function mockAiResponse(text: string) {
  mockDispatch.mockResolvedValueOnce({
    text,
    model: "gemma-4-31b-it",
    tier: "restoreassist",
    fellBackToBYOK: false,
    durationMs: 500,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  receiptFindUnique.mockImplementation((query: { where?: { id?: string } }) =>
    query.where?.id ? Promise.resolve({ workspaceId: "ws-pilot", costUsd: 2 }) : Promise.resolve(null));
  receiptCreate.mockResolvedValue({ id: "adjuster-receipt-1" });
  receiptUpdateMany.mockResolvedValue({ count: 1 });
  budgetUpdateMany.mockResolvedValue({ count: 1 });
  budgetFindFirst.mockResolvedValue({
    id: "reservation-1", reservedUsd: 5, judgeCostUsd: 0, adjusterCostUsd: 0,
    failedAttemptCostUsd: 0, assessmentGenerations: [], judgeReceipts: [], adjusterReceipts: [],
  });
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    $queryRaw: vi.fn(),
    pilotAdjusterReceipt: { findUnique: receiptFindUnique, findFirst: receiptFindFirst, create: receiptCreate, updateMany: receiptUpdateMany },
    pilotBudgetReservation: { findFirst: budgetFindFirst, updateMany: budgetUpdateMany },
  }));
  requirePilotWorkspace.mockResolvedValue({ id: "ws-pilot" });
  requirePilotWorkspaceActorInTransaction.mockResolvedValue(undefined);
  withPilotWorkspaceProviderAuthority.mockImplementation(async (_actor: string, _workspace: string, operation: () => Promise<unknown>) => operation());
  requireAiTaskPolicy.mockReturnValue({ maxEstimatedCostUsd: 2 });
});

it("rejects authority revoked after receipt claim but before provider dispatch", async () => {
  const payload = { assessmentGenerationId: "gen-1" };
  const assessmentSha256 = createHash("sha256").update('{"assessmentGenerationId":"gen-1"}').digest("hex");
  mockFindGeneration.mockResolvedValue({
    id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
  });
  mockFindUnique.mockResolvedValueOnce(makeInspection());
  withPilotWorkspaceProviderAuthority.mockRejectedValueOnce(
    new MockPilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "workspace authority revoked at provider boundary"),
  );

  await expect(runAdjusterAgent("insp-001", {
    assessmentGenerationId: "gen-1", assessmentSha256, workspaceId: "ws-pilot", actorUserId: "revoked-admin",
  })).rejects.toThrow(/revoked at provider boundary/);
  expect(receiptCreate).toHaveBeenCalledTimes(1);
  expect(mockDispatch).not.toHaveBeenCalled();
});

it("counts unresolved provider maxima as held capacity", async () => {
  const payload = { assessmentGenerationId: "gen-1" };
  const assessmentSha256 = createHash("sha256").update('{"assessmentGenerationId":"gen-1"}').digest("hex");
  mockFindGeneration.mockResolvedValue({
    id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
  });
  requireAiTaskPolicy.mockReturnValue({ maxEstimatedCostUsd: 0.02 });
  budgetFindFirst.mockResolvedValue({
    id: "reservation-1", reservedUsd: 0.03, judgeCostUsd: 0, adjusterCostUsd: 0,
    failedAttemptCostUsd: 0, assessmentGenerations: [],
    judgeReceipts: [{ authorisedMaxCostUsd: 0.02 }], adjusterReceipts: [],
  });
  await expect(runAdjusterAgent("insp-001", {
    assessmentGenerationId: "gen-1", assessmentSha256, workspaceId: "ws-pilot", actorUserId: "pilot-owner",
  })).rejects.toThrow(/cannot guarantee/);
  expect(budgetFindFirst).toHaveBeenCalledWith(expect.objectContaining({
    include: expect.objectContaining({
      judgeReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
    }),
  }));
  expect(mockDispatch).not.toHaveBeenCalled();
});

it("increments accounting for two successful assessment generations", async () => {
  const firstPayload = { assessmentGenerationId: "gen-1" };
  const secondPayload = { assessmentGenerationId: "gen-2" };
  mockFindGeneration
    .mockResolvedValueOnce({ id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: firstPayload, pilotBudgetReservationId: "reservation-1" })
    .mockResolvedValueOnce({ id: "gen-2", workspaceId: "ws-pilot", pilotArtefactPayload: secondPayload, pilotBudgetReservationId: "reservation-1" });
  mockFindUnique.mockResolvedValue(makeInspection());
  mockDispatch
    .mockResolvedValueOnce({ text: aiJson("approve"), estimatedCostUsd: 0.003, usage: { inputTokens: 10, outputTokens: 10 } })
    .mockResolvedValueOnce({ text: aiJson("approve"), estimatedCostUsd: 0.004, usage: { inputTokens: 10, outputTokens: 10 } });

  await runAdjusterAgent("insp-001", {
    assessmentGenerationId: "gen-1", assessmentSha256: createHash("sha256").update('{"assessmentGenerationId":"gen-1"}').digest("hex"),
    workspaceId: "ws-pilot", actorUserId: "pilot-owner",
  });
  await runAdjusterAgent("insp-001", {
    assessmentGenerationId: "gen-2", assessmentSha256: createHash("sha256").update('{"assessmentGenerationId":"gen-2"}').digest("hex"),
    workspaceId: "ws-pilot", actorUserId: "pilot-owner",
  });
  expect(budgetUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { adjusterCostUsd: { increment: 0.003 } } }));
  expect(budgetUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { adjusterCostUsd: { increment: 0.004 } } }));
});

  it("records an adjuster recovery charge above the immutable held maximum as overage", async () => {
  receiptFindFirst.mockResolvedValue({
    id: "adjuster-receipt-1", reservationId: "reservation-1", status: "UNRESOLVED",
    resolutionOutcome: null, authorisedMaxCostUsd: 0.02,
  });
  await expect(resolveUnresolvedPilotAdjuster({
    workspaceId: "ws-pilot", receiptId: "adjuster-receipt-1", outcome: "CHARGED",
    costUsd: 100, evidenceReference: "provider-ledger:event-overmax", actorUserId: "admin-1",
  })).resolves.toMatchObject({ status: "OVERAGE" });
  expect(budgetUpdateMany).toHaveBeenCalled();
  expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "OVERAGE", costUsd: 100 }),
  }));
});

describe("runAdjusterAgent", () => {
  it("rejects an actor revoked before the locked adjuster receipt claim", async () => {
    const payload = { assessmentGenerationId: "gen-1" };
    const assessmentSha256 = createHash("sha256").update('{"assessmentGenerationId":"gen-1"}').digest("hex");
    mockFindGeneration.mockResolvedValue({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    requirePilotWorkspaceActorInTransaction.mockRejectedValue(new Error("workspace authority revoked under lock"));
    await expect(runAdjusterAgent("insp-001", {
      assessmentGenerationId: "gen-1", assessmentSha256, workspaceId: "ws-pilot", actorUserId: "revoked-admin",
    })).rejects.toThrow(/revoked under lock/);
    expect(receiptCreate).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("refuses a two-cent adjuster maximum before provider work when only one cent remains", async () => {
    const payload = { assessmentGenerationId: "gen-1" };
    const assessmentSha256 = createHash("sha256").update('{"assessmentGenerationId":"gen-1"}').digest("hex");
    mockFindGeneration.mockResolvedValue({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    requireAiTaskPolicy.mockReturnValue({ maxEstimatedCostUsd: 0.02 });
    budgetFindFirst.mockResolvedValue({
      id: "reservation-1", reservedUsd: 0.01, judgeCostUsd: 0, adjusterCostUsd: 0,
      failedAttemptCostUsd: 0, assessmentGenerations: [], judgeReceipts: [], adjusterReceipts: [],
    });
    await expect(runAdjusterAgent("insp-001", {
      assessmentGenerationId: "gen-1", assessmentSha256, workspaceId: "ws-pilot", actorUserId: "pilot-owner",
    })).rejects.toThrow(/cannot guarantee/);
    expect(receiptCreate).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("1. clean claim → approve", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockAiResponse(aiJson("approve"));

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("approve");
    expect(result.inspectionId).toBe("insp-001");
    expect(result.generatedAt).toBeTruthy();
  });

  it("binds pilot evidence to the persisted generation and records its server cost", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] }, meta: { costEstimateUsd: 0 } };
    const assessmentSha256 = createHash("sha256")
      .update('{"assessmentGenerationId":"gen-1","meta":{"costEstimateUsd":0},"report":{"sections":[]}}')
      .digest("hex");
    mockFindGeneration.mockResolvedValueOnce({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: aiJson("approve"), model: "gemma-4-31b-it", tier: "restoreassist", fellBackToBYOK: false,
      durationMs: 500, estimatedCostUsd: 0.003, usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await runAdjusterAgent("insp-001", { assessmentGenerationId: "gen-1", assessmentSha256, workspaceId: "ws-pilot", actorUserId: "pilot-owner" });
    expect(result).toMatchObject({ assessmentGenerationId: "gen-1", assessmentSha256, costUsd: 0.003, failedAttemptCostUsd: 0 });
    expect(budgetUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { adjusterCostUsd: { increment: 0.003 } } }));
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      userPrompt: expect.stringContaining(JSON.stringify(payload)),
    }));
  });

  it("rechecks current workspace authority after claiming and before provider spend", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] }, meta: { costEstimateUsd: 0 } };
    const assessmentSha256 = createHash("sha256")
      .update('{"assessmentGenerationId":"gen-1","meta":{"costEstimateUsd":0},"report":{"sections":[]}}')
      .digest("hex");
    mockFindGeneration.mockResolvedValueOnce({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload,
      pilotBudgetReservationId: "reservation-1",
    });
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    requirePilotWorkspace
      .mockResolvedValueOnce({ id: "ws-pilot" })
      .mockRejectedValueOnce(new Error("workspace authority revoked"));

    await expect(runAdjusterAgent("insp-001", {
      assessmentGenerationId: "gen-1", assessmentSha256,
      workspaceId: "ws-pilot", actorUserId: "pilot-owner",
    })).rejects.toThrow(/authority revoked/);
    expect(requirePilotWorkspace).toHaveBeenNthCalledWith(2, "pilot-owner", "ws-pilot");
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", costUsd: 0 }),
    }));
  });

  it("replays a durable adjuster result after an ambiguous lost response without another provider call or cost write", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] }, meta: { costEstimateUsd: 0 } };
    const assessmentSha256 = createHash("sha256")
      .update('{"assessmentGenerationId":"gen-1","meta":{"costEstimateUsd":0},"report":{"sections":[]}}')
      .digest("hex");
    mockFindGeneration.mockResolvedValueOnce({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    receiptFindUnique.mockResolvedValueOnce({
      workspaceId: "ws-pilot", reservationId: "reservation-1", inspectionId: "insp-001",
      assessmentGenerationId: "gen-1", assessmentSha256, status: "SUCCEEDED", costUsd: 0.003,
      result: { ...JSON.parse(aiJson("approve")), inspectionId: "insp-001", generatedAt: "2026-08-25T00:00:00.000Z" },
    });

    await expect(runAdjusterAgent("insp-001", { assessmentGenerationId: "gen-1", assessmentSha256, workspaceId: "ws-pilot", actorUserId: "pilot-owner" }))
      .resolves.toMatchObject({ assessmentGenerationId: "gen-1", assessmentSha256, costUsd: 0.003 });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an in-flight duplicate before provider or accounting work", async () => {
    const payload = { assessmentGenerationId: "gen-1" };
    const assessmentSha256 = createHash("sha256").update('{"assessmentGenerationId":"gen-1"}').digest("hex");
    mockFindGeneration.mockResolvedValueOnce({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    receiptFindUnique.mockResolvedValueOnce({
      workspaceId: "ws-pilot", reservationId: "reservation-1", inspectionId: "insp-001",
      assessmentGenerationId: "gen-1", assessmentSha256, status: "PENDING", costUsd: 0, result: null,
    });
    await expect(runAdjusterAgent("insp-001", { assessmentGenerationId: "gen-1", assessmentSha256, workspaceId: "ws-pilot", actorUserId: "pilot-owner" }))
      .rejects.toThrow(/already in progress/);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a pilot hash that is not the exact persisted assessment before calling AI", async () => {
    mockFindGeneration.mockResolvedValueOnce({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: { assessmentGenerationId: "gen-1" }, pilotBudgetReservationId: "reservation-1",
    });
    await expect(runAdjusterAgent("insp-001", {
      assessmentGenerationId: "gen-1", assessmentSha256: "0".repeat(64),
      workspaceId: "ws-pilot", actorUserId: "pilot-owner",
    })).rejects.toThrow(/hash does not match/);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("records malformed pilot adjuster JSON as failed-attempt cost before throwing", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] }, meta: { costEstimateUsd: 0 } };
    const assessmentSha256 = createHash("sha256")
      .update('{"assessmentGenerationId":"gen-1","meta":{"costEstimateUsd":0},"report":{"sections":[]}}')
      .digest("hex");
    mockFindGeneration.mockResolvedValueOnce({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: "not json",
      model: "gemma-4-31b-it",
      tier: "restoreassist",
      fellBackToBYOK: false,
      durationMs: 500,
      estimatedCostUsd: 0.007,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    await expect(runAdjusterAgent("insp-001", {
      assessmentGenerationId: "gen-1",
      assessmentSha256,
      workspaceId: "ws-pilot", actorUserId: "pilot-owner",
    })).rejects.toThrow(/non-JSON/);

    expect(budgetUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { failedAttemptCostUsd: { increment: 0.007 } } }));
  });

  it("records malformed pilot adjuster schema as failed-attempt cost before throwing", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [] }, meta: { costEstimateUsd: 0 } };
    const assessmentSha256 = createHash("sha256")
      .update('{"assessmentGenerationId":"gen-1","meta":{"costEstimateUsd":0},"report":{"sections":[]}}')
      .digest("hex");
    mockFindGeneration.mockResolvedValueOnce({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: JSON.stringify({ recommendation: "maybe", findings: [] }),
      model: "gemma-4-31b-it",
      tier: "restoreassist",
      fellBackToBYOK: false,
      durationMs: 500,
      estimatedCostUsd: 0.008,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    await expect(runAdjusterAgent("insp-001", {
      assessmentGenerationId: "gen-1",
      assessmentSha256,
      workspaceId: "ws-pilot", actorUserId: "pilot-owner",
    })).rejects.toThrow();

    expect(budgetUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { failedAttemptCostUsd: { increment: 0.008 } } }));
  });

  it("keeps accounting unresolved when a successful provider response omits usage", async () => {
    const payload = { assessmentGenerationId: "gen-1", report: { sections: [{ heading: "Scope", body: "Exact" }] } };
    const assessmentSha256 = createHash("sha256")
      .update('{"assessmentGenerationId":"gen-1","report":{"sections":[{"body":"Exact","heading":"Scope"}]}}')
      .digest("hex");
    mockFindGeneration.mockResolvedValueOnce({
      id: "gen-1", workspaceId: "ws-pilot", pilotArtefactPayload: payload, pilotBudgetReservationId: "reservation-1",
    });
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: aiJson("approve"), model: "gemma-4-31b-it", tier: "restoreassist",
      fellBackToBYOK: false, durationMs: 500, estimatedCostUsd: 0,
    });

    await expect(runAdjusterAgent("insp-001", {
      assessmentGenerationId: "gen-1", assessmentSha256,
      workspaceId: "ws-pilot", actorUserId: "pilot-owner",
    })).rejects.toThrow(/usage evidence/);
    expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING" }),
      data: expect.objectContaining({ status: "UNRESOLVED" }),
    }));
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("2. duplicate detected → query-contractor (via AI + anomalies)", async () => {
    const insp = makeInspection({
      scopeVariations: [
        {
          id: "var-1",
          reason: "Duplicate scope line detected",
          costDeltaCents: 5000,
          costDeltaPercent: 8,
          status: "PENDING",
          autoApprovalRule: null,
          authorisationSource: "insurer_email",
          authorisationRef: null,
        },
      ],
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(
      aiJson("query-contractor", {
        anomalies: ["Possible duplicate scope item"],
        suggestedQuestions: ["Can you confirm this is not a duplicate line?"],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("query-contractor");
    expect(result.anomalies).toContain("Possible duplicate scope item");
  });

  it("3. Cat 3 + incomplete make-safe → escalate", async () => {
    const insp = makeInspection({
      makeSafeActions: [
        { action: "mould_containment", applicable: true, completed: false },
        { action: "water_stopped", applicable: true, completed: true },
      ],
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(
      aiJson("escalate", {
        findings: [
          {
            code: "MAKE_SAFE_INCOMPLETE",
            description: "mould_containment not completed",
            severity: "critical",
          },
        ],
        anomalies: [
          "1 incomplete stabilisation action(s): mould_containment (ICA Code of Practice §6)",
        ],
        clauseCompliance: [
          {
            citation: "ANSI/IICRC S500:2021 §4.1",
            status: "non-compliant",
            note: "Cat 3 — containment required",
          },
          { citation: "ANSI/IICRC S500:2021 §5.1", status: "not-applicable" },
          { citation: "ANSI/IICRC S500:2021 §7.1", status: "not-applicable" },
          { citation: "ANSI/IICRC S500:2021 §8", status: "non-compliant" },
        ],
        suggestedQuestions: ["When will mould containment be completed?"],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("escalate");
    expect(result.findings.some((f) => f.severity === "critical")).toBe(true);
    expect(
      result.clauseCompliance.some((c) => c.status === "non-compliant"),
    ).toBe(true);
  });

  it("4. cost >25% over scope → escalate", async () => {
    const insp = makeInspection({
      scopeVariations: [
        {
          id: "var-2",
          reason: "Additional structural drying",
          costDeltaCents: 500000,
          costDeltaPercent: 30,
          status: "PENDING",
          autoApprovalRule: null,
          authorisationSource: "internal_manager",
          authorisationRef: null,
        },
      ],
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(
      aiJson("escalate", {
        costReasonableness: "high",
        anomalies: [
          "1 variation(s) exceed ±25% cost delta — escalation threshold",
        ],
        suggestedQuestions: [
          "Please provide breakdown justifying 30% cost increase",
        ],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("escalate");
    expect(result.costReasonableness).toBe("high");
  });

  it("5. missing SWMS (no make-safe rows for Cat 2) → query-contractor", async () => {
    const insp = makeInspection({ makeSafeActions: [] });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(
      aiJson("query-contractor", {
        findings: [
          {
            code: "SWMS_MISSING",
            description: "No SWMS actions recorded",
            severity: "warning",
          },
        ],
        suggestedQuestions: ["Please provide SWMS documentation for this job"],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("query-contractor");
    expect(result.suggestedQuestions.length).toBeGreaterThan(0);
  });

  it("6. NZ claim path (NZ postcode) → approve when compliant", async () => {
    const insp = makeInspection({
      propertyAddress: "15 Willis St, Wellington 6011",
      propertyPostcode: "6011",
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(aiJson("approve"));

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("approve");
    expect(result.inspectionId).toBe("insp-001");
  });

  it("7. ascending moisture trend → anomaly detected by pre-compute", async () => {
    const insp = makeInspection({
      moistureReadings: [
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 10,
          createdAt: new Date("2026-04-01"),
        },
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 12,
          createdAt: new Date("2026-04-02"),
        },
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 15,
          createdAt: new Date("2026-04-03"),
        },
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 18,
          createdAt: new Date("2026-04-04"),
        },
      ],
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    // AI receives ascending-trend anomaly pre-computed in user prompt
    mockAiResponse(
      aiJson("escalate", {
        anomalies: [
          "Moisture readings show ascending trend — drying not progressing (ANSI/IICRC S500:2021 §7.1)",
        ],
        findings: [
          {
            code: "MOISTURE_ASCENDING",
            description: "Moisture not decreasing",
            severity: "critical",
          },
        ],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("escalate");
    expect(result.anomalies.some((a) => a.includes("ascending"))).toBe(true);
  });

  it("8. inspection not found → throws", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    await expect(runAdjusterAgent("not-found-id")).rejects.toThrow(
      "Inspection not found",
    );
  });

  it("9. AI returns non-JSON → throws", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: "Sorry, I cannot assist with that.",
      model: "gemma-4-31b-it",
      tier: "restoreassist",
      fellBackToBYOK: false,
      durationMs: 100,
    });

    await expect(runAdjusterAgent("insp-001")).rejects.toThrow("non-JSON");
    expect(budgetUpdateMany).not.toHaveBeenCalled();
  });

  it("10. AI returns JSON with invalid schema → throws zod error", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: JSON.stringify({ recommendation: "maybe", findings: [] }),
      model: "gemma-4-31b-it",
      tier: "restoreassist",
      fellBackToBYOK: false,
      durationMs: 100,
    });

    await expect(runAdjusterAgent("insp-001")).rejects.toThrow();
  });

  it("11. markdown-fenced JSON → parsed correctly", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: "```json\n" + aiJson("approve") + "\n```",
      model: "gemma-4-31b-it",
      tier: "restoreassist",
      fellBackToBYOK: false,
      durationMs: 200,
    });

    const result = await runAdjusterAgent("insp-001");
    expect(result.recommendation).toBe("approve");
  });
});
