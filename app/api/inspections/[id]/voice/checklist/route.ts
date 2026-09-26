/**
 * RA-396: GET /api/inspections/[id]/voice/checklist
 * Returns the S500:2021 completion checklist for an inspection.
 *
 * Response: { inspectionId, items, completedCount, totalCount, criticalMissing, readyToLeave }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkCompletion } from "@/lib/voice/completion-checker";
import { apiError, fromException } from "@/lib/api-errors";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;
    // RA-7755: read-only, so the organisation read reach applies. 404 for
    // both "missing" and "not yours", so ids cannot be enumerated.
    const access = await assertInspectionReadable(session, id);
    if (!access.ok) {
      return apiError(req, {
        code: access.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
        message: access.status === 401 ? "Unauthorized" : "Inspection not found",
        status: access.status === 401 ? 401 : 404,
      });
    }

    const items = await checkCompletion(id);
    const completedCount = items.filter((i) => i.complete).length;
    const criticalMissing = items.filter(
      (i) => !i.complete && i.priority === 1,
    );
    const readyToLeave = criticalMissing.length === 0;

    return NextResponse.json({
      inspectionId: id,
      items,
      completedCount,
      totalCount: items.length,
      criticalMissing,
      readyToLeave,
    });
  } catch (error) {
    return fromException(req, error, { stage: "voice-checklist" });
  }
}
