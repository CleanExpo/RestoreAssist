/**
 * Server-owned accounting for the release canary.
 *
 * The pilot runner is untrusted for budget purposes: it may ask to reserve a
 * run, but the server serializes reservations per workspace and derives every
 * reconciliation value from persisted server receipts.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/workspace/permissions";

export const PILOT_SANDBOX_MARKER = "RESTOREASSIST_PILOT_SANDBOX_V1";
const RESERVATION_TTL_MS = 15 * 60 * 1000;
const GENERATION_LEASE_MS = 2 * 60 * 1000;

export class PilotContractError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type PilotReceiptKind = "GENERATION" | "JUDGE" | "ADJUSTER";

/** Record one immutable current-admin approval. Exactly two distinct current
 * admins must present the same retained provider evidence before a no-charge
 * outcome is allowed to release a hold. The caller must hold the workspace row
 * lock and must have re-run requirePilotWorkspaceActorInTransaction. */
export async function approvePilotNoChargeInTransaction(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; receiptKind: PilotReceiptKind; receiptId: string; evidenceReference: string; actorUserId: string },
): Promise<{ approved: boolean; approvalCount: number }> {
  const evidence = input.evidenceReference.trim();
  if (evidence.length < 20 || evidence.length > 500) {
    throw new PilotContractError(400, "VALIDATION", "Invalid confirmed-not-charged provider evidence");
  }
  const existing = await tx.pilotNoChargeApproval.findUnique({
    where: { receiptKind_receiptId_approvedById: {
      receiptKind: input.receiptKind, receiptId: input.receiptId, approvedById: input.actorUserId,
    } },
  });
  if (existing && existing.evidenceReference !== evidence) {
    throw new PilotContractError(409, "CONFLICT", "An approver cannot replace retained provider evidence");
  }
  if (!existing) {
    await tx.pilotNoChargeApproval.create({ data: {
      workspaceId: input.workspaceId, receiptKind: input.receiptKind, receiptId: input.receiptId,
      evidenceReference: evidence, approvedById: input.actorUserId,
    } });
  }
  const approvals = await tx.pilotNoChargeApproval.findMany({
    where: { workspaceId: input.workspaceId, receiptKind: input.receiptKind, receiptId: input.receiptId },
    select: { approvedById: true, evidenceReference: true },
  });
  if (approvals.some((approval) => approval.evidenceReference !== evidence)) {
    throw new PilotContractError(409, "CONFLICT", "No-charge approvers supplied conflicting provider evidence");
  }
  const approvalCount = new Set(approvals.map((approval) => approval.approvedById)).size;
  return { approved: approvalCount >= 2, approvalCount };
}

export function startOfTodayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function requirePilotWorkspace(userId: string, workspaceId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      status: "READY",
      pilotSandboxEnabled: true,
    },
    select: { id: true, name: true, aiDailyBudgetUsd: true, pilotSandboxEnabled: true },
  });
  if (!workspace) {
    // Do not disclose whether the requested workspace exists or is a pilot.
    throw new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "Pilot sandbox workspace not found");
  }
  // Canary mutations can spend money or release accounting holds. They are
  // workspace-administration operations, not ordinary member operations. Use
  // the current DB-backed RBAC graph rather than the potentially stale global
  // role embedded in the session JWT.
  if (!(await hasPermission(userId, workspaceId, "workspace.settings"))) {
    throw new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "Pilot sandbox workspace not found");
  }
  return workspace;
}

/** Re-check the mutable RBAC graph inside the same serializable transaction
 * which performs a canary accounting mutation. The route-level check remains
 * useful for fast rejection, but cannot protect against a role revocation
 * racing between that check and the write. Call this only after taking the
 * workspace row lock. */
export async function requirePilotWorkspaceActorInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
) {
  const workspace = await tx.workspace.findFirst({
    where: { id: workspaceId, status: "READY", pilotSandboxEnabled: true },
    select: { ownerId: true },
  });
  if (!workspace) {
    throw new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "Pilot sandbox workspace not found");
  }
  if (workspace.ownerId === userId) return;

  const member = await tx.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      status: "ACTIVE",
      roleBindings: {
        some: {
          role: {
            permissions: {
              some: { permission: { key: "workspace.settings" } },
            },
          },
        },
      },
    },
    select: { id: true },
  });
  if (!member) {
    throw new PilotContractError(404, "PILOT_SANDBOX_NOT_FOUND", "Pilot sandbox workspace not found");
  }
}

/** Keep the mutable workspace/RBAC rows locked for the complete provider
 * operation. Revocation writers must update/delete one of these rows and will
 * therefore serialize after the provider request. Re-check after acquiring
 * the RBAC locks so a revocation racing the first read cannot slip through. */
export async function withPilotWorkspaceProviderAuthority<T>(
  actorUserId: string,
  workspaceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, actorUserId, workspaceId);
    await tx.$queryRaw(Prisma.sql`
      SELECT wm."id"
      FROM "WorkspaceMember" wm
      JOIN "MemberRoleBinding" mrb ON mrb."memberId" = wm."id"
      JOIN "WorkspaceRole" wr ON wr."id" = mrb."roleId"
      JOIN "RolePermission" rp ON rp."roleId" = wr."id"
      JOIN "Permission" p ON p."id" = rp."permissionId"
      WHERE wm."workspaceId" = ${workspaceId}
        AND wm."userId" = ${actorUserId}
        AND wm."status" = 'ACTIVE'
        AND p."key" = 'workspace.settings'
      FOR UPDATE OF wm, mrb, wr, rp, p
    `);
    await requirePilotWorkspaceActorInTransaction(tx, actorUserId, workspaceId);
    return operation();
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5_000,
    timeout: 120_000,
  });
}

export interface ReservePilotBudgetInput {
  actorUserId: string;
  workspaceId: string;
  runId: string;
  companyKey: string;
  jobKey: string;
  ceilingUsd: number;
  idempotencyKey: string;
}

function assertReserveInput(input: ReservePilotBudgetInput) {
  if (
    !Number.isFinite(input.ceilingUsd) || input.ceilingUsd <= 0 || input.ceilingUsd > 5 ||
    !/^[A-Za-z0-9_-]{6,200}$/.test(input.runId) ||
    !/^[a-z0-9-]{2,100}$/.test(input.companyKey) ||
    !/^[a-z0-9-]{2,100}$/.test(input.jobKey) ||
    input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200
  ) {
    throw new PilotContractError(400, "VALIDATION", "Invalid pilot budget reservation request");
  }
}

function receipt(row: {
  id: string; workspaceId: string; ceilingUsd: number; spentAtReservationUsd: number;
  reservedUsd: number; expiresAt: Date;
}) {
  return {
    reservationId: row.id,
    workspaceId: row.workspaceId,
    ceilingUsd: row.ceilingUsd,
    spentTodayUsd: row.spentAtReservationUsd,
    reservedUsd: row.reservedUsd,
    expiresAt: row.expiresAt.toISOString(),
  };
}

function assertReservationReplayMatches(
  row: {
    runId: string;
    companyKey: string;
    jobKey: string;
    ceilingUsd: number;
    idempotencyKey: string;
    reconciledAt: Date | null;
    expiresAt: Date;
  },
  input: ReservePilotBudgetInput,
  now: Date,
) {
  if (
    row.runId !== input.runId ||
    row.companyKey !== input.companyKey ||
    row.jobKey !== input.jobKey ||
    row.ceilingUsd !== input.ceilingUsd
  ) {
    throw new PilotContractError(
      409,
      "PILOT_RESERVATION_IDEMPOTENCY_CONFLICT",
      "Idempotency-Key reused for a different pilot budget reservation request",
    );
  }
  if (row.reconciledAt) {
    throw new PilotContractError(
      409,
      "PILOT_RESERVATION_RECONCILED",
      "Pilot budget reservation has already been reconciled",
    );
  }
  if (row.expiresAt <= now) {
    throw new PilotContractError(
      409,
      "PILOT_RESERVATION_EXPIRED",
      "Pilot budget reservation has expired; start a new run",
    );
  }
}

/** Reserve every currently-uncommitted dollar. This prevents concurrent jobs
 * in the same workspace from both spending the same budget; reconciliation
 * releases the unused remainder for the next job. */
export async function reservePilotBudget(input: ReservePilotBudgetInput) {
  assertReserveInput(input);
  const now = new Date();
  const today = startOfTodayUtc(now);
  return prisma.$transaction(async (tx) => {
    // A row lock, not a read-then-write check, makes the global run cap safe
    // across separate server instances.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, input.actorUserId, input.workspaceId);

    const existingByKey = await tx.pilotBudgetReservation.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existingByKey) {
      assertReservationReplayMatches(existingByKey, input, now);
      return receipt(existingByKey);
    }

    const existingByTuple = await tx.pilotBudgetReservation.findUnique({
      where: {
        workspaceId_runId_companyKey_jobKey: {
          workspaceId: input.workspaceId,
          runId: input.runId,
          companyKey: input.companyKey,
          jobKey: input.jobKey,
        },
      },
    });
    if (existingByTuple) {
      throw new PilotContractError(
        409,
        existingByTuple.reconciledAt
          ? "PILOT_RESERVATION_RECONCILED"
          : existingByTuple.expiresAt <= now
            ? "PILOT_RESERVATION_EXPIRED"
            : "PILOT_RESERVATION_TUPLE_CONFLICT",
        existingByTuple.reconciledAt
          ? "Pilot budget reservation has already been reconciled"
          : existingByTuple.expiresAt <= now
            ? "Pilot budget reservation has expired; start a new run"
            : "Pilot run/company/job tuple already has a different reservation idempotency key",
      );
    }

    const [reconciled, held] = await Promise.all([
      tx.pilotBudgetReservation.aggregate({
        _sum: { totalActualCostUsd: true },
        where: { workspaceId: input.workspaceId, reconciledAt: { gte: today } },
      }),
      tx.pilotBudgetReservation.aggregate({
        _sum: { reservedUsd: true },
        // Expiry stops new work from using a reservation; it must not release
        // money which may already have reached a provider. Only an explicit
        // reconciliation can prove the final cost and release the remainder.
        where: { workspaceId: input.workspaceId, reconciledAt: null },
      }),
    ]);
    const spent = Number(reconciled._sum.totalActualCostUsd ?? 0);
    const alreadyReserved = Number(held._sum.reservedUsd ?? 0);
    const remaining = input.ceilingUsd - spent - alreadyReserved;
    if (!Number.isFinite(remaining) || remaining <= 0) {
      throw new PilotContractError(429, "PILOT_BUDGET_EXHAUSTED", "Pilot run budget is exhausted or held by another job");
    }
    const row = await tx.pilotBudgetReservation.create({
      data: {
        workspaceId: input.workspaceId,
        runId: input.runId,
        companyKey: input.companyKey,
        jobKey: input.jobKey,
        idempotencyKey: input.idempotencyKey,
        ceilingUsd: input.ceilingUsd,
        spentAtReservationUsd: spent,
        reservedUsd: remaining,
        expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
      },
    });
    return receipt(row);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function currentPilotReservation(workspaceId: string, runId: string) {
  return prisma.pilotBudgetReservation.findFirst({
    where: { workspaceId, runId, reconciledAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}

export async function claimPilotGeneration(input: {
  actorUserId: string; workspaceId: string; reservationId: string;
  inspectionId: string; assessmentType: string; inputSha256: string;
  idempotencyKey: string; authorisedMaxCostUsd: number;
}): Promise<{ kind: "claim"; receiptId: string; authorisedMaxCostUsd: number } | { kind: "replay"; response: unknown }> {
  if (!/^[a-f0-9]{64}$/.test(input.inputSha256) || input.idempotencyKey.length < 8 ||
      !Number.isFinite(input.authorisedMaxCostUsd) || input.authorisedMaxCostUsd <= 0) {
    throw new PilotContractError(400, "VALIDATION", "Invalid pilot generation claim");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, input.actorUserId, input.workspaceId);
    const existing = await tx.pilotGenerationReceipt.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (existing.reservationId !== input.reservationId || existing.inspectionId !== input.inspectionId ||
          existing.assessmentType !== input.assessmentType || existing.inputSha256 !== input.inputSha256 ||
          existing.authorisedMaxCostUsd !== input.authorisedMaxCostUsd) {
        throw new PilotContractError(409, "PILOT_GENERATION_IDEMPOTENCY_CONFLICT", "Idempotency-Key reused for a different pilot generation");
      }
      if (existing.status === "SUCCEEDED" && existing.response) return { kind: "replay", response: existing.response };
      if (existing.status === "UNRESOLVED") throw new PilotContractError(409, "PILOT_PROVIDER_OUTCOME_UNRESOLVED", "Pilot generation provider outcome is unresolved");
      if (existing.status === "FAILED") throw new PilotContractError(409, "PILOT_GENERATION_FAILED", existing.errorMessage ?? "Pilot generation previously failed");
      throw new PilotContractError(409, "PILOT_GENERATION_IN_PROGRESS", "Pilot generation is already in progress");
    }
    const existingOperation = await tx.pilotGenerationReceipt.findUnique({
      where: {
        workspaceId_reservationId_inspectionId_assessmentType_inputSha256: {
          workspaceId: input.workspaceId,
          reservationId: input.reservationId,
          inspectionId: input.inspectionId,
          assessmentType: input.assessmentType,
          inputSha256: input.inputSha256,
        },
      },
    });
    if (existingOperation) {
      if (existingOperation.status === "SUCCEEDED" && existingOperation.response) {
        return { kind: "replay", response: existingOperation.response };
      }
      throw new PilotContractError(
        409,
        existingOperation.status === "UNRESOLVED"
          ? "PILOT_PROVIDER_OUTCOME_UNRESOLVED"
          : "PILOT_GENERATION_OPERATION_CONFLICT",
        "This pilot generation operation already has a server-owned receipt",
      );
    }
    const reservation = await tx.pilotBudgetReservation.findFirst({
      where: { id: input.reservationId, workspaceId: input.workspaceId, reconciledAt: null, expiresAt: { gt: new Date() } },
      include: {
        assessmentGenerations: { select: { costEstimateUsd: true } },
        generationReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
        judgeReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
        adjusterReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
      },
    });
    if (!reservation) throw new PilotContractError(404, "NOT_FOUND", "Active pilot reservation not found");
    const committed = reservation.assessmentGenerations.reduce((sum, row) => sum + Number(row.costEstimateUsd ?? 0), 0) +
      Number(reservation.judgeCostUsd ?? 0) + Number(reservation.adjusterCostUsd ?? 0) + Number(reservation.failedAttemptCostUsd ?? 0) +
      reservation.generationReceipts.reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0) +
      reservation.judgeReceipts.reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0) +
      reservation.adjusterReceipts.reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0);
    if (Number(reservation.reservedUsd) - committed + 1e-9 < input.authorisedMaxCostUsd) {
      throw new PilotContractError(409, "PILOT_RESERVATION_EXCEEDED", "Pilot reservation cannot guarantee the generation maximum cost");
    }
    const row = await tx.pilotGenerationReceipt.create({ data: {
      workspaceId: input.workspaceId, reservationId: input.reservationId,
      inspectionId: input.inspectionId, assessmentType: input.assessmentType,
      inputSha256: input.inputSha256, idempotencyKey: input.idempotencyKey,
      authorisedMaxCostUsd: input.authorisedMaxCostUsd, costUsd: input.authorisedMaxCostUsd,
      leaseExpiresAt: new Date(Date.now() + GENERATION_LEASE_MS),
    }, select: { id: true } });
    return { kind: "claim", receiptId: row.id, authorisedMaxCostUsd: input.authorisedMaxCostUsd };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function finalizePilotGeneration(input: {
  receiptId: string; workspaceId: string; reservationId: string;
  assessmentGenerationId: string; costUsd: number; response: unknown;
}) {
  if (!Number.isFinite(input.costUsd) || input.costUsd < 0) throw new PilotContractError(500, "INVALID_COST", "Invalid pilot generation cost");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    const held = await tx.pilotGenerationReceipt.findFirst({ where: {
      id: input.receiptId, workspaceId: input.workspaceId, reservationId: input.reservationId, status: "PENDING",
    }, select: { authorisedMaxCostUsd: true } });
    if (!held) throw new PilotContractError(409, "PILOT_GENERATION_RACE", "Pilot generation receipt is no longer pending");
    const overage = input.costUsd > held.authorisedMaxCostUsd + 1e-9;
    const updated = await tx.pilotGenerationReceipt.updateMany({ where: { id: input.receiptId, status: "PENDING" }, data: {
      status: overage ? "OVERAGE" : "SUCCEEDED", costUsd: input.costUsd, assessmentGenerationId: input.assessmentGenerationId,
      response: JSON.parse(JSON.stringify(input.response)) as Prisma.InputJsonValue, terminalAt: new Date(),
      leaseExpiresAt: null,
      ...(overage ? { errorMessage: "Pilot generation exceeded its preauthorised maximum" } : {}),
    } });
    if (updated.count !== 1) throw new PilotContractError(409, "PILOT_GENERATION_RACE", "Pilot generation receipt is no longer pending");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function markPilotGenerationUnresolved(input: { receiptId: string; workspaceId: string; errorMessage: string }) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    await tx.pilotGenerationReceipt.updateMany({ where: { id: input.receiptId, workspaceId: input.workspaceId, status: "PENDING" }, data: {
      status: "UNRESOLVED", errorMessage: input.errorMessage,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveUnresolvedPilotGeneration(input: {
  workspaceId: string; receiptId: string; outcome: "CHARGED" | "CONFIRMED_NOT_CHARGED";
  costUsd: number; evidenceReference: string; actorUserId: string;
}) {
  if (!input.actorUserId || !["CHARGED", "CONFIRMED_NOT_CHARGED"].includes(input.outcome) || !Number.isFinite(input.costUsd) ||
      (input.outcome === "CHARGED" ? input.costUsd <= 0 : input.costUsd !== 0) ||
      input.evidenceReference.trim().length < 12 || input.evidenceReference.length > 500) {
    throw new PilotContractError(400, "VALIDATION", "Invalid unresolved generation resolution evidence");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, input.actorUserId, input.workspaceId);
    const row = await tx.pilotGenerationReceipt.findFirst({ where: { id: input.receiptId, workspaceId: input.workspaceId } });
    if (!row) throw new PilotContractError(404, "NOT_FOUND", "Pilot generation receipt not found");
    if (["FAILED", "OVERAGE", "NOT_CHARGED"].includes(row.status) && row.resolutionOutcome) {
      if (row.costUsd !== input.costUsd || row.resolutionOutcome !== input.outcome ||
          row.resolutionEvidence !== input.evidenceReference.trim() || row.resolvedById !== input.actorUserId) {
        throw new PilotContractError(409, "CONFLICT", "Conflicting retry of resolved pilot generation outcome");
      }
      return { receiptId: row.id, status: row.status };
    }
    if (row.status !== "UNRESOLVED") throw new PilotContractError(409, "CONFLICT", "Pilot generation receipt is not unresolved");
    if (input.outcome === "CONFIRMED_NOT_CHARGED") {
      const approval = await approvePilotNoChargeInTransaction(tx, {
        workspaceId: input.workspaceId, receiptKind: "GENERATION", receiptId: row.id,
        evidenceReference: input.evidenceReference, actorUserId: input.actorUserId,
      });
      if (!approval.approved) return { receiptId: row.id, status: "UNRESOLVED", approvalCount: approval.approvalCount };
      const terminal = await tx.pilotGenerationReceipt.updateMany({ where: { id: row.id, status: "UNRESOLVED" }, data: {
        status: "NOT_CHARGED", costUsd: 0, terminalAt: new Date(), resolvedAt: new Date(),
        resolutionOutcome: input.outcome, resolutionEvidence: input.evidenceReference.trim(), resolvedById: input.actorUserId,
        errorMessage: "Provider evidence confirmed no charge after two independent approvals",
      } });
      if (terminal.count !== 1) throw new PilotContractError(409, "CONFLICT", "Pilot generation resolution raced with another operator");
      return { receiptId: row.id, status: "NOT_CHARGED" };
    }
    const overage = input.costUsd > row.authorisedMaxCostUsd + 1e-9;
    const budget = await tx.pilotBudgetReservation.updateMany({
      where: { id: row.reservationId, workspaceId: input.workspaceId, reconciledAt: null }, data: {},
    });
    if (budget.count !== 1) throw new PilotContractError(409, "CONFLICT", "Pilot budget reservation has already been reconciled");
    const updated = await tx.pilotGenerationReceipt.updateMany({ where: { id: row.id, status: "UNRESOLVED" }, data: {
      status: overage ? "OVERAGE" : "FAILED", costUsd: input.costUsd, terminalAt: new Date(), resolvedAt: new Date(),
      resolutionOutcome: input.outcome, resolutionEvidence: input.evidenceReference.trim(), resolvedById: input.actorUserId,
      errorMessage: "Pilot generation provider failure resolved with a confirmed charge",
    } });
    if (updated.count !== 1) throw new PilotContractError(409, "CONFLICT", "Pilot generation resolution raced with another operator");
    return { receiptId: row.id, status: overage ? "OVERAGE" : "FAILED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function recordPilotCost(
  reservationId: string,
  data: Prisma.PilotBudgetReservationUpdateManyMutationInput,
) {
  await prisma.$transaction(async (tx) => {
    const reservation = await tx.pilotBudgetReservation.findUnique({
      where: { id: reservationId },
      select: { workspaceId: true },
    });
    if (!reservation) {
      throw new PilotContractError(404, "NOT_FOUND", "Pilot budget reservation not found");
    }
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${reservation.workspaceId} FOR UPDATE`);
    const updated = await tx.pilotBudgetReservation.updateMany({
      where: { id: reservationId, reconciledAt: null },
      data,
    });
    if (updated.count !== 1) {
      throw new PilotContractError(
        409,
        "PILOT_RESERVATION_RECONCILED",
        "Pilot budget reservation has already been reconciled",
      );
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recordPilotJudgeCost(
  reservationId: string,
  costUsd: number,
  options: { failedAttempt?: boolean } = {},
) {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Invalid judge cost");
  await recordPilotCost(
    reservationId,
    options.failedAttempt
      ? { failedAttemptCostUsd: { increment: costUsd } }
      : { judgeCostUsd: costUsd },
  );
}

export async function recordPilotAdjusterCost(
  reservationId: string,
  costs: { costUsd: number; failedAttemptCostUsd?: number },
) {
  if (!Number.isFinite(costs.costUsd) || costs.costUsd < 0) throw new Error("Invalid adjuster cost");
  const failed = costs.failedAttemptCostUsd ?? 0;
  if (!Number.isFinite(failed) || failed < 0) throw new Error("Invalid failed attempt cost");
  await recordPilotCost(reservationId, {
    adjusterCostUsd: costs.costUsd,
    ...(failed > 0 ? { failedAttemptCostUsd: { increment: failed } } : {}),
  });
}

export async function reconcilePilotBudget(reservationId: string, workspaceId: string, actorUserId: string) {
  const now = new Date();
  const today = startOfTodayUtc(now);
  // Expired leases must be made recoverable in a transaction which is allowed
  // to commit. Throwing from the reconciliation transaction would roll these
  // transitions back and strand the receipt in PENDING forever.
  const unresolved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, actorUserId, workspaceId);
    const reservation = await tx.pilotBudgetReservation.findFirst({
      where: { id: reservationId, workspaceId },
      select: { reconciledAt: true },
    });
    if (!reservation) throw new PilotContractError(404, "NOT_FOUND", "Pilot budget reservation not found");
    if (reservation.reconciledAt) return { generations: 0, judges: 0, adjusters: 0 };

    await tx.pilotJudgeReceipt.updateMany({
      where: { reservationId, status: "PENDING", leaseExpiresAt: { lte: now } },
      data: {
        status: "UNRESOLVED", leaseExpiresAt: null, recoveryRequiredAt: now,
        errorStatus: 409,
        errorMessage: "Pilot judge lease expired before a terminal provider receipt was recorded",
      },
    });
    await tx.pilotAdjusterReceipt.updateMany({
      where: { reservationId, status: "PENDING", leaseExpiresAt: { lte: now } },
      data: {
        status: "UNRESOLVED", leaseExpiresAt: null,
        errorMessage: "Pilot adjuster lease expired before a terminal provider receipt was recorded",
      },
    });
    await tx.pilotGenerationReceipt.updateMany({
      where: { reservationId, status: "PENDING", leaseExpiresAt: { lte: now } },
      data: {
        status: "UNRESOLVED", leaseExpiresAt: null, recoveryRequiredAt: now,
        errorMessage: "Pilot generation lease expired before terminal provider evidence was recorded",
      },
    });
    const [generations, judges, adjusters] = await Promise.all([
      tx.pilotGenerationReceipt.count({ where: { reservationId, status: { in: ["PENDING", "UNRESOLVED"] } } }),
      tx.pilotJudgeReceipt.count({ where: { reservationId, status: { in: ["PENDING", "UNRESOLVED"] } } }),
      tx.pilotAdjusterReceipt.count({ where: { reservationId, status: { in: ["PENDING", "UNRESOLVED"] } } }),
    ]);
    return { generations, judges, adjusters };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (unresolved.generations > 0 || unresolved.judges > 0 || unresolved.adjusters > 0) {
    throw new PilotContractError(
      409,
      "PILOT_PROVIDER_OUTCOME_UNRESOLVED",
      "Pilot budget reservation has an in-flight or unresolved provider request",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, actorUserId, workspaceId);
    const row = await tx.pilotBudgetReservation.findFirst({
      where: { id: reservationId, workspaceId },
      include: { generationReceipts: { where: { status: { in: ["SUCCEEDED", "FAILED", "OVERAGE"] } }, select: { costUsd: true } } },
    });
    if (!row) throw new PilotContractError(404, "NOT_FOUND", "Pilot budget reservation not found");
    if (row.reconciledAt) {
      const persisted = {
        generationCostUsd: row.generationCostUsd,
        judgeCostUsd: row.judgeCostUsd,
        adjusterCostUsd: row.adjusterCostUsd,
        failedAttemptCostUsd: row.failedAttemptCostUsd,
        totalActualCostUsd: row.totalActualCostUsd,
        reconciledSpentUsd: row.reconciledSpentUsd,
      };
      if (Object.values(persisted).some((value) => value === null || !Number.isFinite(Number(value)))) {
        throw new PilotContractError(500, "PILOT_RECONCILIATION_CORRUPT", "Persisted pilot reconciliation is incomplete");
      }
      return {
        reservationId: row.id,
        workspaceId: row.workspaceId,
        generationCostUsd: Number(row.generationCostUsd),
        judgeCostUsd: Number(row.judgeCostUsd),
        adjusterCostUsd: Number(row.adjusterCostUsd),
        failedAttemptCostUsd: Number(row.failedAttemptCostUsd),
        totalActualCostUsd: Number(row.totalActualCostUsd),
        reconciledSpentUsd: Number(row.reconciledSpentUsd),
        reconciledAt: row.reconciledAt.toISOString(),
      };
    }

    const generationCostUsd = row.generationReceipts.reduce(
      (sum, generation) => sum + Number(generation.costUsd), 0,
    );
    const judgeCostUsd = Number(row.judgeCostUsd ?? 0);
    const adjusterCostUsd = Number(row.adjusterCostUsd ?? 0);
    const failedAttemptCostUsd = Number(row.failedAttemptCostUsd ?? 0);
    const totalActualCostUsd = generationCostUsd + judgeCostUsd + adjusterCostUsd + failedAttemptCostUsd;
    if (!Number.isFinite(totalActualCostUsd)) throw new PilotContractError(500, "PILOT_RECONCILIATION_CORRUPT", "Pilot costs are not finite");

    const prior = await tx.pilotBudgetReservation.aggregate({
      _sum: { totalActualCostUsd: true },
      where: { workspaceId, reconciledAt: { gte: today } },
    });
    const reconciledSpentUsd = Number(prior._sum.totalActualCostUsd ?? 0) + totalActualCostUsd;
    // A provider overage is an observed liability, not a value we may discard.
    // Persist it. Future reservations see spent >= ceiling and fail closed.
    const finalRow = await tx.pilotBudgetReservation.update({
      where: { id: row.id },
      data: {
        generationCostUsd,
        judgeCostUsd,
        adjusterCostUsd,
        failedAttemptCostUsd,
        totalActualCostUsd,
        reconciledSpentUsd,
        reconciledAt: now,
      },
      include: { generationReceipts: { select: { costUsd: true } } },
    });
    return {
      reservationId: finalRow.id,
      workspaceId: finalRow.workspaceId,
      generationCostUsd,
      judgeCostUsd,
      adjusterCostUsd,
      failedAttemptCostUsd,
      totalActualCostUsd,
      reconciledSpentUsd,
      reconciledAt: (finalRow.reconciledAt ?? now).toISOString(),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
