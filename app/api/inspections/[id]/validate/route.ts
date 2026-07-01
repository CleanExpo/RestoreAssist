import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateSubmission } from "@/lib/evidence/submission-gate";
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

    // Determine claim type from request body or default
    const body = await request.json().catch(() => ({}));
    // NOTE: Inspection model does not have a claimType field directly.
    // claimType lives on ScopeTemplate. For now we accept it from the
    // request body or default to "water_damage".
    const claimType = body.claimType ?? "water_damage";

    const validation = await validateSubmission(id, claimType);

    return NextResponse.json({ data: validation });
  } catch (error) {
    return fromException(request, error, { stage: "validate-submission" });
  }
}
