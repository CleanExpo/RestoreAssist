import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSubmission } from "@/lib/evidence/submission-gate";

// POST - Validate whether an inspection meets submission gate requirements
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

    // Determine claim type from request body or default
    const body = await request.json().catch(() => ({}));
    // NOTE: Inspection model does not have a claimType field directly.
    // claimType lives on ScopeTemplate. For now we accept it from the
    // request body or default to "water_damage".
    const claimType = body.claimType ?? "water_damage";

    const validation = await validateSubmission(id, claimType);

    return NextResponse.json({ data: validation });
  } catch (error) {
    console.error("Error validating inspection submission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
