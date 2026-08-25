import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAiTaskPolicy } from "@/lib/ai/task-policy";
import {
  approvePilotNoChargeInTransaction,
  PilotContractError,
  requirePilotWorkspaceActorInTransaction,
  withPilotWorkspaceProviderAuthority,
} from "@/lib/pilot-tester/budget-contract";

const JUDGE_MODEL = "claude-haiku-4-5-20251001";
const JUDGE_RECEIPT_LEASE_MS = 15 * 60 * 1000;
const JUDGE_PROVIDER_FAMILY = "anthropic-premium";
export const JUDGE_SYSTEM_PROMPT = `You are an experienced restoration-industry editor reviewing an automated assessment report. Grade it on four 0-10 integer dimensions and output ONLY JSON:
{"professionalism":0,"specificity":0,"consistency":0,"actionability":0,"rationale":"60-200 Australian-English characters"}

PROFESSIONALISM: penalise hedging, filler, American spelling, generic templates and AI throat-clearing. 10 reads like a senior technician wrote it on the job.
SPECIFICITY: reward claims grounded in the inspection's actual measurements, quantities, elapsed time and evidence. 0 could apply to any job.
CONSISTENCY: check scope against report, citations against the citation set, equipment against scope and water category across sections.
ACTIONABILITY: require equipment quantities, duration estimates, clear responsibility and contingency plans so a technician can start without clarification.
Use Australian English. Never reward verbosity. The rationale is concise evaluation notes, not chain-of-thought.`;

export const PILOT_JUDGE_REQUIRED_RUBRIC_MARKERS = [
  "PROFESSIONALISM:",
  "SPECIFICITY:",
  "CONSISTENCY:",
  "ACTIONABILITY:",
  "Use Australian English.",
] as const;

export function pilotJudgeRubricFailures(prompt: string): string[] {
  return PILOT_JUDGE_REQUIRED_RUBRIC_MARKERS.filter((marker) => !prompt.includes(marker));
}

export class PilotJudgeError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface PilotJudgeReceipt {
  professionalism: number;
  specificity: number;
  consistency: number;
  actionability: number;
  composite: number;
  rationale: string;
  modelUsed: string;
  costUsd: number;
  latencyMs: number;
}

type JudgeReceiptStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "UNRESOLVED" | "OVERAGE" | "NOT_CHARGED";

export async function judgePilotAssessment(input: {
  actorUserId: string;
  workspaceId: string;
  inspectionId: string;
  assessmentGenerationId: string;
  assessmentSha256: string;
  idempotencyKey: string;
}): Promise<PilotJudgeReceipt> {
  assertJudgeIdempotencyKey(input.idempotencyKey);
  const attempt = await claimJudgeReceipt(input);
  if (attempt.kind === "replay") {
    return attempt.receipt;
  }
  const { reservationId, pilotArtefactPayload, policy } = attempt;

  // A missing policy is a release-blocking configuration error, never an
  // invitation to run an unbounded evaluator against a platform key. Completed
  // idempotent replays return above before this policy/provider gate.
  const exactPayload = JSON.stringify(pilotArtefactPayload);
  const estimatedInputTokens = Math.ceil((JUDGE_SYSTEM_PROMPT.length + exactPayload.length) / 4);
  if (
    !policy.allowedProviderFamilies.includes(JUDGE_PROVIDER_FAMILY) ||
    pilotJudgeRubricFailures(JUDGE_SYSTEM_PROMPT).length > 0 ||
    policy.requiresTenantContext !== true ||
    policy.requiresUsageLogging !== true ||
    policy.requiresBudgetCheck !== true ||
    policy.allowsFallback !== false ||
    !Number.isFinite(policy.maxEstimatedCostUsd) || policy.maxEstimatedCostUsd <= 0 ||
    (policy.maxInputTokens !== undefined && estimatedInputTokens > policy.maxInputTokens)
  ) {
    await finalizeJudgeReceiptTerminal({
      workspaceId: input.workspaceId, reservationId, receiptId: attempt.receiptId,
      status: "FAILED", costMode: "none", errorStatus: 503,
      errorMessage: "Server-owned pilot judge policy does not safely authorize this request",
    });
    throw new PilotJudgeError(503, "Server-owned pilot judge policy does not safely authorize this request");
  }

  const apiKey = process.env.PILOT_TESTER_JUDGE_API_KEY;
  if (!apiKey) {
    // Do not silently fall back to the harness's credential. That would make
    // release evidence impossible to reconcile server-side.
    await finalizeJudgeReceiptTerminal({
      workspaceId: input.workspaceId,
      reservationId,
      receiptId: attempt.receiptId,
      status: "FAILED",
      costMode: "none",
      errorStatus: 503,
      errorMessage: "Server-owned pilot judge is not configured",
    });
    throw new PilotJudgeError(503, "Server-owned pilot judge is not configured");
  }
  const start = Date.now();
  let response: Awaited<ReturnType<Anthropic["messages"]["create"]>>;
  try {
    const client = new Anthropic({ apiKey });
    response = await withPilotWorkspaceProviderAuthority(
      input.actorUserId,
      input.workspaceId,
      () => client.messages.create({
        model: JUDGE_MODEL,
        max_tokens: Math.min(400, policy.maxOutputTokens ?? 400),
        system: JUDGE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Grade this exact assessment JSON:\n${exactPayload}` }],
      }),
    );
  } catch (error) {
    if (error instanceof PilotContractError && error.code === "PILOT_SANDBOX_NOT_FOUND") {
      await finalizeJudgeReceiptTerminal({
        workspaceId: input.workspaceId, reservationId, receiptId: attempt.receiptId,
        status: "FAILED", costMode: "none", errorStatus: 404,
        errorMessage: "Pilot judge actor no longer has workspace authority",
      });
      throw new PilotJudgeError(404, "Pilot sandbox workspace not found");
    }
    await markJudgeReceiptUnresolved({
      workspaceId: input.workspaceId,
      reservationId,
      receiptId: attempt.receiptId,
      errorStatus: 502,
      errorMessage: "Pilot judge provider request failed",
    });
    throw new PilotJudgeError(502, "Pilot judge provider request failed");
  }
  const costUsd = judgeCostUsd(response);
  if (costUsd === null) {
    await markJudgeReceiptUnresolved({
      workspaceId: input.workspaceId, reservationId, receiptId: attempt.receiptId,
      errorStatus: 502,
      errorMessage: "Pilot judge provider usage or cost evidence is unresolved",
    });
    throw new PilotJudgeError(502, "Pilot judge provider usage or cost evidence is unresolved");
  }
  if (costUsd > attempt.authorisedMaxCostUsd) {
    await finalizeJudgeReceiptTerminal({
      workspaceId: input.workspaceId, reservationId, receiptId: attempt.receiptId,
      status: "OVERAGE", costMode: "failedAttempt", costUsd, allowOverage: true, errorStatus: 502,
      errorMessage: "Pilot judge provider cost exceeded the reserved maximum",
    });
    throw new PilotJudgeError(502, "Pilot judge provider cost exceeded the reserved maximum");
  }
  const actualInputTokens = response.usage.input_tokens;
  const actualOutputTokens = response.usage.output_tokens;
  if (
    costUsd > policy.maxEstimatedCostUsd ||
    (policy.maxInputTokens !== undefined && actualInputTokens > policy.maxInputTokens) ||
    (policy.maxOutputTokens !== undefined && actualOutputTokens > policy.maxOutputTokens)
  ) {
    await finalizeJudgeReceiptTerminal({
      workspaceId: input.workspaceId, reservationId, receiptId: attempt.receiptId,
      status: "FAILED", costMode: "failedAttempt", costUsd, errorStatus: 502,
      errorMessage: "Pilot judge provider cost exceeded the authorised task policy",
    });
    throw new PilotJudgeError(502, "Pilot judge provider cost exceeded the authorised task policy");
  }
  const text = response.content.find((part) => part.type === "text");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse((text?.type === "text" ? text.text : "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
  } catch {
    await finalizeJudgeReceiptTerminal({
      workspaceId: input.workspaceId,
      reservationId,
      receiptId: attempt.receiptId,
      status: "FAILED",
      costMode: "failedAttempt",
      costUsd,
      errorStatus: 502,
      errorMessage: "Pilot judge provider returned invalid JSON",
    });
    throw new PilotJudgeError(502, "Pilot judge provider returned invalid JSON");
  }
  const scores = ["professionalism", "specificity", "consistency", "actionability"] as const;
  if (scores.some((key) => typeof parsed[key] !== "number" || !Number.isInteger(parsed[key]) || (parsed[key] as number) < 0 || (parsed[key] as number) > 10)) {
    await finalizeJudgeReceiptTerminal({
      workspaceId: input.workspaceId,
      reservationId,
      receiptId: attempt.receiptId,
      status: "FAILED",
      costMode: "failedAttempt",
      costUsd,
      errorStatus: 502,
      errorMessage: "Pilot judge provider returned invalid scores",
    });
    throw new PilotJudgeError(502, "Pilot judge provider returned invalid scores");
  }
  const [professionalism, specificity, consistency, actionability] = scores.map((key) => parsed[key] as number);
  const receipt = {
    professionalism,
    specificity,
    consistency,
    actionability,
    composite: ((professionalism + specificity + consistency + actionability) / 4) * 10,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 240) : "",
    modelUsed: JUDGE_MODEL,
    costUsd,
    latencyMs: Date.now() - start,
  };
  await finalizeJudgeReceiptTerminal({
    workspaceId: input.workspaceId,
    reservationId,
    receiptId: attempt.receiptId,
    status: "SUCCEEDED",
    costMode: "judge",
    receipt,
    costUsd,
  });
  return receipt;
}

function assertJudgeIdempotencyKey(key: string) {
  if (key.length < 8 || key.length > 255 || !/^[\x21-\x7E]+$/.test(key)) {
    throw new PilotJudgeError(400, "Invalid Idempotency-Key");
  }
}

async function claimJudgeReceipt(input: {
  actorUserId: string;
  workspaceId: string;
  inspectionId: string;
  assessmentGenerationId: string;
  assessmentSha256: string;
  idempotencyKey: string;
}): Promise<
  | { kind: "claim"; receiptId: string; reservationId: string; pilotArtefactPayload: unknown; authorisedMaxCostUsd: number; policy: ReturnType<typeof requireAiTaskPolicy> }
  | { kind: "replay"; receipt: PilotJudgeReceipt }
> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, input.actorUserId, input.workspaceId);
    const existing = await tx.pilotJudgeReceipt.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      return resolveExistingReceipt(existing, input, "Idempotency-Key reused for a different pilot judge request");
    }

    const existingForGeneration = await tx.pilotJudgeReceipt.findUnique({
      where: { assessmentGenerationId: input.assessmentGenerationId },
    });
    if (existingForGeneration) {
      return resolveExistingReceipt(
        existingForGeneration,
        input,
        "Assessment generation already has a different pilot judge receipt",
      );
    }

    const generation = await tx.assessmentGeneration.findFirst({
      where: {
        id: input.assessmentGenerationId,
        inspectionId: input.inspectionId,
        workspaceId: input.workspaceId,
        pilotBudgetReservation: {
          is: {
            workspaceId: input.workspaceId,
            reconciledAt: null,
            expiresAt: { gt: now },
          },
        },
      },
      select: { pilotArtefactPayload: true, pilotBudgetReservationId: true },
    });
    if (!generation?.pilotArtefactPayload || !generation.pilotBudgetReservationId) {
      throw new PilotJudgeError(404, "Reserved, unreconciled pilot assessment not found");
    }
    if (sha256Json(generation.pilotArtefactPayload) !== input.assessmentSha256) {
      throw new PilotJudgeError(409, "Assessment hash does not match the persisted generation");
    }
    let policy: ReturnType<typeof requireAiTaskPolicy>;
    try {
      policy = requireAiTaskPolicy("report_drafting");
    } catch {
      throw new PilotJudgeError(503, "Server-owned pilot judge policy is not configured");
    }
    const authorisedMaxCostUsd = policy.maxEstimatedCostUsd;
    if (!Number.isFinite(authorisedMaxCostUsd) || authorisedMaxCostUsd <= 0) {
      throw new PilotJudgeError(503, "Pilot judge policy has no safe maximum cost");
    }
    const reservation = await tx.pilotBudgetReservation.findFirst({
      where: { id: generation.pilotBudgetReservationId, workspaceId: input.workspaceId, reconciledAt: null },
      include: {
        assessmentGenerations: { select: { costEstimateUsd: true } },
        generationReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
        judgeReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
        adjusterReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
      },
    });
    if (!reservation) throw new PilotJudgeError(404, "Active pilot reservation not found");
    const committed = reservation.assessmentGenerations.reduce((sum, row) => sum + Number(row.costEstimateUsd ?? 0), 0) +
      Number(reservation.judgeCostUsd ?? 0) + Number(reservation.adjusterCostUsd ?? 0) + Number(reservation.failedAttemptCostUsd ?? 0) +
      (reservation.generationReceipts ?? []).reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0) +
      reservation.judgeReceipts.reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0) +
      reservation.adjusterReceipts.reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0);
    const remaining = Number(reservation.reservedUsd) - committed;
    if (!Number.isFinite(remaining) || remaining + 1e-9 < authorisedMaxCostUsd) {
      throw new PilotJudgeError(409, "Pilot reservation cannot guarantee the judge maximum cost");
    }
    const row = await tx.pilotJudgeReceipt.create({
      data: {
        workspaceId: input.workspaceId,
        reservationId: generation.pilotBudgetReservationId,
        inspectionId: input.inspectionId,
        assessmentGenerationId: input.assessmentGenerationId,
        assessmentSha256: input.assessmentSha256,
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
        authorisedMaxCostUsd,
        costUsd: authorisedMaxCostUsd,
        leaseExpiresAt: new Date(now.getTime() + JUDGE_RECEIPT_LEASE_MS),
      },
      select: { id: true },
    });
    return {
      kind: "claim",
      receiptId: row.id,
      reservationId: generation.pilotBudgetReservationId,
      pilotArtefactPayload: generation.pilotArtefactPayload,
      authorisedMaxCostUsd,
      policy,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function resolveExistingReceipt(
  existing: {
    workspaceId: string;
    inspectionId: string;
    assessmentGenerationId: string;
    assessmentSha256: string;
    status: string;
    receipt: unknown;
    errorStatus: number | null;
    errorMessage: string | null;
  },
  input: {
    workspaceId: string;
    inspectionId: string;
    assessmentGenerationId: string;
    assessmentSha256: string;
  },
  conflictMessage: string,
): { kind: "replay"; receipt: PilotJudgeReceipt } {
  if (
    existing.workspaceId !== input.workspaceId ||
    existing.inspectionId !== input.inspectionId ||
    existing.assessmentGenerationId !== input.assessmentGenerationId ||
    existing.assessmentSha256 !== input.assessmentSha256
  ) {
    throw new PilotJudgeError(409, conflictMessage);
  }
  if (existing.status === "SUCCEEDED") {
    return { kind: "replay", receipt: parseStoredReceipt(existing.receipt) };
  }
  if (existing.status === "FAILED") {
    throw new PilotJudgeError(
      existing.errorStatus ?? 502,
      existing.errorMessage ?? "Pilot judge request previously failed",
    );
  }
  if (existing.status === "UNRESOLVED") {
    throw new PilotJudgeError(
      409,
      existing.errorMessage ?? "Pilot judge provider outcome is unresolved; reconciliation is blocked",
    );
  }
  throw new PilotJudgeError(409, "Pilot judge request is already in progress; retry shortly");
}

async function finalizeJudgeReceiptTerminal(data: {
    workspaceId: string;
    reservationId: string;
    receiptId: string;
    status: JudgeReceiptStatus;
    costMode: "none" | "judge" | "failedAttempt";
    receipt?: PilotJudgeReceipt;
    costUsd?: number;
    errorStatus?: number;
    errorMessage?: string;
    allowOverage?: boolean;
  }) {
  if (data.costUsd !== undefined && (!Number.isFinite(data.costUsd) || data.costUsd < 0)) {
    throw new PilotJudgeError(500, "Invalid pilot judge cost");
  }
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${data.workspaceId} FOR UPDATE`);
    const heldReceipt = await tx.pilotJudgeReceipt.findFirst({
      where: { id: data.receiptId, workspaceId: data.workspaceId, reservationId: data.reservationId, status: "PENDING" },
      select: { costUsd: true },
    });
    if (!heldReceipt || (!data.allowOverage && data.costUsd !== undefined && data.costUsd > heldReceipt.costUsd + 1e-9)) {
      throw new PilotJudgeError(409, "Pilot judge cost exceeds its reserved maximum");
    }
    if (data.costMode !== "none") {
      const budget = await tx.pilotBudgetReservation.updateMany({
        where: { id: data.reservationId, workspaceId: data.workspaceId, reconciledAt: null },
        data: data.costMode === "failedAttempt"
          ? { failedAttemptCostUsd: { increment: data.costUsd ?? 0 } }
          : { judgeCostUsd: { increment: data.costUsd ?? 0 } },
      });
      if (budget.count !== 1) {
        throw new PilotJudgeError(409, "Pilot budget reservation has already been reconciled");
      }
    }
    const receipt = await tx.pilotJudgeReceipt.updateMany({
      where: {
        id: data.receiptId,
        workspaceId: data.workspaceId,
        reservationId: data.reservationId,
        status: "PENDING",
      },
      data: {
        status: data.status,
        leaseExpiresAt: null,
        recoveryRequiredAt: null,
        terminalAt: new Date(),
        ...(data.receipt ? { receipt: data.receipt as unknown as Prisma.InputJsonValue } : {}),
        ...(data.costUsd !== undefined ? { costUsd: data.costUsd } : {}),
        ...(data.errorStatus !== undefined ? { errorStatus: data.errorStatus } : {}),
        ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
      },
    });
    if (receipt.count !== 1) {
      throw new PilotJudgeError(409, "Pilot judge receipt is no longer pending");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function markJudgeReceiptUnresolved(data: {
  workspaceId: string;
  reservationId: string;
  receiptId: string;
  errorStatus: number;
  errorMessage: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${data.workspaceId} FOR UPDATE`);
    const receipt = await tx.pilotJudgeReceipt.updateMany({
      where: {
        id: data.receiptId,
        workspaceId: data.workspaceId,
        reservationId: data.reservationId,
        status: "PENDING",
      },
      data: {
        status: "UNRESOLVED",
        leaseExpiresAt: null,
        recoveryRequiredAt: new Date(),
        errorStatus: data.errorStatus,
        errorMessage: data.errorMessage,
      },
    });
    if (receipt.count !== 1) {
      throw new PilotJudgeError(409, "Pilot judge receipt is no longer pending");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Explicit operator resolution for an ambiguous provider outcome. This never
 * guesses: the caller must provide independently retained provider evidence
 * proving either the exact charge or that no charge occurred. */
export async function resolveUnresolvedPilotJudge(input: {
  workspaceId: string;
  receiptId: string;
  outcome: "CHARGED" | "CONFIRMED_NOT_CHARGED";
  costUsd: number;
  evidenceReference: string;
  actorUserId: string;
}) {
  if (
    !input.actorUserId || input.evidenceReference.trim().length < 12 || input.evidenceReference.length > 500 ||
    !Number.isFinite(input.costUsd) || input.costUsd < 0 ||
    !["CHARGED", "CONFIRMED_NOT_CHARGED"].includes(input.outcome) ||
    (input.outcome === "CHARGED" ? input.costUsd <= 0 : input.costUsd !== 0)
  ) throw new PilotJudgeError(400, "Invalid unresolved judge resolution evidence");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, input.actorUserId, input.workspaceId);
    const row = await tx.pilotJudgeReceipt.findFirst({
      where: { id: input.receiptId, workspaceId: input.workspaceId },
      select: {
        id: true, reservationId: true, status: true, resolutionOutcome: true,
        resolutionEvidence: true, costUsd: true, authorisedMaxCostUsd: true, resolvedById: true,
      },
    });
    if (!row) throw new PilotJudgeError(404, "Pilot judge receipt not found");
    if (["FAILED", "OVERAGE", "NOT_CHARGED"].includes(row.status) && row.resolutionOutcome) {
      if (
        row.resolutionOutcome !== input.outcome || row.costUsd !== input.costUsd ||
        row.resolutionEvidence !== input.evidenceReference.trim() || row.resolvedById !== input.actorUserId
      ) throw new PilotJudgeError(409, "Conflicting retry of resolved pilot judge outcome");
      return { receiptId: row.id, status: row.status, resolutionOutcome: row.resolutionOutcome };
    }
    if (row.status !== "UNRESOLVED") throw new PilotJudgeError(409, "Pilot judge receipt is not unresolved");
    if (input.outcome === "CONFIRMED_NOT_CHARGED") {
      const approval = await approvePilotNoChargeInTransaction(tx, {
        workspaceId: input.workspaceId, receiptKind: "JUDGE", receiptId: row.id,
        evidenceReference: input.evidenceReference, actorUserId: input.actorUserId,
      });
      if (!approval.approved) return { receiptId: row.id, status: "UNRESOLVED", resolutionOutcome: null, approvalCount: approval.approvalCount };
      const terminal = await tx.pilotJudgeReceipt.updateMany({ where: { id: row.id, status: "UNRESOLVED" }, data: {
        status: "NOT_CHARGED", costUsd: 0, terminalAt: new Date(), resolvedAt: new Date(),
        resolutionOutcome: input.outcome, resolutionEvidence: input.evidenceReference.trim(), resolvedById: input.actorUserId,
        errorStatus: null, errorMessage: "Provider evidence confirmed no charge after two independent approvals",
      } });
      if (terminal.count !== 1) throw new PilotJudgeError(409, "Pilot judge resolution raced with another operator");
      return { receiptId: row.id, status: "NOT_CHARGED", resolutionOutcome: input.outcome };
    }
    const budget = await tx.pilotBudgetReservation.updateMany({
      where: { id: row.reservationId, workspaceId: input.workspaceId, reconciledAt: null },
      data: { failedAttemptCostUsd: { increment: input.costUsd } },
    });
    if (budget.count !== 1) throw new PilotJudgeError(409, "Pilot budget reservation has already been reconciled");
    const resolvedAt = new Date();
    const updated = await tx.pilotJudgeReceipt.updateMany({
      where: { id: row.id, status: "UNRESOLVED" },
      data: {
        status: input.costUsd > row.authorisedMaxCostUsd + 1e-9 ? "OVERAGE" : "FAILED", terminalAt: resolvedAt, resolvedAt,
        resolutionOutcome: input.outcome,
        resolutionEvidence: input.evidenceReference.trim(),
        resolvedById: input.actorUserId,
        costUsd: input.costUsd,
        errorStatus: 502,
        errorMessage: "Pilot judge provider failure resolved with a confirmed charge",
      },
    });
    if (updated.count !== 1) throw new PilotJudgeError(409, "Pilot judge resolution raced with another operator");
    return { receiptId: row.id, status: input.costUsd > row.authorisedMaxCostUsd + 1e-9 ? "OVERAGE" : "FAILED", resolutionOutcome: input.outcome };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function parseStoredReceipt(value: unknown): PilotJudgeReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PilotJudgeError(500, "Stored pilot judge receipt is corrupt");
  }
  const receipt = value as Record<string, unknown>;
  if (
    !score(receipt.professionalism) ||
    !score(receipt.specificity) ||
    !score(receipt.consistency) ||
    !score(receipt.actionability) ||
    typeof receipt.composite !== "number" ||
    !Number.isFinite(receipt.composite) ||
    receipt.composite < 0 ||
    receipt.composite > 100 ||
    Math.abs(
      receipt.composite -
        ((receipt.professionalism + receipt.specificity + receipt.consistency + receipt.actionability) / 4) * 10,
    ) > 1e-9 ||
    typeof receipt.rationale !== "string" ||
    typeof receipt.modelUsed !== "string" ||
    receipt.modelUsed.length === 0 ||
    typeof receipt.costUsd !== "number" ||
    !Number.isFinite(receipt.costUsd) ||
    receipt.costUsd < 0 ||
    typeof receipt.latencyMs !== "number" ||
    !Number.isFinite(receipt.latencyMs) ||
    receipt.latencyMs < 0
  ) {
    throw new PilotJudgeError(500, "Stored pilot judge receipt is corrupt");
  }
  return receipt as unknown as PilotJudgeReceipt;
}

function score(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function judgeCostUsd(response: Awaited<ReturnType<Anthropic["messages"]["create"]>>): number | null {
  if (!("usage" in response) || !response.usage) return null;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  if (!Number.isInteger(inputTokens) || inputTokens <= 0 || !Number.isInteger(outputTokens) || outputTokens < 0) return null;
  return (inputTokens / 1_000_000) * 1 + (outputTokens / 1_000_000) * 5;
}
