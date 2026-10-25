import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { listCompletenessInboxForOwner } from "@/lib/completeness/org-inbox";
import { canManageAppointments } from "@/lib/scheduling/can-manage-appointments";

/** GET — P4-5 cross-job completeness triage (manager/owner). */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    // RA-8065: gate on the database role; the cookie role goes stale on demotion.
    const caller = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true, role: true },
    });
    if (!canManageAppointments(caller?.role)) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Manager or owner role required",
        status: 403,
      });
    }

    const rows = await listCompletenessInboxForOwner(prisma, {
      userId: session.user.id,
      organizationId: caller?.organizationId,
    });
    return NextResponse.json({ data: rows });
  } catch (error) {
    return fromException(request, error, { stage: "completeness-inbox-get" });
  }
}
