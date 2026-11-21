/**
 * RA-8498 (DRC S5) — every site visit write, and every decision it depends on.
 *
 * Review rounds 1 and 2 found the same kind of defect twice: a route read
 * something (the job's status, the visit's times) before the locked write,
 * decided on it, and then wrote inside the lock, so a change landing in
 * between was never seen. The design that removes that kind: the routes make
 * no write decision at all. Each write below runs inside
 * writeWithinInspectionScope, whose first statement claims the job row (the
 * row lock every visit writer takes first), and only then reads the job, the
 * visit, the photo and its evidence records on the same transaction client.
 * Two visit writes on one job therefore run one after the other, and each sees
 * what the one before it committed.
 *
 * A refusal throws VisitRefusal inside the transaction, so it rolls back the
 * parent claim as well: a refused write leaves no trace (not even the job's
 * updatedAt). The routes map the outcome to HTTP and never read for a
 * decision themselves (guarded by visit-write-owner.test.ts).
 *
 * Not covered by the job row lock: evidence review and photo deletion do not
 * take it. A photo delete is refused by the NO ACTION key on frontPhotoId; an
 * evidence record rejected after the submit read it is a named limit (RA-8522).
 */
import type { Prisma } from "@prisma/client";
import type { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { writeWithinInspectionScope } from "@/lib/auth/assert-tenancy";
import { FILE_EVIDENCE_STATUS_SELECT, rejectedOnlyFileUrls } from "@/lib/evidence/countable-evidence";
import { evaluateVisitSubmission, isVisitLockedStatus, type MissingItem, type VisitPatch } from "./visit-gate";

export const JOB_CLOSED_MESSAGE = "This job is closed. Reopen it before recording or changing a site visit.";

export type VisitRefusalCode = "NOT_FOUND" | "CONFLICT" | "VALIDATION";

/** A write refused after the lock was taken. Thrown to roll the transaction back. */
export class VisitRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422,
    readonly code: VisitRefusalCode,
    message: string,
    readonly missing?: MissingItem[],
  ) {
    super(message);
    this.name = "VisitRefusal";
  }
}

export type VisitWriteResult<T> = { ok: true; value: T } | { ok: false; refusal: VisitRefusal };

const SCOPE_LOST = () => new VisitRefusal(404, "NOT_FOUND", "Inspection not found");

/** Claim the job, run `work` under its lock, and turn a refusal into a result. */
async function underJobLock<T>(
  scope: Prisma.InspectionWhereInput,
  now: Date,
  inspectionId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<VisitWriteResult<T>> {
  try {
    const value = await writeWithinInspectionScope(scope, { updatedAt: now }, async (tx) => {
      const job = await tx.inspection.findUnique({ where: { id: inspectionId }, select: { status: true } });
      if (!job) throw SCOPE_LOST();
      if (isVisitLockedStatus(job.status)) throw new VisitRefusal(409, "CONFLICT", JOB_CLOSED_MESSAGE);
      return work(tx);
    });
    if (value === null) return { ok: false, refusal: SCOPE_LOST() };
    return { ok: true, value };
  } catch (error) {
    if (error instanceof VisitRefusal) return { ok: false, refusal: error };
    throw error;
  }
}

/** Start the next visit on a job. Refuses while another visit is open. */
export function startVisit(
  scope: Prisma.InspectionWhereInput,
  args: { inspectionId: string; userId: string; arrivedAt: Date; now: Date },
) {
  return underJobLock(scope, args.now, args.inspectionId, async (tx) => {
    const open = await tx.siteVisit.findFirst({
      where: { inspectionId: args.inspectionId, submittedAt: null },
      select: { visitNumber: true },
    });
    if (open) {
      throw new VisitRefusal(
        409,
        "CONFLICT",
        `Visit ${open.visitNumber} is still open. Submit it before starting another visit.`,
      );
    }
    const last = await tx.siteVisit.findFirst({
      where: { inspectionId: args.inspectionId },
      orderBy: { visitNumber: "desc" },
      select: { visitNumber: true },
    });
    return tx.siteVisit.create({
      data: {
        inspectionId: args.inspectionId,
        visitNumber: (last?.visitNumber ?? 0) + 1,
        technicianId: args.userId,
        arrivedAt: args.arrivedAt,
      },
    });
  });
}

const VISIT_SELECT = {
  id: true,
  visitNumber: true,
  arrivedAt: true,
  departedAt: true,
  metOnSite: true,
  frontPhotoId: true,
  equipmentOutcome: true,
  equipmentNote: true,
  submittedAt: true,
} as const;

async function openVisitInTx(tx: Prisma.TransactionClient, inspectionId: string, visitId: string, submitted: string) {
  const visit = await tx.siteVisit.findFirst({ where: { id: visitId, inspectionId }, select: VISIT_SELECT });
  if (!visit) throw new VisitRefusal(404, "NOT_FOUND", "Site visit not found");
  if (visit.submittedAt) throw new VisitRefusal(409, "CONFLICT", submitted);
  return visit;
}

/** Record items on an open visit. `data` is already parsed by parseVisitPatch. */
export function patchVisit(
  scope: Prisma.InspectionWhereInput,
  args: { inspectionId: string; visitId: string; data: VisitPatch; now: Date },
) {
  const { inspectionId, visitId, data } = args;
  return underJobLock(scope, args.now, inspectionId, async (tx) => {
    const visit = await openVisitInTx(tx, inspectionId, visitId, "This visit has been submitted and can no longer be changed.");
    // The merged times, as they will be stored, read under the lock.
    const arrivedAt = data.arrivedAt !== undefined ? data.arrivedAt : visit.arrivedAt;
    const departedAt = data.departedAt !== undefined ? data.departedAt : visit.departedAt;
    if (arrivedAt && departedAt && departedAt.getTime() <= arrivedAt.getTime()) {
      throw new VisitRefusal(400, "VALIDATION", "Departure time must be after arrival time");
    }
    if (data.frontPhotoId) {
      // Only a photo of this same job; another job's photo id is refused
      // without saying whether it exists.
      const photo = await tx.inspectionPhoto.findFirst({
        where: { id: data.frontPhotoId, inspectionId },
        select: { id: true },
      });
      if (!photo) throw new VisitRefusal(400, "VALIDATION", "The front of property photo must be a photo of this job");
    }
    await tx.siteVisit.update({ where: { id: visit.id }, data });
    return { id: visitId, changed: true };
  });
}

/** Submit a visit: the gate runs on what is stored, under the lock; the audit row commits with it. */
export function submitVisit(
  scope: Prisma.InspectionWhereInput,
  args: { inspectionId: string; visitId: string; userId: string; now: Date },
) {
  const { inspectionId, visitId, userId, now } = args;
  return underJobLock(scope, now, inspectionId, async (tx) => {
    const visit = await openVisitInTx(tx, inspectionId, visitId, "This visit has already been submitted.");

    // The front photo must still be a photo of this job, and (RA-8388) a
    // photograph whose only evidence record is REJECTED does not count.
    let frontPhotoUsable = false;
    if (visit.frontPhotoId) {
      const photo = await tx.inspectionPhoto.findFirst({
        where: { id: visit.frontPhotoId, inspectionId },
        select: { url: true },
      });
      if (photo) {
        const records = await tx.evidenceItem.findMany({
          where: { inspectionId, fileUrl: photo.url },
          select: FILE_EVIDENCE_STATUS_SELECT.select,
        });
        frontPhotoUsable = !rejectedOnlyFileUrls(records).has(photo.url);
      }
    }

    const gate = evaluateVisitSubmission(visit, { frontPhotoUsable });
    if (!gate.ok) {
      throw new VisitRefusal(
        422,
        "VALIDATION",
        `Visit ${visit.visitNumber} cannot be submitted yet: ${gate.missing.map((m) => m.label).join(", ")}.`,
        gate.missing,
      );
    }

    await tx.siteVisit.update({ where: { id: visit.id }, data: { submittedAt: now, submittedById: userId } });
    await tx.auditLog.create({
      data: {
        inspectionId,
        action: "Site visit submitted",
        entityType: "SiteVisit",
        entityId: visitId,
        userId,
        // The visit number only, never the recorded values.
        changes: JSON.stringify({ visitNumber: visit.visitNumber }),
      },
    });
    return { id: visitId, visitNumber: visit.visitNumber, submittedAt: now };
  });
}

/** The HTTP answer for a refusal: 422 carries every missing item in `error.fields`. */
export function visitRefusalResponse(request: NextRequest, refusal: VisitRefusal): NextResponse {
  if (refusal.missing) {
    // Field names only; never the recorded values.
    console.warn("[site-visit.submit_refused]", { missing: refusal.missing.map((m) => m.field) });
  }
  return apiError(request, {
    code: refusal.code,
    message: refusal.message,
    status: refusal.status,
    ...(refusal.missing ? { fields: Object.fromEntries(refusal.missing.map((m) => [m.field, m.label])) } : {}),
  });
}
