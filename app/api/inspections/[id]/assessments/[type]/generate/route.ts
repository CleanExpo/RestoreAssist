/**
 * POST /api/inspections/[id]/assessments/[type]/generate — RA-1717.
 *
 * Generates the report + scope + estimate artefact set for the given
 * inspection under the named assessment domain (WATER for V1; MOULD,
 * BIOHAZARD, FIRE_SMOKE, HVAC, STORM, AUSTRALIAN_COMPLIANCE follow
 * by adding plug-ins in lib/assessments/domains/*).
 *
 * Tenancy: assertInspectionTenancy — owner OR active workspace member.
 * Rate-limit: 10 generations per minute per user (AI-bound domains will
 * also hit the workspace AI budget guard from RA-1707 in their plug-in).
 *
 * GET /api/inspections/[id]/assessments/[type]/generate returns the most
 * recent persisted AssessmentGeneration row (or 404).
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { generateAssessment } from "@/lib/assessments/generate";
import { isRegisteredDomain, listDomainKeys } from "@/lib/assessments/registry";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import type { AssessmentDomain } from "@/lib/assessments/types";
import { apiError, fromException } from "@/lib/api-errors";
import {
  claimPilotGeneration,
  currentPilotReservation,
  finalizePilotGeneration,
  markPilotGenerationUnresolved,
  PilotContractError,
  requirePilotWorkspace,
  withPilotWorkspaceProviderAuthority,
} from "@/lib/pilot-tester/budget-contract";
import { getIdempotencyKey } from "@/lib/idempotency";
import { requireAiTaskPolicy } from "@/lib/ai/task-policy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA rule 5 — subscription gate before any AI-bound work. generateAssessment
  // can invoke Anthropic (enhanceWithAi prose pass, AI-based MOULD/BIOHAZARD/
  // FIRE_SMOKE plug-ins); CANCELED/PAST_DUE/EXPIRED users must be blocked at 402
  // before that spend. Mirrors the report-generation routes.
  const gateErr = await requireActiveSubscription(userId);
  if (gateErr) return gateErr;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    windowMs: 60 * 1000,
    prefix: "assessments:generate",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  try {
    const { id: inspectionId, type } = await params;

    if (!isRegisteredDomain(type)) {
      return apiError(request, {
        code: "VALIDATION",
        message: `Unknown assessment domain "${type}". Registered: ${listDomainKeys().join(", ")}`,
        status: 400,
      });
    }

    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    // Optional domain-specific payload (e.g. MOULD reads `condition`,
    // `ambientRelativeHumidity` from this). WATER ignores. Empty body
    // is fine — plug-ins handle missing fields per their own contract.
    // Special meta key `enhanceWithAi:true` toggles the prose rewrite
    // pass; it's stripped from the domain options before dispatch.
    let options: Record<string, unknown> | null = null;
    let enhanceWithAi = false;
    try {
      const text = await request.text();
      if (text.trim().length > 0) {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj.enhanceWithAi === "boolean") {
            enhanceWithAi = obj.enhanceWithAi;
          }
          const { enhanceWithAi: _omit, ...domainOptions } = obj;
          void _omit;
          if (Object.keys(domainOptions).length > 0) {
            options = domainOptions;
          }
        }
      }
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    // The inspection's workspace, not the user's first/default workspace, owns
    // accounting. Falling back to the user's workspace is only for legacy
    // inspection rows that pre-date workspace scoping and cannot pilot-bind.
    const inspectionWorkspaceId = tenancy.data.workspaceId;
    const workspace = inspectionWorkspaceId
      ? { id: inspectionWorkspaceId }
      : await getWorkspaceForUser(userId);
    const pilotRunId = request.headers.get("x-pilot-tester-run-id");
    let pilotReservation: { id: string } | null = null;
    if (pilotRunId) {
      if (!inspectionWorkspaceId) {
        return apiError(request, {
          code: "PRECONDITION_FAILED",
          message: "Pilot assessment generation requires a workspace-scoped inspection",
          status: 412,
        });
      }
      try {
        await requirePilotWorkspace(userId, inspectionWorkspaceId);
      } catch (error) {
        if (error instanceof PilotContractError) {
          return apiError(request, {
            code: "PRECONDITION_FAILED",
            message: "Pilot assessment generation requires the inspection workspace to be a pilot sandbox",
            status: 412,
          });
        }
        throw error;
      }
      pilotReservation = await currentPilotReservation(inspectionWorkspaceId, pilotRunId);
      if (!pilotReservation) {
        return apiError(request, {
          code: "PRECONDITION_FAILED",
          message: "Active pilot budget reservation not found for this inspection workspace",
          status: 412,
        });
      }
    }

    let pilotClaim: { receiptId: string; authorisedMaxCostUsd: number } | null = null;
    if (pilotReservation) {
      const idempotency = getIdempotencyKey(request);
      if (!idempotency.ok || !idempotency.key) return apiError(request, {
        code: "VALIDATION", message: idempotency.ok ? "Idempotency-Key is required for pilot generation" : idempotency.reason, status: 400,
      });
      const inputSha256 = createHash("sha256").update(JSON.stringify({ inspectionId, type, options, enhanceWithAi })).digest("hex");
      const policy = requireAiTaskPolicy("report_drafting");
      const claimed = await claimPilotGeneration({
        actorUserId: userId, workspaceId: inspectionWorkspaceId!, reservationId: pilotReservation.id,
        inspectionId, assessmentType: type, inputSha256, idempotencyKey: idempotency.key,
        authorisedMaxCostUsd: policy.maxEstimatedCostUsd,
      });
      if (claimed.kind === "replay") return NextResponse.json(claimed.response);
      pilotClaim = claimed;
    }

    let result: Awaited<ReturnType<typeof generateAssessment>>;
    try {
      const operation = () => generateAssessment({
        inspectionId,
        domain: type as AssessmentDomain,
        workspaceId: workspace?.id ?? null,
        userId,
        options,
        enhanceWithAi,
        pilotBudgetReservationId: pilotReservation?.id ?? null,
        pilotAccounting: pilotClaim ? true : false,
      });
      result = pilotClaim
        ? await withPilotWorkspaceProviderAuthority(userId, inspectionWorkspaceId!, operation)
        : await operation();
    } catch (error) {
      if (pilotClaim) await markPilotGenerationUnresolved({
        receiptId: pilotClaim.receiptId, workspaceId: inspectionWorkspaceId!,
        errorMessage: "Pilot assessment generation provider outcome is unresolved",
      });
      throw error;
    }

    if (!result.ok) {
      if (pilotClaim) await markPilotGenerationUnresolved({
        receiptId: pilotClaim.receiptId, workspaceId: inspectionWorkspaceId!,
        errorMessage: `Pilot assessment generation failed before terminal cost evidence: ${result.code}`,
      });
      return NextResponse.json(
        {
          error:
            result.status >= 500 ? "Internal server error" : result.message,
          code: result.code,
        },
        { status: result.status },
      );
    }

    const response = {
      assessmentGenerationId: result.persistedId,
      ...result.result,
    };
    if (pilotClaim && pilotReservation) {
      try {
        await finalizePilotGeneration({
          receiptId: pilotClaim.receiptId, workspaceId: inspectionWorkspaceId!, reservationId: pilotReservation.id,
          assessmentGenerationId: result.persistedId, costUsd: Number(result.result.meta.costEstimateUsd ?? 0), response,
        });
      } catch (error) {
        await markPilotGenerationUnresolved({
          receiptId: pilotClaim.receiptId, workspaceId: inspectionWorkspaceId!,
          errorMessage: "Pilot assessment generation terminal cost evidence is unresolved",
        });
        throw error;
      }
    }
    return NextResponse.json(response);
  } catch (err) {
    return fromException(request, err, { stage: "assessments:generate" });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(_request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const { id: inspectionId, type } = await params;
    if (!isRegisteredDomain(type)) {
      return apiError(_request, {
        code: "VALIDATION",
        message: `Unknown assessment domain "${type}"`,
        status: 400,
      });
    }

    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const latest = await prisma.assessmentGeneration.findFirst({
      where: { inspectionId, assessmentType: type },
      orderBy: { generatedAt: "desc" },
    });
    if (!latest) {
      return apiError(_request, {
        code: "NOT_FOUND",
        message: "No generation persisted yet for this assessment",
        status: 404,
      });
    }
    return NextResponse.json(latest);
  } catch (err) {
    return fromException(_request, err, { stage: "assessments:generate:get" });
  }
}
