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

// ─── GET — list profiles ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const profiles = await (prisma as any).insurerProfile.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isSystemProfile: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ data: profiles });
  } catch (error) {
    console.error("Error listing insurer profiles:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── POST — create custom profile ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can create profiles
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

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
      return NextResponse.json(
        { error: "slug and name are required" },
        { status: 400 },
      );
    }

    const profile = await (prisma as any).insurerProfile.create({
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
    console.error("Error creating insurer profile:", error);
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A profile with that slug already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
