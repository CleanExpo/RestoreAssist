import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  assertInspectionAssignedWrite,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { callerCanManageAppointments } from "@/lib/scheduling/can-manage-appointments";

/** PATCH — acknowledge or cancel an appointment (P5-1). */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; appointmentId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, appointmentId } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
    };
    const action = body.action;
    if (action !== "acknowledge" && action !== "cancel") {
      return apiError(request, {
        code: "VALIDATION",
        message: "action must be acknowledge or cancel",
        status: 400,
      });
    }

    const write =
      action === "acknowledge"
        ? await assertInspectionAssignedWrite(session, id)
        : await resolveInspectionWrite(session, id);
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

    if (action === "cancel") {
      // RA-8065: gate on the database role; the cookie role goes stale on demotion.
      if (!(await callerCanManageAppointments(session!.user!.id))) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Only managers or owners may cancel visits",
          status: 403,
        });
      }
    }

    const existing = await prisma.jobAppointment.findFirst({
      where: { id: appointmentId, inspectionId: id },
      select: { id: true, status: true, assignedUserId: true },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Appointment not found",
        status: 404,
      });
    }

    const userId = session!.user!.id;
    if (
      action === "acknowledge" &&
      existing.assignedUserId &&
      existing.assignedUserId !== userId
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Only the assigned technician may acknowledge",
        status: 403,
      });
    }

    const now = new Date();
    const updated = await prisma.jobAppointment.update({
      where: { id: appointmentId },
      data:
        action === "acknowledge"
          ? { status: "ACKNOWLEDGED", acknowledgedAt: now }
          : { status: "CANCELLED", cancelledAt: now },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fromException(request, error, { stage: "appointments-patch" });
  }
}
