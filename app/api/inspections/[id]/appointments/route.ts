import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  assertInspectionReadable,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { sanitizeString } from "@/lib/sanitize";
import { callerCanManageAppointments } from "@/lib/scheduling/can-manage-appointments";
import { notifyTechnicianOfBooking } from "@/lib/scheduling/appointment-notice";
import {
  resolveTimeZone,
  zonedWallClockToInstant,
} from "@/lib/calendar/zoned-time";

/**
 * RA-8497: the caller's organisation and its timezone, re-read from the
 * database. Typed booking times are read in this zone, and the panel shows
 * stored times in it, so the office sees the time it booked whatever the
 * browser's zone. An organisation-less account reads the default zone.
 */
async function callerOrganisation(
  userId: string,
): Promise<{ organizationId: string | null; timeZone: string }> {
  const caller = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  const organizationId =
    typeof caller?.organizationId === "string" && caller.organizationId
      ? caller.organizationId
      : null;
  const org = organizationId
    ? await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { timezone: true },
      })
    : null;
  return { organizationId, timeZone: resolveTimeZone(org?.timezone) };
}

/** GET / POST — V1 Phase 5 job appointments */
export async function GET(
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
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const appointments = await prisma.jobAppointment.findMany({
      where: { inspectionId: id },
      orderBy: { startsAt: "asc" },
      take: 100,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        notes: true,
        assignedUserId: true,
        acknowledgedAt: true,
      },
    });

    const { timeZone } = await callerOrganisation(session.user.id);
    return NextResponse.json({ data: appointments, timeZone });
  } catch (error) {
    return fromException(request, error, { stage: "appointments-get" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    const write = await resolveInspectionWrite(session, id);
    if (!write.ok) {
      return apiError(request, {
        code:
          write.status === 401
            ? "UNAUTHORIZED"
            : write.status === 403
              ? "FORBIDDEN"
              : "NOT_FOUND",
        message: write.reason,
        status: write.status,
      });
    }

    // RA-8065: the database role, never the cookie's, which survives a demotion.
    if (!(await callerCanManageAppointments(session!.user.id))) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Only managers or owners may schedule visits",
        status: 403,
      });
    }

    const parsed: unknown = await request.json().catch(() => ({}));
    // A JSON array, string or null is not a booking; `in` would throw on it.
    const body = (
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
    ) as Record<string, unknown>;
    // RA-8497: the caller's organisation scopes both the timezone typed
    // times are read in and who may be assigned.
    const { organizationId: callerOrgId, timeZone } = await callerOrganisation(
      session!.user!.id,
    );

    let startsAt: Date | null;
    let endsAt: Date | null;
    if ("date" in body || "startTime" in body || "endTime" in body) {
      // RA-8497: the booking form sends the date and times the office typed.
      // They are read in the organisation's timezone, never the browser's,
      // so an office worker in another state books the organisation's 9 am.
      const date = String(body.date ?? "");
      startsAt = zonedWallClockToInstant(date, String(body.startTime ?? ""), timeZone);
      endsAt = zonedWallClockToInstant(date, String(body.endTime ?? ""), timeZone);
      if (!startsAt || !endsAt) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Enter the visit's date and times",
          status: 400,
        });
      }
      if (endsAt <= startsAt) {
        return apiError(request, {
          code: "VALIDATION",
          message: "The visit must end after it starts",
          status: 400,
        });
      }
    } else {
      startsAt = body.startsAt ? new Date(String(body.startsAt)) : null;
      endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
      if (
        !startsAt ||
        !endsAt ||
        Number.isNaN(startsAt.getTime()) ||
        Number.isNaN(endsAt.getTime()) ||
        endsAt <= startsAt
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "startsAt and endsAt required (endsAt after startsAt)",
          status: 400,
        });
      }
    }

    const title =
      typeof body.title === "string" && body.title.trim()
        ? sanitizeString(body.title.trim(), 200)
        : "Site visit";

    const requestedAssignee =
      typeof body.assignedUserId === "string" && body.assignedUserId.trim()
        ? body.assignedUserId.trim()
        : null;

    // RA-8497: the assignee is told about the job by email, so a body id is
    // never trusted. They must be in the caller's organisation (two
    // organisation-less accounts never match) AND able to open this job,
    // checked as them, so the notice never reaches an outsider or links to a
    // job they would get a 404 on.
    let assignedUserId: string | null = null;
    if (requestedAssignee) {
      const assignee = callerOrgId
        ? await prisma.user.findFirst({
            where: { id: requestedAssignee, organizationId: callerOrgId },
            select: { id: true },
          })
        : null;
      const canOpen = assignee
        ? (await assertInspectionReadable({ user: { id: assignee.id } }, id)).ok
        : false;
      if (!assignee || !canOpen) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Choose a technician from your team who can open this job",
          status: 400,
        });
      }
      assignedUserId = assignee.id;
    }

    const row = await prisma.jobAppointment.create({
      data: {
        inspectionId: id,
        title,
        startsAt,
        endsAt,
        notes:
          typeof body.notes === "string"
            ? sanitizeString(body.notes, 2000)
            : null,
        assignedUserId,
        createdByUserId: session!.user!.id,
      },
    });

    if (assignedUserId) {
      // RA-8497: tell the technician (in-app, and email with a calendar
      // file). Fire-and-forget (rule 13): the 201 never waits on email, a
      // failed notice never fails the booking, and after() keeps the work
      // alive past the response. At most once per booking (delivery ledger).
      // The notice starts INSIDE the callback, after the response, so it reads
      // the booking's status then: one cancelled in the meantime is not sent.
      const appointmentId = row.id;
      const runNotice = () =>
        notifyTechnicianOfBooking({ appointmentId }).catch((err) =>
          console.error("[appointment-notice] booking notice failed:", err),
        );
      try {
        after(runNotice);
      } catch {
        // Outside a request scope after() throws; send without it.
        void runNotice();
      }
    }

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "appointments-post" });
  }
}
