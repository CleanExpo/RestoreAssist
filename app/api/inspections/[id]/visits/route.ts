/**
 * RA-8498 (DRC S5) — site visits on a job.
 *
 * GET  /api/inspections/[id]/visits  list the job's visits (organisation read reach)
 * POST /api/inspections/[id]/visits  start a visit: the first attendance or a re-attendance
 *
 * Starting is a field-data create (D-028): the owner's reach or the assigned
 * technician, re-checked inside the write. One visit may be open on a job at
 * a time; the previous one is submitted before the next starts. The rules for
 * what a visit must record live in lib/site-visits/visit-gate.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { JOB_CLOSED_MESSAGE, jobTakesVisitsInTx } from "@/lib/site-visits/job-open-in-tx";
import { signStoredMediaUrl } from "@/lib/storage/sign-stored-url";
import {
  assertInspectionAssignedWrite,
  assertInspectionReadable,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import {
  isVisitLockedStatus,
  minutesOnSite,
  parseVisitPatch,
} from "@/lib/site-visits/visit-gate";

const LIST_LIMIT = 50;

const tenancyRefusal = (request: NextRequest, t: { status: number; reason: string }) =>
  apiError(request, {
    code: t.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
    message: t.status === 401 ? "Unauthorized" : "Inspection not found",
    status: t.status === 401 ? 401 : 404,
  });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) return tenancyRefusal(request, tenancy);

    const visits = await prisma.siteVisit.findMany({
      where: { inspectionId: id },
      orderBy: { visitNumber: "asc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        visitNumber: true,
        technicianId: true,
        arrivedAt: true,
        departedAt: true,
        metOnSite: true,
        frontPhotoId: true,
        frontPhoto: { select: { id: true, url: true, thumbnailUrl: true } },
        equipmentOutcome: true,
        equipmentNote: true,
        submittedAt: true,
        submittedById: true,
        updatedAt: true,
      },
    });

    // The optimised bucket is private: sign the front photo's stored URLs,
    // as the photos route does.
    const data = await Promise.all(
      visits.map(async (v) => ({
        ...v,
        frontPhoto: v.frontPhoto
          ? {
              id: v.frontPhoto.id,
              url: await signStoredMediaUrl(v.frontPhoto.url),
              thumbnailUrl: await signStoredMediaUrl(v.frontPhoto.thumbnailUrl),
            }
          : null,
        minutesOnSite: minutesOnSite(v.arrivedAt, v.departedAt),
      })),
    );
    return NextResponse.json({ data });
  } catch (error) {
    return fromException(request, error, { stage: "site-visits-get" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok) return tenancyRefusal(request, tenancy);
    const userId = session!.user!.id;

    const raw = (await request.json().catch(() => ({}))) as unknown;
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const now = new Date();
    // Only an arrival time may be given when starting; the rest is recorded
    // with PATCH. Same validation as an update.
    const parsed = parseVisitPatch("arrivedAt" in body ? { arrivedAt: body.arrivedAt } : {}, now);
    if (!parsed.ok) {
      return apiError(request, { code: "VALIDATION", message: parsed.error, status: 400 });
    }
    const arrivedAt = parsed.data.arrivedAt ?? now;

    const job = await prisma.inspection.findUnique({ where: { id }, select: { status: true } });
    if (!job) return tenancyRefusal(request, { status: 404, reason: "Inspection not found" });
    if (isVisitLockedStatus(job.status)) {
      return apiError(request, {
        code: "CONFLICT",
        message: JOB_CLOSED_MESSAGE,
        status: 409,
      });
    }

    // The scoped parent write takes the job's row lock, so two starts on the
    // same job run one after the other: the second sees the first's open
    // visit. The (inspectionId, visitNumber) unique key backs that up (a
    // collision answers 409 through fromException).
    const result = await writeWithinInspectionScope(
      tenancy.data.inspectionManyWhere,
      { updatedAt: now },
      async (tx) => {
        if (!(await jobTakesVisitsInTx(tx, id))) return { closed: true } as const;
        const open = await tx.siteVisit.findFirst({
          where: { inspectionId: id, submittedAt: null },
          select: { id: true, visitNumber: true },
        });
        if (open) return { conflict: open.visitNumber } as const;
        const last = await tx.siteVisit.findFirst({
          where: { inspectionId: id },
          orderBy: { visitNumber: "desc" },
          select: { visitNumber: true },
        });
        const visit = await tx.siteVisit.create({
          data: {
            inspectionId: id,
            visitNumber: (last?.visitNumber ?? 0) + 1,
            technicianId: userId,
            arrivedAt,
          },
        });
        return { visit } as const;
      },
    );

    if (result === null) return tenancyRefusal(request, { status: 404, reason: "Inspection not found" });
    if ("closed" in result) return apiError(request, {
        code: "CONFLICT",
        message: JOB_CLOSED_MESSAGE,
        status: 409,
      });
    if ("conflict" in result) {
      return apiError(request, {
        code: "CONFLICT",
        message: `Visit ${result.conflict} is still open. Submit it before starting another visit.`,
        status: 409,
      });
    }
    return NextResponse.json({ data: result.visit }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "site-visits-post" });
  }
}
