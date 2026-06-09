import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

// POST /api/inspections/[id]/sketches/[sketchId]/insurance-context
// Upserts the claim insurance pathway routing for a sketch (spec §5.5).
const PATHWAYS = ["au_private", "nz_nhcover", "nz_private"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sketchId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }

    const { id, sketchId } = await params;

    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const body = await request.json();
    const { pathway, notes } = body;

    if (!pathway || !PATHWAYS.includes(pathway)) {
      return apiError(request, {
        code: "VALIDATION",
        message: `pathway must be one of: ${PATHWAYS.join(", ")}`,
        status: 422,
      });
    }

    const insuranceContext = await (prisma as any).insuranceContext.upsert({
      where: { sketchId },
      create: { sketchId, pathway, notes: notes ?? null },
      update: { pathway, notes: notes ?? null },
    });

    return NextResponse.json({ insuranceContext });
  } catch (error) {
    return fromException(request, error, { stage: "insurance-context" });
  }
}
