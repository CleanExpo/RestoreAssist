/**
 * Text the Job In (S1) — pick the job a texted note belongs to.
 *
 * TENANCY: every inspection query here goes through `jobScope`, which is the
 * sender's organisation AND what the sender may WRITE through in the app
 * (`resolveInspectionWriteReach`, the same rules as `assertInspectionTenancy`).
 * The sender comes from their verified MessagingIdentity, never from the
 * message text, so a technician can never reach another organisation's
 * inspection: not by typing its number, and not when that job names them as
 * technician.
 *
 * RA-7582 widened READ reach to the whole organisation at any role, so that an
 * invited technician is not shown an empty product. This feature deliberately
 * did NOT follow. Texting a job number files a note against that job, which is
 * a write, and the guarantee that a technician cannot file against a colleague's
 * job is asserted in this route's own tests. Widening here would have deleted
 * that guarantee as a side effect of fixing a list query.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveInspectionWriteReach } from "@/lib/auth/assert-tenancy";

export const TOP_JOBS_LIMIT = 3;

/** Closed or finished jobs never receive texted notes. */
const INACTIVE_STATUSES = ["COMPLETED", "CLOSED", "ARCHIVED", "REJECTED"] as const;

/** The sender's own organisation. Never widened, even for platform support. */
export function orgScope(organizationId: string): Prisma.InspectionWhereInput {
  return { user: { organizationId } };
}

/**
 * The tenancy boundary for every inspection read and write in this feature.
 * Null when the sender has no reach at all.
 */
export async function jobScope(
  userId: string,
  organizationId: string,
): Promise<Prisma.InspectionWhereInput | null> {
  const reach = await resolveInspectionWriteReach({ user: { id: userId } });
  if (!reach.ok) return null;
  return { AND: [orgScope(organizationId), reach.data] };
}

function active(scope: Prisma.InspectionWhereInput): Prisma.InspectionWhereInput {
  return { AND: [scope, { status: { notIn: [...INACTIVE_STATUSES] } }] };
}

// Real inspection numbers are NIR-YYYY-MM-XXXXXX (app/api/inspections/route.ts).
const JOB_NUMBER_RE = /\b(NIR-\d{4}-\d{2}-[A-Z0-9]{3,})\b/i;

export function extractJobNumber(text: string): string | null {
  const m = JOB_NUMBER_RE.exec(text);
  return m ? m[1].toUpperCase() : null;
}

export interface JobRef {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
}

const JOB_SELECT = {
  id: true,
  inspectionNumber: true,
  propertyAddress: true,
} as const;

export type JobResolution =
  | { kind: "matched"; job: JobRef; via: "number" | "single-active" }
  | { kind: "unmatched"; candidates: JobRef[]; missingNumber: string | null };

export async function resolveJob(
  text: string,
  userId: string,
  scope: Prisma.InspectionWhereInput,
): Promise<JobResolution> {
  const number = extractJobNumber(text);
  if (number) {
    const job = await prisma.inspection.findFirst({
      where: {
        AND: [
          active(scope),
          { inspectionNumber: { equals: number, mode: "insensitive" } },
        ],
      },
      select: JOB_SELECT,
    });
    if (job) return { kind: "matched", job, via: "number" };
  }

  const candidates = await listActiveJobsForTechnician(userId, scope);
  if (!number && candidates.length === 1) {
    return { kind: "matched", job: candidates[0], via: "single-active" };
  }
  return { kind: "unmatched", candidates, missingNumber: number };
}

/** The technician's most recently touched active jobs within the scope. */
export async function listActiveJobsForTechnician(
  userId: string,
  scope: Prisma.InspectionWhereInput,
): Promise<JobRef[]> {
  return prisma.inspection.findMany({
    where: {
      AND: [active(scope), { OR: [{ userId }, { technicianId: userId }] }],
    },
    orderBy: { updatedAt: "desc" },
    take: TOP_JOBS_LIMIT,
    select: JOB_SELECT,
  });
}

/** Re-check a previously offered job is still active and within the scope. */
export async function findActiveJobInScope(
  inspectionId: string,
  scope: Prisma.InspectionWhereInput,
): Promise<JobRef | null> {
  return prisma.inspection.findFirst({
    where: { AND: [active(scope), { id: inspectionId }] },
    select: JOB_SELECT,
  });
}
