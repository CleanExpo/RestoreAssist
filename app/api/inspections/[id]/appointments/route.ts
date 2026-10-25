import { NextRequest, NextResponse } from "next/server";
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

    return NextResponse.json({ data: appointments });
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

    // RA-8065: gate on the database role; the cookie role goes stale on demotion.
    if (!(await callerCanManageAppointments(session!.user!.id))) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Only managers or owners may schedule visits",
        status: 403,
      });
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const startsAt = body.startsAt ? new Date(String(body.startsAt)) : null;
    const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      return apiError(request, {
        code: "VALIDATION",
        message: "startsAt and endsAt required (endsAt after startsAt)",
        status: 400,
      });
    }

    const title =
      typeof body.title === "string" && body.title.trim()
        ? sanitizeString(body.title.trim(), 200)
        : "Site visit";

    const assignedUserId =
      typeof body.assignedUserId === "string" && body.assignedUserId.trim()
        ? body.assignedUserId.trim()
        : null;

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

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "appointments-post" });
  }
}
