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

    // Resolve workspace (best-effort) for budget tracking. Null is OK for
    // legacy single-user accounts.
    const workspace = await getWorkspaceForUser(userId);

    const result = await generateAssessment({
      inspectionId,
      domain: type as AssessmentDomain,
      workspaceId: workspace?.id ?? null,
      userId,
      options,
      enhanceWithAi,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.status >= 500 ? "Internal server error" : result.message,
          code: result.code,
        },
        { status: result.status },
      );
    }

    return NextResponse.json({
      assessmentGenerationId: result.persistedId,
      ...result.result,
    });
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
