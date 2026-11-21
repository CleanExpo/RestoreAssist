import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  assertInspectionCapturable,
  assertInspectionReadable,
  isPlatformSupportOperator,
} from "@/lib/auth/assert-tenancy";
import { jobNoteAuthorName, parseJobNoteInput } from "@/lib/job-notes";

/**
 * RA-8496 — append-only, time-stamped job notes.
 *
 * GET  newest first, for anyone in the job's organisation (read reach).
 * POST adds a note, for anyone in the job's organisation (create-only reach,
 *      `assertInspectionCapturable`): office staff log calls and bookings,
 *      technicians log what they found.
 *
 * Platform support can read any job's notes, as on every inspection route,
 * but cannot add one to a business it does not belong to: the note would be
 * stamped with the operator's own role and read as written by that business.
 *
 * There is deliberately no PUT, PATCH or DELETE. A note is never changed; a
 * correction is a new note, and the database refuses changes too (trigger
 * "job_note_append_only"). The author, role and time are set here from the
 * database and the server clock, never from the request.
 */

type RouteContext = { params: Promise<{ id: string }> };

const NOTE_SELECT = {
  id: true,
  kind: true,
  body: true,
  authorName: true,
  authorRole: true,
  createdAt: true,
} as const;

const MAX_NOTES = 500;

/** Prisma error code, if the value carries one. */
function prismaCode(error: unknown): unknown {
  return typeof error === "object" && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
}

function noteJson(n: {
  id: string;
  kind: string;
  body: string;
  authorName: string;
  authorRole: string;
  createdAt: Date;
}) {
  return {
    id: n.id,
    kind: n.kind,
    body: n.body,
    authorName: n.authorName,
    authorRole: n.authorRole,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Prisma P2021: the table does not exist yet (migration not applied). */
function tableMissing(request: NextRequest, error: unknown) {
  if (prismaCode(error) === "P2021") {
    return apiError(request, {
      code: "FEATURE_UNAVAILABLE",
      message: "Job notes are not available yet",
      status: 503,
      err: error,
      // Its own label, so the expected pre-migration state is never read as
      // (or hides) a real fault logged under inspection:notes:get/post.
      stage: "inspection:notes:migration-pending",
    });
  }
  return null;
}

function refusal(
  request: NextRequest,
  status: 401 | 403 | 404,
  reason: string,
) {
  return apiError(request, {
    code:
      status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "FORBIDDEN"
          : "NOT_FOUND",
    message: reason,
    status,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return refusal(request, 401, "Unauthorized");

    const { id } = await context.params;
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) return refusal(request, tenancy.status, tenancy.reason);

    const rows = await prisma.jobNote.findMany({
      where: { inspectionId: tenancy.data.id },
      // id breaks a tie between two notes stamped in the same millisecond.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // One more than shown, so the reader is told older notes exist.
      take: MAX_NOTES + 1,
      select: NOTE_SELECT,
    });
    const truncated = rows.length > MAX_NOTES;
    const notes = truncated ? rows.slice(0, MAX_NOTES) : rows;

    return NextResponse.json({
      data: notes.map(noteJson),
      meta: { truncated },
    });
  } catch (error) {
    return (
      tableMissing(request, error) ??
      fromException(request, error, { stage: "inspection:notes:get" })
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return refusal(request, 401, "Unauthorized");
    const userId = session.user.id;

    const limited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      prefix: "job-notes",
      key: userId,
    });
    if (limited) return limited;

    const { id } = await context.params;
    const tenancy = await assertInspectionCapturable(session, id);
    if (!tenancy.ok) return refusal(request, tenancy.status, tenancy.reason);
    const inspectionId = tenancy.data.id;

    const parsed = parseJobNoteInput(await request.json().catch(() => null));
    if (!parsed.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.message,
        status: 400,
      });
    }

    // The stamp comes from the database, not the session: the JWT can carry a
    // role for up to 90 days after a change.
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true, organizationId: true },
    });
    if (!author) return refusal(request, 401, "Unauthorized");

    // Platform scope reaches every tenant by id. Writing needs membership of
    // this job's business (or being the job's creator); otherwise the same
    // 404 any outsider gets.
    if (isPlatformSupportOperator(userId)) {
      const job = await prisma.inspection.findUnique({
        where: { id: inspectionId },
        select: { userId: true, user: { select: { organizationId: true } } },
      });
      const sameBusiness =
        !!author.organizationId &&
        author.organizationId === job?.user?.organizationId;
      if (!job || (job.userId !== userId && !sameBusiness)) {
        return refusal(request, 404, "Inspection not found");
      }
    }

    let note;
    try {
      note = await prisma.jobNote.create({
        data: {
          inspectionId,
          authorUserId: userId,
          authorName: jobNoteAuthorName(author.name),
          authorRole: author.role,
          kind: parsed.kind,
          body: parsed.body,
          clientRequestId: parsed.clientRequestId,
        },
        select: NOTE_SELECT,
      });
    } catch (error) {
      // The same draft saved twice (the first response was lost): hand back
      // the note already written rather than a second copy.
      if (prismaCode(error) === "P2002" && parsed.clientRequestId) {
        const existing = await prisma.jobNote.findFirst({
          where: { inspectionId, clientRequestId: parsed.clientRequestId },
          select: NOTE_SELECT,
        });
        if (existing) return NextResponse.json({ data: noteJson(existing) });
      }
      throw error;
    }

    return NextResponse.json({ data: noteJson(note) }, { status: 201 });
  } catch (error) {
    return (
      tableMissing(request, error) ??
      fromException(request, error, { stage: "inspection:notes:post" })
    );
  }
}
