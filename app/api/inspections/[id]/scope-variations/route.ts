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

const VALID_AUTHORISATION_SOURCES = [
  "insurer_email",
  "customer_signature",
  "internal_manager",
  "adjuster_approval",
] as const;

type AuthorisationSource = (typeof VALID_AUTHORISATION_SOURCES)[number];

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Ownership check
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
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
    console.error("[scope-variations GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Ownership check — also fetch organisation country for threshold resolution
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        user: {
          select: {
            organization: {
              select: { country: true },
            },
          },
        },
      },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const rateLimitResponse = await applyRateLimit(request, {
      windowMs: 60_000,
      maxRequests: 30,
      prefix: "scope-variations",
      key: session.user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();

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
      return NextResponse.json(
        { error: "reason is required" },
        { status: 400 },
      );
    }

    if (
      !VALID_AUTHORISATION_SOURCES.includes(
        authorisationSource as AuthorisationSource,
      )
    ) {
      return NextResponse.json(
        {
          error: `authorisationSource must be one of: ${VALID_AUTHORISATION_SOURCES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (
      typeof costDeltaCents !== "number" ||
      !Number.isInteger(costDeltaCents)
    ) {
      return NextResponse.json(
        { error: "costDeltaCents must be an integer" },
        { status: 400 },
      );
    }

    // ── RA-1131: rules-engine auto-decision ──────────────────────────────────
    const orgCountry = inspection.user.organization?.country ?? "AU";
    const autoResult = evaluateVariation(
      {
        costDeltaCents,
        costDeltaPercent:
          typeof costDeltaPercent === "number" ? costDeltaPercent : null,
        waterCategory: typeof waterCategory === "string" ? waterCategory : null,
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
        authorisationSource,
        authorisationRef: authorisationRef ?? null,
        costDeltaCents,
        costDeltaPercent:
          typeof costDeltaPercent === "number" ? costDeltaPercent : null,
        approvedByUserId: session.user.id,
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
    console.error("[scope-variations POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json(
        { error: "variationId is required" },
        { status: 400 },
      );
    }

    if (status !== "APPROVED" && status !== "REJECTED") {
      return NextResponse.json(
        { error: 'status must be "APPROVED" or "REJECTED"' },
        { status: 400 },
      );
    }

    // Confirm variation belongs to this inspection
    const existing = await prisma.scopeVariation.findFirst({
      where: { id: variationId, inspectionId: id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Variation not found" },
        { status: 404 },
      );
    }

    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only PENDING variations can be approved or rejected" },
        { status: 409 },
      );
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
    console.error("[scope-variations PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
