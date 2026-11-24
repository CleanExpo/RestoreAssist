import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  assertInspectionAssignedWrite,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { callerCanManageAppointments } from "@/lib/scheduling/can-manage-appointments";
import { notifyTechnicianOfCancellation } from "@/lib/scheduling/appointment-notice";

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
      // RA-8065: the database role, never the cookie's, which survives a demotion.
      if (!(await callerCanManageAppointments(session!.user.id))) {
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
    if (action === "acknowledge") {
      const updated = await prisma.jobAppointment.update({
        where: { id: appointmentId },
        data: { status: "ACKNOWLEDGED", acknowledgedAt: now },
      });
      return NextResponse.json({ data: updated });
    }

    // RA-8525: only the request that moves the visit to CANCELLED tells the
    // technician, so a repeated or concurrent cancel sends nothing twice.
    const cancelled = await prisma.jobAppointment.updateMany({
      where: { id: appointmentId, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    if (cancelled.count === 1 && existing.assignedUserId) {
      // In-app notice and a calendar cancellation for the event the booking
      // email added. Fire-and-forget (rule 13), started INSIDE after() so the
      // response never waits on email and a failure never fails the cancel.
      const runNotice = () =>
        notifyTechnicianOfCancellation({ appointmentId }).catch((err) =>
          console.error("[appointment-cancel-notice] cancel notice failed:", err),
        );
      try {
        after(runNotice);
      } catch {
        // Outside a request scope after() throws; send without it.
        void runNotice();
      }
    }
    const updated = await prisma.jobAppointment.findUnique({
      where: { id: appointmentId },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fromException(request, error, { stage: "appointments-patch" });
  }
}
