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
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  assertInspectionAssignedWrite,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import { isVisitLockedStatus, parseVisitPatch } from "@/lib/site-visits/visit-gate";

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

    const visit = await prisma.siteVisit.findFirst({
      where: { id: visitId, inspectionId: id },
      select: { arrivedAt: true, departedAt: true, submittedAt: true },
    });
    if (!visit) return notFound(request);
    if (visit.submittedAt) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This visit has been submitted and can no longer be changed.",
        status: 409,
      });
    }

    const job = await prisma.inspection.findUnique({ where: { id }, select: { status: true } });
    if (!job) return notFound(request, "Inspection not found");
    if (isVisitLockedStatus(job.status)) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This job is closed. Reopen it before changing a site visit.",
        status: 409,
      });
    }

    const arrivedAt = data.arrivedAt !== undefined ? data.arrivedAt : visit.arrivedAt;
    const departedAt = data.departedAt !== undefined ? data.departedAt : visit.departedAt;
    if (arrivedAt && departedAt && departedAt.getTime() <= arrivedAt.getTime()) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Departure time must be after arrival time",
        status: 400,
      });
    }

    if (data.frontPhotoId) {
      // Only a photo of this same job; another job's photo id is refused
      // without saying whether it exists.
      const photo = await prisma.inspectionPhoto.findFirst({
        where: { id: data.frontPhotoId, inspectionId: id },
        select: { id: true },
      });
      if (!photo) {
        return apiError(request, {
          code: "VALIDATION",
          message: "The front of property photo must be a photo of this job",
          status: 400,
        });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ data: { id: visitId, changed: false } });
    }

    const updated = await writeWithinInspectionScope(
      tenancy.data.inspectionManyWhere,
      { updatedAt: now },
      (tx) =>
        tx.siteVisit.updateMany({
          where: { id: visitId, inspectionId: id, submittedAt: null },
          data,
        }),
    );
    if (updated === null) return notFound(request, "Inspection not found");
    if (updated.count === 0) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This visit was submitted while you were editing it. Reload to see it.",
        status: 409,
      });
    }
    return NextResponse.json({ data: { id: visitId, changed: true } });
  } catch (error) {
    return fromException(request, error, { stage: "site-visit-patch" });
  }
}
