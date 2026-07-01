/**
 * Insurer Profile Templates
 *
 * GET /api/insurer-profiles         — list all active profiles
 * POST /api/insurer-profiles        — create a custom profile (admin only)
 *
 * RA-406: Sprint H — per-insurer evidence and reporting requirements
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { verifyAdminFromDb } from "@/lib/admin-auth";

// ─── GET — list profiles ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const profiles = await prisma.insurerProfile.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isSystemProfile: "desc" }, { name: "asc" }],
      take: 200,
    });

    return NextResponse.json({ data: profiles });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}

// ─── POST — create custom profile ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // Admin gate (coding guideline): re-validate role from the DB, never the
    // JWT claim.
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

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
    const body = rawBody as Record<string, any>;

    const {
      slug,
      name,
      aliases = [],
      requiredEvidenceClasses = [],
      preferredEvidenceClasses = [],
      minPhotoCount = 5,
      reportFormat = "STANDARD",
      requiresSignedScope = false,
      requiresThirdPartyScope = false,
      preferredInvoiceFormat,
      gstRegistrationRequired = true,
      claimsEmailDomain,
      portalUrl,
      specialInstructions,
      iicrcComplianceNote,
    } = body;

    if (!slug || !name) {
      return apiError(request, {
        code: "VALIDATION",
        message: "slug and name are required",
        status: 400,
      });
    }

    const profile = await prisma.insurerProfile.create({
      data: {
        slug,
        name,
        aliases,
        requiredEvidenceClasses,
        preferredEvidenceClasses,
        minPhotoCount,
        reportFormat,
        requiresSignedScope,
        requiresThirdPartyScope,
        preferredInvoiceFormat,
        gstRegistrationRequired,
        claimsEmailDomain,
        portalUrl,
        specialInstructions,
        iicrcComplianceNote,
        isSystemProfile: false,
      },
    });

    return NextResponse.json({ data: profile }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return apiError(request, {
        code: "CONFLICT",
        message: "A profile with that slug already exists",
        status: 409,
      });
    }
    return fromException(request, error, { stage: "create" });
  }
}
