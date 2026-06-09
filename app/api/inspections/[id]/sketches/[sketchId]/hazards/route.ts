import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

const HAZARD_TYPES = ["asbestos", "lead", "silica", "electrical", "structural"];
const HAZARD_STATUSES = [
  "suspected",
  "sampled",
  "cleared",
  "licensed_removal_required",
];

// POST /api/inspections/[id]/sketches/[sketchId]/hazards — record a WHS hazard
// (spec §5.3). A recorded pathway (status/whsPathwayNote) un-gates strip-out scope.
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
    const { elementId, type, status, whsPathwayNote } = body;

    if (!type || !HAZARD_TYPES.includes(type)) {
      return apiError(request, {
        code: "VALIDATION",
        message: `type must be one of: ${HAZARD_TYPES.join(", ")}`,
        status: 422,
      });
    }
    if (status && !HAZARD_STATUSES.includes(status)) {
      return apiError(request, {
        code: "VALIDATION",
        message: `status must be one of: ${HAZARD_STATUSES.join(", ")}`,
        status: 422,
      });
    }

    const hazard = await (prisma as any).hazard.create({
      data: {
        sketchId,
        elementId: elementId ?? null,
        type,
        status: status ?? "suspected",
        whsPathwayNote: whsPathwayNote ?? null,
      },
    });

    return NextResponse.json({ hazard }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "create-hazard" });
  }
}
