/**
 * RA-8498 (DRC S5) — record a site visit's details.
 *
 * PATCH /api/inspections/[id]/visits/[visitId]
 *   body: any of arrivedAt, departedAt, metOnSite, frontPhotoId,
 *         equipmentOutcome, equipmentNote (null clears one)
 *
 * Field-data update (D-028): the owner's reach or the assigned technician,
 * re-checked inside the write. Only an open (unsubmitted) visit changes. No
 * DELETE: a visit, once started, is part of the job's record.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { assertInspectionAssignedWrite } from "@/lib/auth/assert-tenancy";
import { parseVisitPatch } from "@/lib/site-visits/visit-gate";
import { patchVisit, visitRefusalResponse } from "@/lib/site-visits/visit-writes";


const notFound = (request: NextRequest, what = "Site visit not found") =>
  apiError(request, { code: "NOT_FOUND", message: what, status: 404 });

export async function PATCH(
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

    const now = new Date();
    const parsed = parseVisitPatch(await request.json().catch(() => null), now);
    if (!parsed.ok) {
      return apiError(request, { code: "VALIDATION", message: parsed.error, status: 400 });
    }
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ data: { id: visitId, changed: false } });
    }

    // Every decision (visit open, job open, merged times, photo of this job)
    // is made under the job's row lock in lib/site-visits/visit-writes.ts.
    const result = await patchVisit(tenancy.data.inspectionManyWhere, { inspectionId: id, visitId, data, now });
    if (!result.ok) return visitRefusalResponse(request, result.refusal);
    return NextResponse.json({ data: result.value });
  } catch (error) {
    return fromException(request, error, { stage: "site-visit-patch" });
  }
}
