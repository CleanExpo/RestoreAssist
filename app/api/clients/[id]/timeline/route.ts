import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { buildClientTimeline } from "@/lib/crm/client-timeline";
import {
  resolveClientReach,
  resolveInspectionReach,
} from "@/lib/auth/assert-tenancy";

const MAX_JOBS = 50;
const MAX_COMMS = 200;

/** RA-8220: a client's history across jobs. Same ownership rule as GET /api/clients/[id]. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }
    const { id } = await params;
    // RA-8535: the client takes the list's reach; each job on it takes the
    // caller's own job reach, so opening a client shows no job the caller
    // could not open directly.
    const [clientReach, inspectionReach] = await Promise.all([
      resolveClientReach(session),
      resolveInspectionReach(session),
    ]);
    if (!clientReach.ok || !inspectionReach.ok) {
      const denied = !clientReach.ok
        ? clientReach
        : (inspectionReach as typeof clientReach & { ok: false });
      return apiError(request, { code: "UNAUTHORIZED", message: denied.reason, status: denied.status });
    }
    const client = await prisma.client.findFirst({
      where: { AND: [{ id }, clientReach.data] },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const inspections = await prisma.inspection.findMany({
      where: { AND: [{ clientId: id }, inspectionReach.data] },
      select: {
        id: true,
        inspectionNumber: true,
        propertyAddress: true,
        claimType: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_JOBS,
    });
    const comms = inspections.length
      ? await prisma.clientCommsLog.findMany({
          where: { inspectionId: { in: inspections.map((i) => i.id) }, status: "SENT" },
          select: { inspectionId: true, createdAt: true, status: true, eventType: true },
          orderBy: { createdAt: "desc" },
          take: MAX_COMMS,
        })
      : [];

    return NextResponse.json({ events: buildClientTimeline(inspections, comms) });
  } catch (error) {
    return fromException(request, error);
  }
}
