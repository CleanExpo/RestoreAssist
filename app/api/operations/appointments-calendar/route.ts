import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveInspectionReach } from "@/lib/auth/assert-tenancy";

/** GET — org-scoped scheduled visits for the calendar (P5 JobAppointment.startsAt). */
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

    const reach = await resolveInspectionReach(session);
    if (!reach.ok) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: reach.reason,
        status: reach.status,
      });
    }

    const { searchParams } = request.nextUrl;
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    if (!fromRaw || !toRaw) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Query params from and to (ISO dates) are required",
        status: 400,
      });
    }

    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid from/to range",
        status: 400,
      });
    }

    const rows = await prisma.jobAppointment.findMany({
      where: {
        status: { not: "CANCELLED" },
        startsAt: { gte: from, lte: to },
        inspection: reach.data,
      },
      orderBy: { startsAt: "asc" },
      take: 500,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        inspection: {
          select: {
            id: true,
            inspectionNumber: true,
            propertyAddress: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: row.status,
        inspectionId: row.inspection.id,
        inspectionNumber: row.inspection.inspectionNumber,
        propertyAddress: row.inspection.propertyAddress,
        inspectionStatus: row.inspection.status,
      })),
    });
  } catch (error) {
    return fromException(request, error, {
      stage: "appointments-calendar-get",
    });
  }
}
