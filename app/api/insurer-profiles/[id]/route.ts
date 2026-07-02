/**
 * Insurer Profile — single resource
 *
 * GET    /api/insurer-profiles/:id  — get one profile
 * PATCH  /api/insurer-profiles/:id  — update (admin only)
 * DELETE /api/insurer-profiles/:id  — soft-delete (admin only, custom profiles only)
 *
 * RA-406: Sprint H — per-insurer evidence and reporting requirements
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { verifyAdminFromDb } from "@/lib/admin-auth";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: RouteContext) {
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

    const profile = await prisma.insurerProfile.findUnique({
      where: { id },
    });
    if (!profile) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Profile not found",
        status: 404,
      });
    }

    return NextResponse.json({ data: profile });
  } catch (error) {
    return fromException(request, error, { stage: "get" });
  }
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    // Admin gate (coding guideline): re-validate role from the DB.
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id } = await params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Request body must be valid JSON",
        status: 400,
      });
    }
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Request body must be a JSON object",
        status: 400,
      });
    }
    const body = rawBody as Record<string, unknown>;

    // RA-1338: allowlist editable fields. Previously `...updates` spread
    // accepted any body key, allowing mass-assignment to fields like
    // isActive, updatedBy, or any newly-added relation FK.
    const EDITABLE_FIELDS = [
      "name",
      "aliases",
      "requiredEvidenceClasses",
      "preferredEvidenceClasses",
      "minPhotoCount",
      "reportFormat",
      "requiresSignedScope",
      "requiresThirdPartyScope",
      "preferredInvoiceFormat",
      "gstRegistrationRequired",
      "claimsEmailDomain",
      "portalUrl",
      "specialInstructions",
      "iicrcComplianceNote",
      "isActive",
    ] as const;
    const updates: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) updates[key] = body[key];
    }

    const profile = await prisma.insurerProfile.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({ data: profile });
  } catch (error) {
    // fromException maps Prisma P2025 (record-to-update not found) -> 404.
    return fromException(request, error, { stage: "patch" });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    // Admin gate (coding guideline): re-validate role from the DB.
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id } = await params;

    const profile = await prisma.insurerProfile.findUnique({
      where: { id },
    });
    if (!profile) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Profile not found",
        status: 404,
      });
    }

    if (profile.isSystemProfile) {
      return apiError(request, {
        code: "CONFLICT",
        message:
          "System profiles cannot be deleted. Deactivate them instead by setting isActive=false.",
        status: 409,
      });
    }

    await prisma.insurerProfile.delete({ where: { id } });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return fromException(request, error, { stage: "delete" });
  }
}
