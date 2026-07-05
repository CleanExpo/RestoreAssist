import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateSubmission } from "@/lib/evidence/submission-gate";
import { normalizeClaimType } from "@/lib/evidence/claim-type";
import { JOB_TYPES } from "@/lib/evidence/workflow-definitions";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

// POST - Validate whether an inspection meets submission gate requirements
export async function POST(
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

    // RA-1711 batch 3 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    // Determine claim type from request body or default to "water_damage".
    // RA-6994: WORKFLOW_TEMPLATES is keyed on uppercase JobType values
    // (e.g. "WATER_DAMAGE") — normalise here so the requirements lookup
    // actually matches instead of silently returning zero requirements.
    const body = await request.json().catch(() => ({}));
    const rawClaimType =
      typeof body.claimType === "string" ? body.claimType : "water_damage";
    const claimType = normalizeClaimType(rawClaimType);

    if (!claimType) {
      return apiError(request, {
        code: "VALIDATION",
        message: `Unknown claimType "${rawClaimType}". Accepted values: ${JOB_TYPES.join(", ")} (case-insensitive).`,
        status: 400,
      });
    }

    const validation = await validateSubmission(id, claimType);

    return NextResponse.json({ data: validation });
  } catch (error) {
    return fromException(request, error, { stage: "validate-submission" });
  }
}
