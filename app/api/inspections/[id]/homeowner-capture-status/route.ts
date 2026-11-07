import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { summarizePendingHomeownerCapture } from "@/lib/sketch/pending-homeowner-summary";
import { collectRoomsNeedingMeasurement } from "@/lib/sketch/rooms-needing-measurement";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const sketches = await prisma.claimSketch.findMany({
      where: { inspectionId: id },
      select: {
        floorNumber: true,
        floorLabel: true,
        pendingHomeownerCapture: true,
        sketchData: true,
      },
      orderBy: { floorNumber: "asc" },
      take: 50,
    });

    const pending = summarizePendingHomeownerCapture(sketches);
    const needingMeasure = collectRoomsNeedingMeasurement(
      sketches.map((s) => ({
        floorLabel: s.floorLabel,
        sketchData: s.sketchData,
      })),
    );

    const activeInvite = await prisma.captureToken.count({
      where: {
        inspectionId: id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return NextResponse.json({
      data: {
        ...pending,
        activeCaptureLinks: activeInvite,
        roomsNeedingMeasurement: needingMeasure.length,
        measurementRooms: needingMeasure.slice(0, 50),
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "homeowner-capture-status" });
  }
}
