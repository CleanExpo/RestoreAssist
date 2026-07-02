import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { assessDryingReadiness } from "@/lib/inspections/drying-readiness";
import { apiError, fromException } from "@/lib/api-errors";

// GET /api/inspections/[id]/drying-status — read-only S500 drying readiness:
// is the job dry enough to sign off? Advisory for the close-confirm UI; it does
// NOT touch the close transaction. Rule 1: auth. Rule 4: explicit select.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }

    const { id } = await params;

    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const readings = await prisma.moistureReading.findMany({
      where: { inspectionId: id },
      select: {
        location: true,
        surfaceType: true,
        moistureLevel: true,
        unit: true,
        isBaseline: true,
      },
      orderBy: { recordedAt: "desc" },
      take: 200,
    });

    const readiness = assessDryingReadiness(
      readings.map((r) => ({
        location: r.location ?? null,
        surfaceType: r.surfaceType ?? null,
        moistureLevel: r.moistureLevel,
        unit: r.unit ?? null,
        isBaseline: r.isBaseline,
      })),
    );

    return NextResponse.json({ data: readiness });
  } catch (error) {
    return fromException(request, error, { stage: "inspections/drying-status GET" });
  }
}
