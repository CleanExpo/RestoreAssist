import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { loadClaimPathwayForInspection } from "@/lib/services/inspection/pathway-from-inspection";
import { apiError, fromException } from "@/lib/api-errors";

/** GET — deterministic claim pathway checklist (RA-8276 UI). */
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
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const pathway = await loadClaimPathwayForInspection(id);
    if (!pathway) {
      return apiError(request, {
        code: "CONFLICT",
        message:
          "Set a claim type on this job before opening the pathway checklist.",
        status: 409,
      });
    }

    return NextResponse.json({ data: pathway });
  } catch (error) {
    return fromException(request, error, { stage: "inspection-pathway" });
  }
}