import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { buildClientTimeline } from "@/lib/crm/client-timeline";

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
    const client = await prisma.client.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const inspections = await prisma.inspection.findMany({
      where: { clientId: id },
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
