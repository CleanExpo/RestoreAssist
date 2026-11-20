import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { auditInspectionById } from "@/lib/evidence/field-evidence-audit";
import { buildBeforeYouLeaveActions } from "@/lib/evidence/before-you-leave";
import { apiError, fromException } from "@/lib/api-errors";

// GET - Field evidence completeness checklist for an inspection (RA-5039).
// Read-only and additive: does not touch the completeness/validate routes'
// submission-gate logic.
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

    // RA-7755: read-only, so the organisation read reach applies (a colleague's
    // job is visible to every member of the business).
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const checklist = await auditInspectionById(id);

    // RA-8002 slice 1: advisory before-you-leave actions, derived only from
    // this checklist. Additive field; `data` keeps its existing shape.
    return NextResponse.json({
      data: checklist,
      beforeYouLeave: buildBeforeYouLeaveActions(checklist),
    });
  } catch (error) {
    return fromException(request, error, { stage: "field-evidence-checklist" });
  }
}
