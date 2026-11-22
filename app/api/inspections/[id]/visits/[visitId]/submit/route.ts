/**
 * RA-8498 (DRC S5) — submit a site visit.
 *
 * POST /api/inspections/[id]/visits/[visitId]/submit
 *
 * Refuses (422, with every missing item named in `error.fields`) until the
 * visit has an arrival time, a departure time after it, who was on site, a
 * front of property photo of this job that counts as evidence, and the
 * equipment outcome. lib/site-visits/visit-gate.ts owns that rule.
 *
 * The gate runs on the stored visit under the job's row lock, so an edit
 * cannot land between the check and the submit. Once submitted the visit is
 * read-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { assertInspectionAssignedWrite } from "@/lib/auth/assert-tenancy";
import { submitVisit, visitRefusalResponse } from "@/lib/site-visits/visit-writes";


const notFound = (request: NextRequest, what = "Site visit not found") =>
  apiError(request, { code: "NOT_FOUND", message: what, status: 404 });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; visitId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, visitId } = await params;
    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok) {
      return tenancy.status === 401
        ? apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 })
        : notFound(request, "Inspection not found");
    }
    const userId = session!.user!.id;

    // The gate runs on the stored visit under the job's row lock, and the
    // audit row commits with the submit (lib/site-visits/visit-writes.ts).
    const result = await submitVisit(tenancy.data.inspectionManyWhere, { inspectionId: id, visitId, userId, now: new Date() });
    if (!result.ok) return visitRefusalResponse(request, result.refusal);
    return NextResponse.json({ data: result.value });
  } catch (error) {
    return fromException(request, error, { stage: "site-visit-submit" });
  }
}
