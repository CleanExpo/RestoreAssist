/**
 * RA-8495 (DRC S2) — POST /api/inspections/intake: the office logs a job.
 *
 * The job gets the organisation's next job number (lib/jobs/job-number.ts) in
 * the same transaction that creates it, together with its audit row and the
 * idempotency completion, so a retried save returns the first job instead of
 * taking a second number (RA-1266 class).
 *
 * The organisation is read from the caller's database row, never from the
 * body or the session token. Only the fields parseOfficeIntake names are read
 * from the body.
 *
 * This slice numbers office-logged jobs only; POST /api/inspections keeps
 * jobNumber null.
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  completeIdempotentSuccessInTransaction,
  getIdempotencyKey,
  replaceCompletedIdempotentResponse,
  withIdempotency,
} from "@/lib/idempotency";
import { allocateJobNumber } from "@/lib/jobs/job-number";
import { filledFieldNames, parseOfficeIntake } from "@/lib/jobs/office-intake";
import { reportError } from "@/lib/observability";
import { scheduleZohoInspectionPush } from "@/lib/integrations/zoho/queue";

class IdempotencyReservationLostError extends Error {}
class JobNumberCollisionError extends Error {
  constructor(
    readonly organizationId: string,
    readonly jobNumber: string | null,
  ) {
    super("Job number collision");
  }
}

const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

function isJobNumberUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return text.includes("jobNumber");
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }
  const userId = session.user.id;

  // A save without a key could be double-submitted into two jobs and two
  // numbers. The intake form always sends one.
  const keyResult = getIdempotencyKey(request);
  if (keyResult.ok && !keyResult.key) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Idempotency-Key header is required",
      status: 400,
      stage: "idempotency",
    });
  }

  return withIdempotency(
    request,
    userId,
    async (rawBody) => {
      const creationKey = keyResult.ok ? keyResult.key : null;
      let organizationId: string | null = null;
      try {
        let body: unknown;
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return apiError(request, { code: "VALIDATION", message: "Invalid JSON body", status: 400 });
        }
        const parsed = parseOfficeIntake(body);
        if (!parsed.ok) {
          return apiError(request, {
            code: "VALIDATION",
            message: "Check the highlighted fields",
            status: 400,
            fields: parsed.fields,
          });
        }
        const input = parsed.data;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { organizationId: true },
        });
        organizationId = user?.organizationId ?? null;
        if (!organizationId) {
          return apiError(request, {
            code: "NO_ORGANISATION",
            message: "Your account is not part of an organisation, so a job number cannot be issued",
            status: 409,
            stage: "resolve-org",
          });
        }
        const orgId = organizationId;

        const now = new Date();
        const inspectionNumber = `NIR-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${randomBytes(3).toString("hex").toUpperCase()}`;

        const created = await prisma.$transaction(async (tx) => {
          const allocated = await allocateJobNumber(tx, orgId);
          let inspection;
          try {
            inspection = await tx.inspection.create({
              data: {
                inspectionNumber,
                propertyAddress: input.propertyAddress,
                propertyPostcode: input.propertyPostcode,
                claimNumber: input.claimNumber,
                claimType: input.claimType,
                policyNumber: input.policyNumber,
                clientType: input.clientType,
                insuredName: input.insuredName,
                insuredPhone: input.insuredPhone,
                insuredEmail: input.insuredEmail,
                officeNotes: input.officeNotes,
                jobNumber: allocated.jobNumber,
                jobNumberOrganizationId: orgId,
                userId,
                status: "DRAFT",
                source: "OFFICE_INTAKE",
              },
              select: { id: true, jobNumber: true, inspectionNumber: true, claimType: true },
            });
          } catch (error) {
            if (isJobNumberUniqueViolation(error)) {
              throw new JobNumberCollisionError(orgId, allocated.jobNumber);
            }
            throw error;
          }
          // Who logged the job and when, committed with it. Field names only:
          // insured contact values never go into the audit log.
          await tx.auditLog.create({
            data: {
              inspectionId: inspection.id,
              action: "Job logged by office",
              entityType: "Inspection",
              entityId: inspection.id,
              userId,
              changes: JSON.stringify({
                jobNumber: inspection.jobNumber,
                fieldsSet: filledFieldNames(input),
              }),
            },
          });
          const responseInspection = {
            id: inspection.id,
            jobNumber: inspection.jobNumber,
            inspectionNumber: inspection.inspectionNumber,
          };
          if (creationKey) {
            const completed = await completeIdempotentSuccessInTransaction({
              tx,
              scope: userId,
              key: creationKey,
              method: "POST",
              path: request.nextUrl.pathname,
              rawBody,
              // null = not known yet. Seeding runs after commit; the cached
              // body is replaced with the real outcome below (RA-8515), so a
              // retry that missed this answer still sees the warning.
              responseBody: JSON.stringify({ inspection: responseInspection, makeSafeSeeded: null }),
              responseStatus: 201,
            });
            if (!completed) throw new IdempotencyReservationLostError();
          }
          return { responseInspection, claimType: inspection.claimType };
        }, TX_OPTIONS);

        // After commit: nothing here may turn a saved job into an error.
        let makeSafeSeeded = true;
        try {
          const { ensureMakeSafeSeeded } = await import("@/lib/compliance/seed-make-safe");
          await ensureMakeSafeSeeded(created.responseInspection.id, created.claimType);
        } catch (seedErr) {
          makeSafeSeeded = false;
          reportError(seedErr, {
            route: "/api/inspections/intake",
            stage: "seed-make-safe",
            inspectionId: created.responseInspection.id,
            jobNumber: created.responseInspection.jobNumber,
          });
        }
        if (creationKey) {
          try {
            await replaceCompletedIdempotentResponse({
              scope: userId,
              key: creationKey,
              method: "POST",
              path: request.nextUrl.pathname,
              rawBody,
              responseBody: JSON.stringify({ inspection: created.responseInspection, makeSafeSeeded }),
            });
          } catch (cacheErr) {
            // The replay keeps makeSafeSeeded: null, which the page shows as
            // "check the make-safe checklist".
            reportError(cacheErr, {
              route: "/api/inspections/intake",
              stage: "idempotency-seed-outcome",
              inspectionId: created.responseInspection.id,
            });
          }
        }
        scheduleZohoInspectionPush(created.responseInspection.id);

        return NextResponse.json(
          { inspection: created.responseInspection, makeSafeSeeded },
          {
            status: 201,
            headers: { "X-RestoreAssist-Idempotency-Completed-In-Transaction": "true" },
          },
        );
      } catch (error) {
        if (error instanceof JobNumberCollisionError) {
          return apiError(request, {
            code: "JOB_NUMBER_COLLISION",
            message: "The job could not be numbered. Please contact support",
            status: 409,
            stage: "allocate",
            err: error,
            context: { organizationId: error.organizationId, jobNumber: error.jobNumber },
          });
        }
        if (error instanceof IdempotencyReservationLostError) {
          const response = apiError(request, {
            code: "CONFLICT",
            message: "The save could not be confirmed; check the job list before retrying",
            status: 409,
            stage: "idempotency",
          });
          response.headers.set("X-RestoreAssist-Idempotency-Uncertain", "true");
          return response;
        }
        return fromException(request, error, { stage: "create" });
      }
    },
    { successCompletedInHandler: "when-marked" },
  );
}
