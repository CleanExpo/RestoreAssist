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
 * The submit is pinned to the version it checked (`updatedAt`), so an edit
 * that lands in between makes it answer 409 instead of submitting a visit
 * nobody checked. Once submitted the visit is read-only.
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
import {
  FILE_EVIDENCE_STATUS_SELECT,
  rejectedOnlyFileUrls,
} from "@/lib/evidence/countable-evidence";
import {
  evaluateVisitSubmission,
  isVisitLockedStatus,
} from "@/lib/site-visits/visit-gate";

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

    const visit = await prisma.siteVisit.findFirst({
      where: { id: visitId, inspectionId: id },
      select: {
        id: true,
        visitNumber: true,
        arrivedAt: true,
        departedAt: true,
        metOnSite: true,
        frontPhotoId: true,
        equipmentOutcome: true,
        equipmentNote: true,
        submittedAt: true,
        updatedAt: true,
      },
    });
    if (!visit) return notFound(request);
    if (visit.submittedAt) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This visit has already been submitted.",
        status: 409,
      });
    }

    const job = await prisma.inspection.findUnique({ where: { id }, select: { status: true } });
    if (!job) return notFound(request, "Inspection not found");
    if (isVisitLockedStatus(job.status)) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This job is closed. Reopen it before submitting a site visit.",
        status: 409,
      });
    }

    // The front photo must still be a photo of this job, and (RA-8388) a
    // photograph whose only evidence record is REJECTED does not count.
    let frontPhotoUsable = false;
    if (visit.frontPhotoId) {
      const photo = await prisma.inspectionPhoto.findFirst({
        where: { id: visit.frontPhotoId, inspectionId: id },
        select: { url: true },
      });
      if (photo) {
        const records = await prisma.evidenceItem.findMany({
          where: { inspectionId: id, fileUrl: photo.url },
          select: FILE_EVIDENCE_STATUS_SELECT.select,
        });
        frontPhotoUsable = !rejectedOnlyFileUrls(records).has(photo.url);
      }
    }

    const gate = evaluateVisitSubmission(visit, { frontPhotoUsable });
    if (!gate.ok) {
      // Field names only; never the recorded values.
      console.warn("[site-visit.submit_refused]", {
        inspectionId: id,
        visitId,
        missing: gate.missing.map((m) => m.field),
      });
      return apiError(request, {
        code: "VALIDATION",
        message: `Visit ${visit.visitNumber} cannot be submitted yet: ${gate.missing.map((m) => m.label).join(", ")}.`,
        status: 422,
        fields: Object.fromEntries(gate.missing.map((m) => [m.field, m.label])),
      });
    }

    const now = new Date();
    const claimed = await writeWithinInspectionScope(
      tenancy.data.inspectionManyWhere,
      { updatedAt: now },
      (tx) =>
        tx.siteVisit.updateMany({
          where: { id: visitId, inspectionId: id, submittedAt: null, updatedAt: visit.updatedAt },
          data: { submittedAt: now, submittedById: userId },
        }),
    );
    if (claimed === null) return notFound(request, "Inspection not found");
    if (claimed.count === 0) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This visit changed or was submitted while it was being checked. Reload and try again.",
        status: 409,
      });
    }

    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Site visit submitted",
        entityType: "SiteVisit",
        entityId: visitId,
        userId,
        changes: JSON.stringify({ visitNumber: visit.visitNumber }),
      },
    });

    return NextResponse.json({ data: { id: visitId, visitNumber: visit.visitNumber, submittedAt: now } });
  } catch (error) {
    return fromException(request, error, { stage: "site-visit-submit" });
  }
}
