import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSubmission } from "@/lib/evidence/submission-gate";

// GET - Check evidence completeness for an inspection
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

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    // Accept claimType from query param or default to "water_damage"
    // NOTE: Inspection model does not have a claimType field directly.
    // claimType lives on ScopeTemplate. Future improvement: derive from
    // the inspection's linked scope template.
    const { searchParams } = new URL(request.url);
    const claimType = searchParams.get("claimType") ?? "water_damage";

    const validation = await validateSubmission(id, claimType);

    return NextResponse.json({
      data: {
        completionPercentage: validation.completionPercentage,
        totalRequired: validation.totalRequired,
        totalCaptured: validation.totalCaptured,
        gaps: validation.gaps,
        warnings: validation.warnings,
      },
    });
  } catch (error) {
    console.error("Error checking evidence completeness:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
