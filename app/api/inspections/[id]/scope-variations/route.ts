/**
 * GET/POST/PATCH /api/inspections/[id]/scope-variations
 *
 * RA-1136b: Scope Variation Tracking — ICA Code of Practice §5 + Insurance Contracts Act 1984.
 * Prevents silent scope/cost changes after insurer notification.
 *
 * DISTINCT from /api/invoices/[id]/variations/ which handles invoice line-item changes.
 * This route operates on ScopeVariation records tied to an Inspection.
 *
 * GET   — list all ScopeVariations for inspection (sorted desc, limit 50)
 * POST  — create a variation; auto-approves if |delta| <= $100 AUD AND source = "internal_manager"
 * PATCH — approve/reject a PENDING variation (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { evaluateVariation } from "@/lib/compliance/variation-auto-approve";
import { withIdempotency } from "@/lib/idempotency";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

// RA-1383 v2: authorisationSource is now a Prisma enum. Accept both the
// legacy lowercase strings (for backward compat with existing clients)
// and the canonical UPPERCASE enum values. Normalise to UPPERCASE before
// persisting.
const VALID_AUTHORISATION_SOURCES = [
  "INSURER_EMAIL",
  "CUSTOMER_SIGNATURE",
  "INTERNAL_MANAGER",
  "ADJUSTER_APPROVAL",
  "CARRIER_EMAIL",
  "CARRIER_PORTAL",
  "DOCUSIGN",
  "PHONE_THEN_EMAIL_FOLLOWUP",
  "EMERGENCY_SELF",
] as const;

type AuthorisationSource = (typeof VALID_AUTHORISATION_SOURCES)[number];

function normaliseAuthorisationSource(
  raw: unknown,
): AuthorisationSource | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  return (VALID_AUTHORISATION_SOURCES as readonly string[]).includes(upper)
    ? (upper as AuthorisationSource)
    : null;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const rateLimitResponse = await applyRateLimit(request, {
      windowMs: 60_000,
      maxRequests: 30,
      prefix: "scope-variations",
      key: session.user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const variations = await prisma.scopeVariation.findMany({
      where: { inspectionId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ data: variations });
  } catch (error) {
    return fromException(request, error, { stage: "scope-variations-get" });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1711 batch 4 — adopt shared tenancy helper, then fetch org country.
  const tenancy = await assertInspectionTenancy(session, id);
  if (!tenancy.ok) {
    return NextResponse.json(
      { error: tenancy.reason },
      { status: tenancy.status },
    );
  }

  let inspection;
  try {
    inspection = await prisma.inspection.findUnique({
      where: { id },
      select: {
        user: {
          select: {
            organization: {
              select: { country: true },
            },
          },
        },
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "scope-variations-lookup" });
  }
  if (!inspection) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Inspection not found",
      status: 404,
    });
  }

  const rateLimitResponse = await applyRateLimit(request, {
    windowMs: 60_000,
    maxRequests: 30,
    prefix: "scope-variations",
    key: userId,
  });
  if (rateLimitResponse) return rateLimitResponse;

  // RA-1266: scope variation is a regulated compliance record (ICA CoP §5 /
  // ICA 1984) — must not be duplicated silently on retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      // Validate required fields
      const {
        reason,
        authorisationSource,
        authorisationRef,
        costDeltaCents,
        costDeltaPercent,
        waterCategory,
        isStructural,
        notes,
      } = body;

      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "reason is required",
          status: 400,
        });
      }

      const normalisedSource =
        normaliseAuthorisationSource(authorisationSource);
      if (!normalisedSource) {
        return apiError(request, {
          code: "VALIDATION",
          message: `authorisationSource must be one of: ${VALID_AUTHORISATION_SOURCES.join(", ")}`,
          status: 400,
        });
      }

      if (
        typeof costDeltaCents !== "number" ||
        !Number.isInteger(costDeltaCents)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "costDeltaCents must be an integer",
          status: 400,
        });
      }

      // ── RA-1131: rules-engine auto-decision ──────────────────────────────────
      const orgCountry = inspection.user.organization?.country ?? "AU";
      const autoResult = evaluateVariation(
        {
          costDeltaCents,
          costDeltaPercent:
            typeof costDeltaPercent === "number" ? costDeltaPercent : null,
          waterCategory:
            typeof waterCategory === "string" ? waterCategory : null,
          isStructural: typeof isStructural === "boolean" ? isStructural : null,
        },
        { country: orgCountry },
        null,
      );

      // Legacy simple gate: internal_manager + |delta| <= $100 AUD still applies
      // Rules engine supersedes it — status maps from decision
      const statusFromDecision =
        autoResult.decision === "auto-approved" ? "AUTO_APPROVED" : "PENDING";

      const variation = await prisma.scopeVariation.create({
        data: {
          inspectionId: id,
          reason: reason.trim(),
          authorisationSource: normalisedSource,
          authorisationRef: authorisationRef ?? null,
          costDeltaCents,
          costDeltaPercent:
            typeof costDeltaPercent === "number" ? costDeltaPercent : null,
          approvedByUserId: userId,
          status: statusFromDecision,
          autoApprovalRule:
            autoResult.decision === "auto-approved"
              ? "RA1131_RULES_ENGINE"
              : null,
          notes: notes ?? null,
          autoDecision: autoResult.decision,
          autoDecisionReason: autoResult.reason,
          autoDecisionAt: new Date(),
        },
      });

      return NextResponse.json({ data: variation }, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "scope-variations-post" });
    }
  });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Admin-only
    const adminAuth = await verifyAdminFromDb(session);
    if (adminAuth.response) return adminAuth.response;

    const { id } = await params;

    const rateLimitResponse = await applyRateLimit(request, {
      windowMs: 60_000,
      maxRequests: 30,
      prefix: "scope-variations",
      key: session.user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { variationId, status, notes } = body;

    if (!variationId || typeof variationId !== "string") {
      return apiError(request, {
        code: "VALIDATION",
        message: "variationId is required",
        status: 400,
      });
    }

    if (status !== "APPROVED" && status !== "REJECTED") {
      return apiError(request, {
        code: "VALIDATION",
        message: 'status must be "APPROVED" or "REJECTED"',
        status: 400,
      });
    }

    // Confirm variation belongs to this inspection
    const existing = await prisma.scopeVariation.findFirst({
      where: { id: variationId, inspectionId: id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Variation not found",
        status: 404,
      });
    }

    if (existing.status !== "PENDING") {
      return apiError(request, {
        code: "CONFLICT",
        message: "Only PENDING variations can be approved or rejected",
        status: 409,
      });
    }

    const updated = await prisma.scopeVariation.update({
      where: { id: variationId },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fromException(request, error, { stage: "scope-variations-patch" });
  }
}
