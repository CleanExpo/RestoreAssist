/**
 * RA-1131: Adjuster AI Agent — structured claim review with AU/NZ insurance compliance.
 *
 * Single-pass analyzer. Collects compliance signals from the database, builds a
 * structured prompt, calls RestoreAssist AI, and returns a zod-validated
 * AdjusterRecommendation object. Does NOT persist AI output.
 *
 * Legal references:
 *   - ANSI/IICRC S500:2021 §10.4.1 (water category), §10.4.3 (water class), §12.5 (drying)
 *   - ICA Code of Practice §3 (claims handling), §6 (make-safe obligations)
 *   - Insurance Contracts Act 1984 (Cth) §13 (duty of utmost good faith)
 */

import { z } from "zod";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { restoreAssistAiDispatch } from "@/lib/ai/restoreassist-ai-client";
import { requireAiTaskPolicy } from "@/lib/ai/task-policy";
import {
  approvePilotNoChargeInTransaction,
  PilotContractError,
  requirePilotWorkspace,
  requirePilotWorkspaceActorInTransaction,
  withPilotWorkspaceProviderAuthority,
} from "@/lib/pilot-tester/budget-contract";

// ── Output schema ────────────────────────────────────────────────────────────

export const FindingSchema = z.object({
  code: z.string(),
  description: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
});

export const ClauseComplianceSchema = z.object({
  citation: z.string(), // e.g. "ANSI/IICRC S500:2021 §4.1"
  status: z.enum(["compliant", "non-compliant", "not-applicable"]),
  note: z.string().optional(),
});

export const AdjusterRecommendationSchema = z.object({
  recommendation: z.enum(["approve", "query-contractor", "escalate"]),
  findings: z.array(FindingSchema),
  clauseCompliance: z.array(ClauseComplianceSchema),
  anomalies: z.array(z.string()),
  costReasonableness: z.enum(["within-range", "high", "low"]),
  suggestedQuestions: z.array(z.string()),
  inspectionId: z.string(),
  generatedAt: z.string(), // ISO timestamp
});

export type AdjusterRecommendation = z.infer<
  typeof AdjusterRecommendationSchema
>;
export type AdjusterFinding = z.infer<typeof FindingSchema>;

export interface PilotAssessmentBinding {
  assessmentGenerationId: string;
  assessmentSha256: string;
}

export interface PilotActorContext {
  workspaceId: string;
  actorUserId: string;
}

export type PilotBoundAdjusterRecommendation = AdjusterRecommendation &
  PilotAssessmentBinding & {
    costUsd: number;
    failedAttemptCostUsd: number;
  };

// ── System prompt ─────────────────────────────────────────────────────────────

const ADJUSTER_SYSTEM_PROMPT = `You are an expert insurance adjuster AI for Australian and New Zealand water damage restoration claims.

Your task: perform a single-pass structured audit of the provided claim data and return a JSON object matching the schema exactly.

Legal framework:
- ANSI/IICRC S500:2021 (Water Damage Restoration Standard): §10.4.1 water category, §10.4.3 water class, §12.5.7 drying targets, §9 documentation requirements
- ICA Code of Practice §3.1 (claims handling timeliness), §6 (make-safe / stabilisation obligations)
- Insurance Contracts Act 1984 (Cth) §13 (duty of utmost good faith)

Decision rules:
- recommendation = "approve" when: make-safe complete, SWMS present for Cat 3 or Class 3+, no duplicate job detected, cost within ±25% of NRPG range, moisture readings trend downward
- recommendation = "query-contractor" when: minor gaps (missing SWMS on Cat 1/2, missing auth ref on variation), cost 10–25% over, plateau moisture trend
- recommendation = "escalate" when: Cat 3 + no SWMS, duplicate job detected, cost >25% over scope, ascending moisture trend, missing make-safe on hazard actions
- costReasonableness = "within-range" when total cost is within ±10% of scope baseline, "high" when >10% over, "low" when >10% under
- Include a clauseCompliance entry for each of §10.4.1, §10.4.3, §12.5.7, §9 — mark "not-applicable" if data is absent rather than guessing
- suggestedQuestions should be actionable questions an adjuster would send to the contractor

Return ONLY valid JSON with this exact shape:
{
  "recommendation": "approve" | "query-contractor" | "escalate",
  "findings": [{ "code": string, "description": string, "severity": "info" | "warning" | "critical" }],
  "clauseCompliance": [{ "citation": string, "status": "compliant" | "non-compliant" | "not-applicable", "note": string }],
  "anomalies": [string],
  "costReasonableness": "within-range" | "high" | "low",
  "suggestedQuestions": [string]
}`;

// ── Signal collection ─────────────────────────────────────────────────────────

async function collectSignals(inspectionId: string) {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      propertyPostcode: true,
      status: true,
      inspectionDate: true,
      makeSafeActions: {
        select: { action: true, applicable: true, completed: true },
        take: 20,
      },
      scopeVariations: {
        select: {
          id: true,
          reason: true,
          costDeltaCents: true,
          costDeltaPercent: true,
          status: true,
          autoApprovalRule: true,
          authorisationSource: true,
          authorisationRef: true,
        },
        take: 50,
      },
      moistureReadings: {
        select: {
          location: true,
          moistureLevel: true,
          surfaceType: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      },
      costEstimates: {
        select: { category: true, description: true, subtotal: true },
        take: 100,
      },
    },
  });

  return inspection;
}

// ── Anomaly detection (pure, no AI) ──────────────────────────────────────────

function detectAnomalies(
  inspection: NonNullable<Awaited<ReturnType<typeof collectSignals>>>,
) {
  const anomalies: string[] = [];

  // Make-safe completeness check (ICA Code of Practice §6)
  const incompleteHazards = inspection.makeSafeActions.filter(
    (a) => a.applicable && !a.completed,
  );
  if (incompleteHazards.length > 0) {
    anomalies.push(
      `${incompleteHazards.length} incomplete stabilisation action(s): ${incompleteHazards.map((a) => a.action).join(", ")} (ICA Code of Practice §6)`,
    );
  }

  // Variation anomalies
  const pendingVariations = inspection.scopeVariations.filter(
    (v) => v.status === "PENDING",
  );
  if (pendingVariations.length > 0) {
    anomalies.push(
      `${pendingVariations.length} scope variation(s) awaiting approval`,
    );
  }

  const largeVariations = inspection.scopeVariations.filter(
    (v) => Math.abs(v.costDeltaPercent ?? 0) > 25,
  );
  if (largeVariations.length > 0) {
    anomalies.push(
      `${largeVariations.length} variation(s) exceed ±25% cost delta — escalation threshold`,
    );
  }

  // Moisture trend (ascending = anomaly)
  if (inspection.moistureReadings.length >= 4) {
    const recent = inspection.moistureReadings.slice(-4);
    const avgRecent =
      recent.reduce((s, r) => s + r.moistureLevel, 0) / recent.length;
    const avgEarly =
      inspection.moistureReadings
        .slice(0, 4)
        .reduce((s, r) => s + r.moistureLevel, 0) / 4;
    if (avgRecent > avgEarly * 1.05) {
      anomalies.push(
        "Moisture readings show ascending trend — drying not progressing (ANSI/IICRC S500:2021 §12.5)",
      );
    }
  }

  return anomalies;
}

// ── User prompt builder ───────────────────────────────────────────────────────

function buildUserPrompt(
  inspection: NonNullable<Awaited<ReturnType<typeof collectSignals>>>,
  anomalies: string[],
  exactAssessment?: unknown,
): string {
  const totalCostCents = inspection.costEstimates.reduce(
    (s, e) => s + e.subtotal * 100,
    0,
  );
  const variationNetCents = inspection.scopeVariations.reduce(
    (s, v) => s + v.costDeltaCents,
    0,
  );

  const makeSafeComplete = inspection.makeSafeActions.every(
    (a) => !a.applicable || a.completed,
  );

  return `CLAIM AUDIT REQUEST
${exactAssessment === undefined ? "" : `\nEXACT GENERATED ASSESSMENT UNDER REVIEW\nThe verdict must review this exact persisted assessment, not merely the source inspection. Identify contradictions, omissions, unsupported conclusions and unusable scope or estimate content.\n${JSON.stringify(exactAssessment)}\n`}
Inspection: ${inspection.inspectionNumber}
Address: ${inspection.propertyAddress} (postcode: ${inspection.propertyPostcode})
Status: ${inspection.status}
Date: ${inspection.inspectionDate.toISOString().split("T")[0]}

MAKE-SAFE / STABILISATION (ICA Code of Practice §6)
Complete: ${makeSafeComplete ? "YES" : "NO"}
Actions: ${JSON.stringify(inspection.makeSafeActions)}

SCOPE VARIATIONS
Count: ${inspection.scopeVariations.length}
Net delta: ${(variationNetCents / 100).toFixed(2)} AUD
Details: ${JSON.stringify(inspection.scopeVariations)}

MOISTURE READINGS (ANSI/IICRC S500:2021 §10)
Count: ${inspection.moistureReadings.length}
Readings: ${JSON.stringify(inspection.moistureReadings.slice(-20))}

COST ESTIMATES
Total (cents): ${totalCostCents}
Items: ${JSON.stringify(inspection.costEstimates.slice(0, 30))}

PRE-COMPUTED ANOMALIES
${anomalies.length > 0 ? anomalies.join("\n") : "None detected"}

Produce the structured audit JSON now.`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the adjuster AI agent for a given inspection.
 *
 * Collects compliance signals, detects rule-based anomalies, calls AI for
 * structured recommendation, and returns a zod-validated AdjusterRecommendation.
 *
 * Does NOT persist AI output — caller is responsible for any storage.
 */
export async function runAdjusterAgent(
  inspectionId: string,
  requestedBinding?: PilotAssessmentBinding & PilotActorContext,
): Promise<AdjusterRecommendation | PilotBoundAdjusterRecommendation> {
  let pilotReservationId: string | null = null;
  let pilotReceiptId: string | null = null;
  let pilotAuthorisedMaxCostUsd: number | null = null;
  let pilotAssessmentPayload: unknown | undefined;
  if (requestedBinding) {
    await requirePilotWorkspace(requestedBinding.actorUserId, requestedBinding.workspaceId);
    const generation = await prisma.assessmentGeneration.findFirst({
      where: {
        id: requestedBinding.assessmentGenerationId,
        inspectionId,
        workspaceId: requestedBinding.workspaceId,
      },
      select: {
        id: true,
        workspaceId: true,
        pilotArtefactPayload: true,
        pilotBudgetReservationId: true,
      },
    });
    if (!generation?.pilotArtefactPayload || !generation.pilotBudgetReservationId) {
      throw new Error("Pilot assessment generation is absent or not reserved");
    }
    if (sha256Json(generation.pilotArtefactPayload) !== requestedBinding.assessmentSha256) {
      throw new Error("Pilot assessment hash does not match the persisted generation");
    }
    pilotReservationId = generation.pilotBudgetReservationId;
    pilotAssessmentPayload = generation.pilotArtefactPayload;
    if (!generation.workspaceId) throw new Error("Pilot assessment generation has no workspace");
    const policy = requireAiTaskPolicy("report_drafting");
    const claim = await claimPilotAdjuster({
      actorUserId: requestedBinding.actorUserId,
      authorisedMaxCostUsd: policy.maxEstimatedCostUsd,
      workspaceId: generation.workspaceId,
      reservationId: pilotReservationId,
      inspectionId,
      assessmentGenerationId: requestedBinding.assessmentGenerationId,
      assessmentSha256: requestedBinding.assessmentSha256,
    });
    if (claim.kind === "replay") {
      await requirePilotWorkspace(requestedBinding.actorUserId, requestedBinding.workspaceId);
      return claim.result;
    }
    pilotReceiptId = claim.receiptId;
    pilotAuthorisedMaxCostUsd = claim.authorisedMaxCostUsd;
  }
  const inspection = await collectSignals(inspectionId);

  if (!inspection) {
    throw new Error(`Inspection not found: ${inspectionId}`);
  }

  const anomalies = detectAnomalies(inspection);
  const userPrompt = buildUserPrompt(inspection, anomalies, pilotAssessmentPayload);

  if (requestedBinding) {
    // Re-read the current DB-backed role immediately before provider spend. A
    // session authenticated before membership revocation is not authority.
    try {
      await requirePilotWorkspace(requestedBinding.actorUserId, requestedBinding.workspaceId);
    } catch (error) {
      await finalizePilotAdjuster(
        pilotReceiptId!, pilotReservationId!, "FAILED", 0, undefined,
        "Pilot adjuster actor no longer has workspace authority",
      );
      throw error;
    }
  }

  let aiResponse: Awaited<ReturnType<typeof restoreAssistAiDispatch>>;
  try {
    aiResponse = requestedBinding
      ? await withPilotWorkspaceProviderAuthority(
        requestedBinding.actorUserId,
        requestedBinding.workspaceId,
        () => restoreAssistAiDispatch({
          systemPrompt: ADJUSTER_SYSTEM_PROMPT,
          userPrompt,
          temperature: 0.1,
          maxTokens: 2048,
        }),
      )
      : await restoreAssistAiDispatch({
        systemPrompt: ADJUSTER_SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.1,
        maxTokens: 2048,
      });
  } catch (error) {
    if (requestedBinding && error instanceof PilotContractError && error.code === "PILOT_SANDBOX_NOT_FOUND") {
      await finalizePilotAdjuster(
        pilotReceiptId!, pilotReservationId!, "FAILED", 0, undefined,
        "Pilot adjuster actor no longer has workspace authority",
      );
      throw error;
    }
    if (pilotReceiptId) await markPilotAdjusterUnresolved(pilotReceiptId, "Adjuster provider outcome is unresolved");
    throw error;
  }
  const pilotCostUsd = requestedBinding ? Number(aiResponse.estimatedCostUsd) : 0;
  if (requestedBinding && (
    !aiResponse.usage ||
    !Number.isInteger(aiResponse.usage.inputTokens) || aiResponse.usage.inputTokens <= 0 ||
    !Number.isInteger(aiResponse.usage.outputTokens) || aiResponse.usage.outputTokens < 0 ||
    !Number.isFinite(pilotCostUsd) || pilotCostUsd <= 0
  )) {
    await markPilotAdjusterUnresolved(pilotReceiptId!, "Adjuster provider usage or cost evidence is unresolved");
    throw new Error("Adjuster AI returned missing or invalid usage evidence");
  }
  if (requestedBinding && (pilotAuthorisedMaxCostUsd === null || pilotCostUsd > pilotAuthorisedMaxCostUsd)) {
    await markPilotAdjusterUnresolved(pilotReceiptId!, "Adjuster provider cost exceeded the reserved maximum");
    throw new Error("Adjuster provider cost exceeded the reserved maximum");
  }

  // Parse and validate AI output
  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const raw = aiResponse.text
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
    parsed = JSON.parse(raw);
  } catch {
    if (requestedBinding) {
      await finalizePilotAdjuster(pilotReceiptId!, pilotReservationId!, "FAILED", pilotCostUsd, undefined, "Adjuster AI returned non-JSON response");
    }
    throw new Error("Adjuster AI returned non-JSON response");
  }

  let result: AdjusterRecommendation;
  try {
    result = AdjusterRecommendationSchema.parse({
      ...(parsed as object),
      inspectionId,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (requestedBinding) {
      await finalizePilotAdjuster(pilotReceiptId!, pilotReservationId!, "FAILED", pilotCostUsd, undefined, "Adjuster AI returned invalid schema");
    }
    throw error;
  }

  if (!requestedBinding) return result;

  // Persist before returning evidence. If this write cannot be made the
  // canary must fail rather than claim an un-reconcilable review.
  const boundResult: PilotBoundAdjusterRecommendation = {
    ...result,
    assessmentGenerationId: requestedBinding.assessmentGenerationId,
    assessmentSha256: requestedBinding.assessmentSha256,
    costUsd: pilotCostUsd,
    failedAttemptCostUsd: 0,
  };
  await finalizePilotAdjuster(pilotReceiptId!, pilotReservationId!, "SUCCEEDED", pilotCostUsd, boundResult);
  return boundResult;
}

const ADJUSTER_LEASE_MS = 15 * 60 * 1000;

async function claimPilotAdjuster(input: {
  actorUserId: string;
  authorisedMaxCostUsd: number;
  workspaceId: string; reservationId: string; inspectionId: string;
  assessmentGenerationId: string; assessmentSha256: string;
}): Promise<{ kind: "claim"; receiptId: string; authorisedMaxCostUsd: number } | { kind: "replay"; result: PilotBoundAdjusterRecommendation }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, input.actorUserId, input.workspaceId);
    const existing = await tx.pilotAdjusterReceipt.findUnique({ where: { assessmentGenerationId: input.assessmentGenerationId } });
    if (existing) {
      if (existing.workspaceId !== input.workspaceId || existing.reservationId !== input.reservationId ||
          existing.inspectionId !== input.inspectionId || existing.assessmentSha256 !== input.assessmentSha256) {
        throw new Error("Pilot adjuster receipt conflicts with the requested assessment binding");
      }
      if (existing.status === "SUCCEEDED") {
        const parsed = AdjusterRecommendationSchema.parse(existing.result);
        return { kind: "replay", result: {
          ...parsed, assessmentGenerationId: input.assessmentGenerationId,
          assessmentSha256: input.assessmentSha256, costUsd: existing.costUsd, failedAttemptCostUsd: 0,
        } };
      }
      if (existing.status === "FAILED") throw new Error(existing.errorMessage ?? "Pilot adjuster request previously failed");
      if (existing.status === "UNRESOLVED") throw new Error(existing.errorMessage ?? "Pilot adjuster provider outcome is unresolved");
      throw new Error("Pilot adjuster request is already in progress");
    }
    if (!Number.isFinite(input.authorisedMaxCostUsd) || input.authorisedMaxCostUsd <= 0) {
      throw new Error("Pilot adjuster policy has no safe maximum cost");
    }
    const activeReservation = await tx.pilotBudgetReservation.findFirst({
      where: {
        id: input.reservationId, workspaceId: input.workspaceId,
        reconciledAt: null, expiresAt: { gt: new Date() },
      },
      include: {
        assessmentGenerations: { select: { costEstimateUsd: true } },
        generationReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
        judgeReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
        adjusterReceipts: { where: { status: { in: ["PENDING", "UNRESOLVED"] } }, select: { authorisedMaxCostUsd: true } },
      },
    });
    if (!activeReservation) throw new Error("Active pilot budget reservation not found for adjuster request");
    const committed = activeReservation.assessmentGenerations.reduce((sum, row) => sum + Number(row.costEstimateUsd ?? 0), 0) +
      Number(activeReservation.judgeCostUsd ?? 0) + Number(activeReservation.adjusterCostUsd ?? 0) + Number(activeReservation.failedAttemptCostUsd ?? 0) +
      (activeReservation.generationReceipts ?? []).reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0) +
      activeReservation.judgeReceipts.reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0) +
      activeReservation.adjusterReceipts.reduce((sum, row) => sum + Number(row.authorisedMaxCostUsd), 0);
    const remaining = Number(activeReservation.reservedUsd) - committed;
    if (!Number.isFinite(remaining) || remaining + 1e-9 < input.authorisedMaxCostUsd) {
      throw new Error("Pilot reservation cannot guarantee the adjuster maximum cost");
    }
    const row = await tx.pilotAdjusterReceipt.create({ data: {
      workspaceId: input.workspaceId, reservationId: input.reservationId, inspectionId: input.inspectionId,
      assessmentGenerationId: input.assessmentGenerationId, assessmentSha256: input.assessmentSha256,
      status: "PENDING", authorisedMaxCostUsd: input.authorisedMaxCostUsd,
      costUsd: input.authorisedMaxCostUsd, leaseExpiresAt: new Date(Date.now() + ADJUSTER_LEASE_MS),
    }, select: { id: true } });
    return { kind: "claim", receiptId: row.id, authorisedMaxCostUsd: input.authorisedMaxCostUsd };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function finalizePilotAdjuster(
  receiptId: string, reservationId: string, status: "SUCCEEDED" | "FAILED", costUsd: number,
  result?: PilotBoundAdjusterRecommendation, errorMessage?: string,
) {
  await prisma.$transaction(async (tx) => {
    const receipt = await tx.pilotAdjusterReceipt.findUnique({ where: { id: receiptId }, select: { workspaceId: true, costUsd: true } });
    if (!receipt) throw new Error("Pilot adjuster receipt not found");
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${receipt.workspaceId} FOR UPDATE`);
    if (costUsd > receipt.costUsd + 1e-9) throw new Error("Pilot adjuster cost exceeds its reserved maximum");
    const budget = await tx.pilotBudgetReservation.updateMany({
      where: { id: reservationId, workspaceId: receipt.workspaceId, reconciledAt: null },
      data: status === "SUCCEEDED" ? { adjusterCostUsd: { increment: costUsd } } : { failedAttemptCostUsd: { increment: costUsd } },
    });
    if (budget.count !== 1) throw new Error("Pilot budget reservation has already been reconciled");
    const updated = await tx.pilotAdjusterReceipt.updateMany({ where: { id: receiptId, status: "PENDING" }, data: {
      status, leaseExpiresAt: null, terminalAt: new Date(), costUsd,
      ...(result ? { result: result as unknown as Prisma.InputJsonValue } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    } });
    if (updated.count !== 1) throw new Error("Pilot adjuster receipt is no longer pending");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function markPilotAdjusterUnresolved(receiptId: string, errorMessage: string) {
  await prisma.pilotAdjusterReceipt.updateMany({ where: { id: receiptId, status: "PENDING" }, data: {
    status: "UNRESOLVED", leaseExpiresAt: null, errorMessage,
  } });
}

export async function resolveUnresolvedPilotAdjuster(input: {
  workspaceId: string; receiptId: string; outcome: "CHARGED" | "CONFIRMED_NOT_CHARGED";
  costUsd: number; evidenceReference: string; actorUserId: string;
}) {
  if (!input.actorUserId || input.evidenceReference.trim().length < 12 || input.evidenceReference.length > 500 ||
      !Number.isFinite(input.costUsd) || input.costUsd < 0 ||
      !["CHARGED", "CONFIRMED_NOT_CHARGED"].includes(input.outcome) ||
      (input.outcome === "CHARGED" ? input.costUsd <= 0 : input.costUsd !== 0)) {
    throw new Error("Invalid unresolved adjuster resolution evidence");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR UPDATE`);
    await requirePilotWorkspaceActorInTransaction(tx, input.actorUserId, input.workspaceId);
    const row = await tx.pilotAdjusterReceipt.findFirst({ where: { id: input.receiptId, workspaceId: input.workspaceId } });
    if (!row) throw new Error("Pilot adjuster receipt not found");
    if (["FAILED", "OVERAGE", "NOT_CHARGED"].includes(row.status) && row.resolutionOutcome) {
      if (row.resolutionOutcome !== input.outcome || row.costUsd !== input.costUsd ||
          row.resolutionEvidence !== input.evidenceReference.trim() || row.resolvedById !== input.actorUserId) {
        throw new Error("Conflicting retry of resolved pilot adjuster outcome");
      }
      return { receiptId: row.id, status: row.status, resolutionOutcome: row.resolutionOutcome };
    }
    if (row.status !== "UNRESOLVED") throw new Error("Pilot adjuster receipt is not unresolved");
    if (input.outcome === "CONFIRMED_NOT_CHARGED") {
      const approval = await approvePilotNoChargeInTransaction(tx, {
        workspaceId: input.workspaceId, receiptKind: "ADJUSTER", receiptId: row.id,
        evidenceReference: input.evidenceReference, actorUserId: input.actorUserId,
      });
      if (!approval.approved) return { receiptId: row.id, status: "UNRESOLVED", resolutionOutcome: null, approvalCount: approval.approvalCount };
      const terminal = await tx.pilotAdjusterReceipt.updateMany({ where: { id: row.id, status: "UNRESOLVED" }, data: {
        status: "NOT_CHARGED", costUsd: 0, terminalAt: new Date(), resolvedAt: new Date(),
        resolutionOutcome: input.outcome, resolutionEvidence: input.evidenceReference.trim(), resolvedById: input.actorUserId,
        errorMessage: "Provider evidence confirmed no charge after two independent approvals",
      } });
      if (terminal.count !== 1) throw new Error("Pilot adjuster resolution raced with another operator");
      return { receiptId: row.id, status: "NOT_CHARGED", resolutionOutcome: input.outcome };
    }
    const budget = await tx.pilotBudgetReservation.updateMany({
      where: { id: row.reservationId, workspaceId: input.workspaceId, reconciledAt: null },
      data: { failedAttemptCostUsd: { increment: input.costUsd } },
    });
    if (budget.count !== 1) throw new Error("Pilot budget reservation has already been reconciled");
    const resolvedAt = new Date();
    const updated = await tx.pilotAdjusterReceipt.updateMany({ where: { id: row.id, status: "UNRESOLVED" }, data: {
      status: input.costUsd > row.authorisedMaxCostUsd + 1e-9 ? "OVERAGE" : "FAILED", terminalAt: resolvedAt, resolvedAt, costUsd: input.costUsd,
      resolutionOutcome: input.outcome, resolutionEvidence: input.evidenceReference.trim(), resolvedById: input.actorUserId,
      errorMessage: "Pilot adjuster failure resolved with a confirmed charge",
    } });
    if (updated.count !== 1) throw new Error("Pilot adjuster resolution raced with another operator");
    return { receiptId: row.id, status: input.costUsd > row.authorisedMaxCostUsd + 1e-9 ? "OVERAGE" : "FAILED", resolutionOutcome: input.outcome };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
