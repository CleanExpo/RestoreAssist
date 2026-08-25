import { beforeEach, describe, expect, it, vi } from "vitest";

const txQueryRaw = vi.hoisted(() => vi.fn());
const txFindUnique = vi.hoisted(() => vi.fn());
const txFindFirst = vi.hoisted(() => vi.fn());
const txUpdateMany = vi.hoisted(() => vi.fn());
const txReservationUpdate = vi.hoisted(() => vi.fn());
const txCreate = vi.hoisted(() => vi.fn());
const txAggregate = vi.hoisted(() => vi.fn());
const txPilotJudgeCount = vi.hoisted(() => vi.fn());
const txPilotJudgeUpdateMany = vi.hoisted(() => vi.fn());
const txPilotAdjusterCount = vi.hoisted(() => vi.fn());
const txPilotAdjusterUpdateMany = vi.hoisted(() => vi.fn());
const txPilotGenerationCount = vi.hoisted(() => vi.fn());
const txPilotGenerationFindUnique = vi.hoisted(() => vi.fn());
const txPilotGenerationCreate = vi.hoisted(() => vi.fn());
const txPilotGenerationUpdateMany = vi.hoisted(() => vi.fn());
const txPilotGenerationFindFirst = vi.hoisted(() => vi.fn());
const workspaceFindFirst = vi.hoisted(() => vi.fn());
const txWorkspaceFindFirst = vi.hoisted(() => vi.fn());
const txWorkspaceMemberFindFirst = vi.hoisted(() => vi.fn());
const hasPermission = vi.hoisted(() => vi.fn());
const noChargeFindUnique = vi.hoisted(() => vi.fn());
const noChargeCreate = vi.hoisted(() => vi.fn());
const noChargeFindMany = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    $queryRaw: txQueryRaw,
    workspace: { findFirst: txWorkspaceFindFirst },
    workspaceMember: { findFirst: txWorkspaceMemberFindFirst },
    pilotBudgetReservation: {
      findUnique: txFindUnique,
      findFirst: txFindFirst,
      updateMany: txUpdateMany,
      update: txReservationUpdate,
      create: txCreate,
      aggregate: txAggregate,
    },
    pilotJudgeReceipt: {
      count: txPilotJudgeCount,
      updateMany: txPilotJudgeUpdateMany,
    },
    pilotAdjusterReceipt: { count: txPilotAdjusterCount, updateMany: txPilotAdjusterUpdateMany },
    pilotGenerationReceipt: {
      count: txPilotGenerationCount,
      findUnique: txPilotGenerationFindUnique,
      findFirst: txPilotGenerationFindFirst,
      create: txPilotGenerationCreate,
      updateMany: txPilotGenerationUpdateMany,
    },
    pilotNoChargeApproval: { findUnique: noChargeFindUnique, create: noChargeCreate, findMany: noChargeFindMany },
  }),
));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: transaction, workspace: { findFirst: workspaceFindFirst } },
}));
vi.mock("@/lib/workspace/permissions", () => ({ hasPermission }));

import {
  PilotContractError,
  claimPilotGeneration,
  finalizePilotGeneration,
  reconcilePilotBudget as reconcilePilotBudgetImpl,
  resolveUnresolvedPilotGeneration,
  reservePilotBudget as reservePilotBudgetImpl,
  recordPilotAdjusterCost,
  recordPilotJudgeCost,
  requirePilotWorkspace,
} from "@/lib/pilot-tester/budget-contract";

const reconcilePilotBudget = (reservationId: string, workspaceId: string) =>
  reconcilePilotBudgetImpl(reservationId, workspaceId, "owner-1");
const reservePilotBudget = (input: Omit<Parameters<typeof reservePilotBudgetImpl>[0], "actorUserId">) =>
  reservePilotBudgetImpl({ actorUserId: "owner-1", ...input });

beforeEach(() => {
  vi.clearAllMocks();
  txFindUnique.mockResolvedValue({ workspaceId: "ws-pilot" });
  txUpdateMany.mockResolvedValue({ count: 1 });
  txFindFirst.mockResolvedValue(null);
  txReservationUpdate.mockResolvedValue({});
  txCreate.mockResolvedValue({
    id: "reservation-new",
    workspaceId: "ws-pilot",
    ceilingUsd: 5,
    spentAtReservationUsd: 0,
    reservedUsd: 5,
    expiresAt: new Date(Date.now() + 60_000),
  });
  txAggregate.mockResolvedValue({ _sum: { totalActualCostUsd: 0, reservedUsd: 0 } });
  txPilotJudgeCount.mockResolvedValue(0);
  txPilotJudgeUpdateMany.mockResolvedValue({ count: 0 });
  txPilotAdjusterCount.mockResolvedValue(0);
  txPilotAdjusterUpdateMany.mockResolvedValue({ count: 0 });
  txPilotGenerationCount.mockResolvedValue(0);
  txPilotGenerationFindUnique.mockResolvedValue(null);
  txPilotGenerationCreate.mockResolvedValue({ id: "generation-receipt-1" });
  txPilotGenerationUpdateMany.mockResolvedValue({ count: 1 });
  txPilotGenerationFindFirst.mockResolvedValue(null);
  workspaceFindFirst.mockResolvedValue({ id: "ws-pilot", name: "Pilot", aiDailyBudgetUsd: 5, pilotSandboxEnabled: true });
  hasPermission.mockResolvedValue(true);
  txWorkspaceFindFirst.mockResolvedValue({ ownerId: undefined });
  txWorkspaceMemberFindFirst.mockResolvedValue({ id: "member-1" });
  noChargeFindUnique.mockResolvedValue(null);
  noChargeCreate.mockResolvedValue({ id: "approval-1" });
  noChargeFindMany.mockResolvedValue([]);
});

describe("pilot generation maximum hold", () => {
  const claim = (idempotencyKey: string) => claimPilotGeneration({
    actorUserId: "owner-1", workspaceId: "ws-pilot", reservationId: "reservation-1",
    inspectionId: "inspection-1", assessmentType: "MOULD",
    inputSha256: "a".repeat(64), idempotencyKey, authorisedMaxCostUsd: 0.05,
  });

  it("refuses the same canonical operation under a different key at a realistic maximum", async () => {
    txFindFirst.mockResolvedValue({
      reservedUsd: 5, judgeCostUsd: 0, adjusterCostUsd: 0, failedAttemptCostUsd: 0,
      assessmentGenerations: [], generationReceipts: [], judgeReceipts: [], adjusterReceipts: [],
    });
    txPilotGenerationFindUnique
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null).mockResolvedValueOnce({
        status: "PENDING", response: null,
      });
    await expect(claim("generation-key-one")).resolves.toMatchObject({ kind: "claim" });
    await expect(claim("generation-key-two")).rejects.toMatchObject({ code: "PILOT_GENERATION_OPERATION_CONFLICT" });
    expect(txPilotGenerationCreate).toHaveBeenCalledTimes(1);
  });

  it("replays the exact terminal response and rejects a conflicting input", async () => {
    txPilotGenerationFindUnique.mockResolvedValue({
      reservationId: "reservation-1", inspectionId: "inspection-1", assessmentType: "MOULD",
      inputSha256: "a".repeat(64), authorisedMaxCostUsd: 0.05, status: "SUCCEEDED",
      response: { assessmentGenerationId: "generation-1" },
    });
    await expect(claim("generation-key-one")).resolves.toEqual({
      kind: "replay", response: { assessmentGenerationId: "generation-1" },
    });
    await expect(claimPilotGeneration({
      actorUserId: "owner-1", workspaceId: "ws-pilot", reservationId: "reservation-1",
      inspectionId: "inspection-2", assessmentType: "MOULD", inputSha256: "b".repeat(64),
      idempotencyKey: "generation-key-one", authorisedMaxCostUsd: 0.05,
    })).rejects.toMatchObject({ code: "PILOT_GENERATION_IDEMPOTENCY_CONFLICT" });
  });

  it("resolves an ambiguous charge once without exceeding its immutable maximum", async () => {
    txPilotGenerationFindFirst.mockResolvedValue({
      id: "generation-receipt-1", reservationId: "reservation-1", status: "UNRESOLVED",
      authorisedMaxCostUsd: 0.05, costUsd: 0.05, resolutionOutcome: null,
    });
    await expect(resolveUnresolvedPilotGeneration({
      actorUserId: "owner-1", workspaceId: "ws-pilot", receiptId: "generation-receipt-1",
      outcome: "CHARGED", costUsd: 0.03, evidenceReference: "provider-ledger-123",
    })).resolves.toMatchObject({ status: "FAILED" });
    expect(txUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));

    txPilotGenerationFindFirst.mockResolvedValue({
      id: "generation-receipt-2", reservationId: "reservation-1", status: "UNRESOLVED",
      authorisedMaxCostUsd: 0.02, costUsd: 0.02, resolutionOutcome: null,
    });
    await expect(resolveUnresolvedPilotGeneration({
      actorUserId: "owner-1", workspaceId: "ws-pilot", receiptId: "generation-receipt-2",
      outcome: "CHARGED", costUsd: 0.03, evidenceReference: "provider-ledger-456",
    })).resolves.toMatchObject({ status: "OVERAGE" });
  });

  it("records an observed provider overage as terminal accounting evidence", async () => {
    txPilotGenerationFindFirst.mockResolvedValue({ authorisedMaxCostUsd: 0.05 });
    await expect(finalizePilotGeneration({
      receiptId: "generation-receipt-1", workspaceId: "ws-pilot", reservationId: "reservation-1",
      assessmentGenerationId: "generation-1", costUsd: 0.07,
      response: { assessmentGenerationId: "generation-1" },
    })).resolves.toBeUndefined();
    expect(txPilotGenerationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "OVERAGE", costUsd: 0.07 }),
    }));
  });

  it("requires two distinct matching approvals to release an unresolved generation as not charged", async () => {
    txPilotGenerationFindFirst.mockResolvedValue({
      id: "generation-receipt-1", reservationId: "reservation-1", status: "UNRESOLVED",
      authorisedMaxCostUsd: 0.05, costUsd: 0.05, resolutionOutcome: null,
    });
    noChargeFindMany.mockResolvedValueOnce([
      { approvedById: "admin-1", evidenceReference: "provider-ledger:no-charge-123" },
    ]).mockResolvedValueOnce([
      { approvedById: "admin-1", evidenceReference: "provider-ledger:no-charge-123" },
      { approvedById: "admin-2", evidenceReference: "provider-ledger:no-charge-123" },
    ]);
    await expect(resolveUnresolvedPilotGeneration({
      actorUserId: "admin-1", workspaceId: "ws-pilot", receiptId: "generation-receipt-1",
      outcome: "CONFIRMED_NOT_CHARGED", costUsd: 0, evidenceReference: "provider-ledger:no-charge-123",
    })).resolves.toMatchObject({ status: "UNRESOLVED", approvalCount: 1 });
    await expect(resolveUnresolvedPilotGeneration({
      actorUserId: "admin-2", workspaceId: "ws-pilot", receiptId: "generation-receipt-1",
      outcome: "CONFIRMED_NOT_CHARGED", costUsd: 0, evidenceReference: "provider-ledger:no-charge-123",
    })).resolves.toMatchObject({ status: "NOT_CHARGED" });
    expect(txPilotGenerationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "NOT_CHARGED", costUsd: 0, resolvedById: "admin-2" }),
    }));
  });

  it("rejects conflicting no-charge evidence instead of combining approvals", async () => {
    txPilotGenerationFindFirst.mockResolvedValue({
      id: "generation-receipt-1", reservationId: "reservation-1", status: "UNRESOLVED",
      authorisedMaxCostUsd: 0.05, costUsd: 0.05, resolutionOutcome: null,
    });
    noChargeFindMany.mockResolvedValue([
      { approvedById: "admin-1", evidenceReference: "provider-ledger:no-charge-123" },
      { approvedById: "admin-2", evidenceReference: "forged-or-different-evidence" },
    ]);
    await expect(resolveUnresolvedPilotGeneration({
      actorUserId: "admin-2", workspaceId: "ws-pilot", receiptId: "generation-receipt-1",
      outcome: "CONFIRMED_NOT_CHARGED", costUsd: 0, evidenceReference: "provider-ledger:no-charge-123",
    })).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  });
});

describe("pilot workspace authorization", () => {
  it("requires current DB-backed workspace.settings permission", async () => {
    await expect(requirePilotWorkspace("owner-1", "ws-pilot")).resolves.toMatchObject({ id: "ws-pilot" });
    expect(hasPermission).toHaveBeenCalledWith("owner-1", "ws-pilot", "workspace.settings");

    hasPermission.mockResolvedValue(false);
    await expect(requirePilotWorkspace("stale-admin", "ws-pilot")).rejects.toMatchObject({
      status: 404, code: "PILOT_SANDBOX_NOT_FOUND",
    });
  });
});

describe("pilot budget cost recording", () => {
  it("rejects a reservation when authority is revoked after the route check but before the locked write", async () => {
    txWorkspaceFindFirst.mockResolvedValue({ ownerId: "different-owner" });
    txWorkspaceMemberFindFirst.mockResolvedValue(null);
    await expect(reservePilotBudget({
      workspaceId: "ws-pilot", runId: "run-123456", companyKey: "beyond-clean",
      jobKey: "water-loss", ceilingUsd: 5, idempotencyKey: "key-12345678",
    })).rejects.toMatchObject({ status: 404, code: "PILOT_SANDBOX_NOT_FOUND" });
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("rejects reconciliation when authority is revoked before the locked accounting transition", async () => {
    txWorkspaceFindFirst.mockResolvedValue({ ownerId: "different-owner" });
    txWorkspaceMemberFindFirst.mockResolvedValue(null);
    await expect(reconcilePilotBudget("reservation-1", "ws-pilot")).rejects.toMatchObject({
      status: 404, code: "PILOT_SANDBOX_NOT_FOUND",
    });
    expect(txPilotJudgeUpdateMany).not.toHaveBeenCalled();
    expect(txReservationUpdate).not.toHaveBeenCalled();
  });

  it("records judge cost only while the reservation is unreconciled and holds the workspace lock", async () => {
    await recordPilotJudgeCost("reservation-1", 0.004);

    expect(txFindUnique).toHaveBeenCalledWith({
      where: { id: "reservation-1" },
      select: { workspaceId: true },
    });
    expect(txQueryRaw).toHaveBeenCalledTimes(1);
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", reconciledAt: null },
      data: { judgeCostUsd: 0.004 },
    });
  });

  it("rejects a post-reconcile judge cost write instead of undercounting the final total", async () => {
    txUpdateMany.mockResolvedValue({ count: 0 });

    await expect(recordPilotJudgeCost("reservation-1", 0.004)).rejects.toBeInstanceOf(PilotContractError);
  });

  it("records malformed adjuster output as failed-attempt cost under the same unreconciled guard", async () => {
    await recordPilotAdjusterCost("reservation-1", { costUsd: 0, failedAttemptCostUsd: 0.006 });

    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", reconciledAt: null },
      data: { adjusterCostUsd: 0, failedAttemptCostUsd: { increment: 0.006 } },
    });
  });

  it("blocks reconciliation while a judge receipt is pending or unresolved", async () => {
    txFindFirst.mockResolvedValue({
      id: "reservation-1",
      workspaceId: "ws-pilot",
      reservedUsd: 1,
      ceilingUsd: 5,
      reconciledAt: null,
      judgeCostUsd: null,
      adjusterCostUsd: null,
      failedAttemptCostUsd: 0,
      assessmentGenerations: [],
    });
    txPilotJudgeCount.mockResolvedValue(1);

    await expect(reconcilePilotBudget("reservation-1", "ws-pilot")).rejects.toMatchObject({
      code: "PILOT_PROVIDER_OUTCOME_UNRESOLVED",
      status: 409,
    });
    expect(txPilotJudgeCount).toHaveBeenCalledWith({
      where: { reservationId: "reservation-1", status: { in: ["PENDING", "UNRESOLVED"] } },
    });
    expect(txPilotJudgeUpdateMany).toHaveBeenCalledWith({
      where: { reservationId: "reservation-1", status: "PENDING", leaseExpiresAt: { lte: expect.any(Date) } },
      data: expect.objectContaining({
        status: "UNRESOLVED",
        leaseExpiresAt: null,
        recoveryRequiredAt: expect.any(Date),
      }),
    });
    expect(txPilotGenerationUpdateMany).toHaveBeenCalledWith({
      where: { reservationId: "reservation-1", status: "PENDING", leaseExpiresAt: { lte: expect.any(Date) } },
      data: expect.objectContaining({ status: "UNRESOLVED", recoveryRequiredAt: expect.any(Date) }),
    });
    expect(txReservationUpdate).not.toHaveBeenCalled();
    // The terminal transition occurs in a transaction which resolves normally;
    // the conflict is returned only after that commit boundary.
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("commits an expired receipt transition before returning the reconciliation conflict", async () => {
    let persistedStatus = "PENDING";
    transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      let stagedStatus = persistedStatus;
      const tx = {
        $queryRaw: txQueryRaw,
        workspace: { findFirst: vi.fn().mockResolvedValue({ ownerId: "owner-1" }) },
        workspaceMember: { findFirst: vi.fn() },
        pilotBudgetReservation: {
          findFirst: vi.fn().mockResolvedValue({ reconciledAt: null }),
        },
        pilotJudgeReceipt: {
          updateMany: vi.fn().mockImplementation(async () => { stagedStatus = "UNRESOLVED"; return { count: 1 }; }),
          count: vi.fn().mockImplementation(async () => stagedStatus === "UNRESOLVED" ? 1 : 0),
        },
        pilotAdjusterReceipt: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          count: vi.fn().mockResolvedValue(0),
        },
        pilotGenerationReceipt: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          count: vi.fn().mockResolvedValue(0),
        },
      };
      try {
        const value = await fn(tx);
        persistedStatus = stagedStatus;
        return value;
      } catch (error) {
        stagedStatus = persistedStatus;
        throw error;
      }
    });

    await expect(reconcilePilotBudget("reservation-1", "ws-pilot")).rejects.toMatchObject({
      code: "PILOT_PROVIDER_OUTCOME_UNRESOLVED", status: 409,
    });
    expect(persistedStatus).toBe("UNRESOLVED");
  });

  it("rejects reservation Idempotency-Key reuse with a different body", async () => {
    txFindUnique.mockResolvedValueOnce({
      id: "reservation-1",
      workspaceId: "ws-pilot",
      runId: "run-123456",
      companyKey: "beyond-clean",
      jobKey: "water-loss",
      ceilingUsd: 5,
      idempotencyKey: "key-12345678",
      reconciledAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      spentAtReservationUsd: 0,
      reservedUsd: 5,
    });

    await expect(reservePilotBudget({
      workspaceId: "ws-pilot",
      runId: "run-123456",
      companyKey: "beyond-clean",
      jobKey: "mould-loss",
      ceilingUsd: 5,
      idempotencyKey: "key-12345678",
    })).rejects.toMatchObject({ code: "PILOT_RESERVATION_IDEMPOTENCY_CONFLICT", status: 409 });
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("rejects active run/company/job tuple reuse with a different idempotency key", async () => {
    txFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "reservation-1",
        workspaceId: "ws-pilot",
        runId: "run-123456",
        companyKey: "beyond-clean",
        jobKey: "water-loss",
        ceilingUsd: 5,
        idempotencyKey: "original-key",
        reconciledAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        spentAtReservationUsd: 0,
        reservedUsd: 5,
      });

    await expect(reservePilotBudget({
      workspaceId: "ws-pilot",
      runId: "run-123456",
      companyKey: "beyond-clean",
      jobKey: "water-loss",
      ceilingUsd: 5,
      idempotencyKey: "new-key-12345678",
    })).rejects.toMatchObject({ code: "PILOT_RESERVATION_TUPLE_CONFLICT", status: 409 });
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("rejects expired or reconciled reservation replay instead of returning a dead receipt", async () => {
    txFindUnique.mockResolvedValueOnce({
      id: "reservation-1",
      workspaceId: "ws-pilot",
      runId: "run-123456",
      companyKey: "beyond-clean",
      jobKey: "water-loss",
      ceilingUsd: 5,
      idempotencyKey: "key-12345678",
      reconciledAt: null,
      expiresAt: new Date(Date.now() - 1_000),
      spentAtReservationUsd: 0,
      reservedUsd: 5,
    });

    await expect(reservePilotBudget({
      workspaceId: "ws-pilot",
      runId: "run-123456",
      companyKey: "beyond-clean",
      jobKey: "water-loss",
      ceilingUsd: 5,
      idempotencyKey: "key-12345678",
    })).rejects.toMatchObject({ code: "PILOT_RESERVATION_EXPIRED", status: 409 });

    txFindUnique.mockReset().mockResolvedValueOnce({
      id: "reservation-1",
      workspaceId: "ws-pilot",
      runId: "run-123456",
      companyKey: "beyond-clean",
      jobKey: "water-loss",
      ceilingUsd: 5,
      idempotencyKey: "key-12345678",
      reconciledAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      spentAtReservationUsd: 0,
      reservedUsd: 5,
    });
    await expect(reservePilotBudget({
      workspaceId: "ws-pilot",
      runId: "run-123456",
      companyKey: "beyond-clean",
      jobKey: "water-loss",
      ceilingUsd: 5,
      idempotencyKey: "key-12345678",
    })).rejects.toMatchObject({ code: "PILOT_RESERVATION_RECONCILED", status: 409 });
  });

  it("buckets daily spend by reconciliation date, not reservation creation date", async () => {
    txFindUnique.mockResolvedValue(null);
    txAggregate
      .mockResolvedValueOnce({ _sum: { totalActualCostUsd: 1.25 } })
      .mockResolvedValueOnce({ _sum: { reservedUsd: 0 } });

    await reservePilotBudget({
      workspaceId: "ws-pilot",
      runId: "run-123456",
      companyKey: "beyond-clean",
      jobKey: "water-loss",
      ceilingUsd: 5,
      idempotencyKey: "key-12345678",
    });

    expect(txAggregate).toHaveBeenNthCalledWith(1, {
      _sum: { totalActualCostUsd: true },
      where: { workspaceId: "ws-pilot", reconciledAt: { gte: expect.any(Date) } },
    });
  });

  it("keeps every expired unreconciled reservation held until explicit reconciliation", async () => {
    txFindUnique.mockResolvedValue(null);
    txAggregate
      .mockResolvedValueOnce({ _sum: { totalActualCostUsd: 0 } })
      .mockImplementationOnce((query: { where: Record<string, unknown> }) => Promise.resolve({
        _sum: { reservedUsd: "expiresAt" in query.where ? 0 : 5 },
      }));

    await expect(reservePilotBudget({
      workspaceId: "ws-pilot",
      runId: "run-new-123",
      companyKey: "beyond-clean",
      jobKey: "new-loss",
      ceilingUsd: 5,
      idempotencyKey: "new-key-12345678",
    })).rejects.toMatchObject({ code: "PILOT_BUDGET_EXHAUSTED", status: 429 });

    expect(txAggregate).toHaveBeenNthCalledWith(2, {
      _sum: { reservedUsd: true },
      where: { workspaceId: "ws-pilot", reconciledAt: null },
    });
    expect(txCreate).not.toHaveBeenCalled();
  });

  it("replays persisted reconciliation totals unchanged after the UTC day changes", async () => {
    const reconciledAt = new Date("2026-08-24T23:59:59.000Z");
    txFindFirst.mockResolvedValue({
      id: "reservation-1",
      workspaceId: "ws-pilot",
      ceilingUsd: 5,
      reservedUsd: 5,
      reconciledAt,
      generationCostUsd: 1,
      judgeCostUsd: 0.1,
      adjusterCostUsd: 0,
      failedAttemptCostUsd: 0,
      totalActualCostUsd: 1.1,
      reconciledSpentUsd: 1.1,
      assessmentGenerations: [{ costEstimateUsd: 99 }],
    });

    await expect(reconcilePilotBudget("reservation-1", "ws-pilot")).resolves.toEqual({
      reservationId: "reservation-1",
      workspaceId: "ws-pilot",
      generationCostUsd: 1,
      judgeCostUsd: 0.1,
      adjusterCostUsd: 0,
      failedAttemptCostUsd: 0,
      totalActualCostUsd: 1.1,
      reconciledSpentUsd: 1.1,
      reconciledAt: "2026-08-24T23:59:59.000Z",
    });
    expect(txAggregate).not.toHaveBeenCalled();
    expect(txReservationUpdate).not.toHaveBeenCalled();
  });

  it("derives generation spend once from terminal receipts and persists a real overage", async () => {
    txFindFirst
      .mockResolvedValueOnce({ reconciledAt: null })
      .mockResolvedValueOnce({
        id: "reservation-1", workspaceId: "ws-pilot", ceilingUsd: 0.05, reservedUsd: 0.05,
        reconciledAt: null, judgeCostUsd: 0, adjusterCostUsd: 0, failedAttemptCostUsd: 0,
        generationReceipts: [{ costUsd: 0.07 }],
      });
    txReservationUpdate.mockResolvedValue({
      id: "reservation-1", workspaceId: "ws-pilot", reconciledAt: new Date("2026-08-25T00:00:00Z"),
    });
    txAggregate.mockResolvedValue({ _sum: { totalActualCostUsd: 0 } });

    await expect(reconcilePilotBudget("reservation-1", "ws-pilot")).resolves.toMatchObject({
      generationCostUsd: 0.07, failedAttemptCostUsd: 0, totalActualCostUsd: 0.07, reconciledSpentUsd: 0.07,
    });
    expect(txReservationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ generationCostUsd: 0.07, totalActualCostUsd: 0.07 }),
    }));
  });
});
