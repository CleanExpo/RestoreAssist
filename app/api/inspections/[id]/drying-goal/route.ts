/**
 * Drying Goal Validation — IICRC S500 psychrometric gate
 *
 * GET  /api/inspections/[id]/drying-goal  — Get current drying goal status
 * POST /api/inspections/[id]/drying-goal  — Create/initialise drying goal record
 * PUT  /api/inspections/[id]/drying-goal  — Evaluate all moisture readings against EMC targets.
 *                                           If ALL readings ≤ target, marks goalAchieved = true
 *                                           and stamps goalAchievedAt with current timestamp.
 *                                           Returns "ACHIEVED" or "IN_PROGRESS" with gap detail.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IICRC_DRY_STANDARDS, getDryStandard } from "@/lib/iicrc-dry-standards";

// Material EMC targets for the "Drying Goal: ACHIEVED" gate
// These map the iicrc-dry-standards.ts values into the per-material target JSON
function buildMaterialTargets(): Record<string, number> {
  const targets: Record<string, number> = {};
  for (const std of IICRC_DRY_STANDARDS) {
    targets[std.material] = std.dryThreshold;
  }
  return targets;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: inspectionId } = await params;

    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const record = await (prisma as any).dryingGoalRecord.findUnique({
      where: { inspectionId },
    });

    return NextResponse.json({ dryingGoal: record });
  } catch (error) {
    console.error("[drying-goal GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: inspectionId } = await params;
    const body = await request.json();
    const { targetCategory, targetClass } = body as {
      targetCategory: string;
      targetClass: string;
    };

    const VALID_TARGET_CATEGORIES = [
      "Category 1",
      "Category 2",
      "Category 3",
    ] as const;
    const VALID_TARGET_CLASSES = [
      "Class 1",
      "Class 2",
      "Class 3",
      "Class 4",
    ] as const;

    if (
      !VALID_TARGET_CATEGORIES.includes(
        targetCategory as (typeof VALID_TARGET_CATEGORIES)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `targetCategory must be one of: ${VALID_TARGET_CATEGORIES.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (
      !VALID_TARGET_CLASSES.includes(
        targetClass as (typeof VALID_TARGET_CLASSES)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `targetClass must be one of: ${VALID_TARGET_CLASSES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Verify ownership + get classification
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    // Use create-and-catch instead of findUnique+create to eliminate the TOCTOU
    // race where two simultaneous POST requests both read null and both attempt create.
    let record;
    try {
      record = await (prisma as any).dryingGoalRecord.create({
        data: {
          inspectionId,
          targetCategory,
          targetClass,
          materialTargets: buildMaterialTargets(),
          goalAchieved: false,
          iicrcReference: "IICRC S500:2025 §11.4",
        },
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        return NextResponse.json(
          {
            error:
              "Drying goal already initialised for this inspection. Use PUT to evaluate.",
          },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json({
      dryingGoal: record,
      message:
        "Drying goal initialised. POST moisture readings then PUT to evaluate.",
    });
  } catch (error) {
    console.error("[drying-goal POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: inspectionId } = await params;
    const body = await request.json().catch(() => ({}));
    const { signedOffBy } = body as { signedOffBy?: string };

    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      include: { moistureReadings: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const record = await (prisma as any).dryingGoalRecord.findUnique({
      where: { inspectionId },
    });
    if (!record) {
      return NextResponse.json(
        { error: "No drying goal initialised. POST /drying-goal first." },
        { status: 404 },
      );
    }

    if (record.goalAchieved) {
      return NextResponse.json({
        status: "ACHIEVED",
        goalAchievedAt: record.goalAchievedAt,
        totalDryingDays: record.totalDryingDays,
        iicrcReference: record.iicrcReference,
        message: `Drying Goal: ACHIEVED — certified ${record.goalAchievedAt?.toISOString()} per ${record.iicrcReference}`,
      });
    }

    const materialTargets = record.materialTargets as Record<string, number>;
    const readings = inspection.moistureReadings;

    if (readings.length === 0) {
      return NextResponse.json({
        status: "IN_PROGRESS",
        message: "No moisture readings recorded yet.",
        readingsChecked: 0,
        failingReadings: [],
      });
    }

    // Evaluate each reading against its material EMC target
    interface ReadingGap {
      location: string;
      surfaceType: string;
      moistureLevel: number;
      target: number;
      gap: number;
    }

    const failingReadings: ReadingGap[] = [];
    const readingSnapshot: Record<string, unknown>[] = [];

    for (const reading of readings) {
      const target =
        materialTargets[reading.surfaceType] ??
        getDryStandard(reading.surfaceType).dryThreshold;

      const snap = {
        id: reading.id,
        location: reading.location,
        surfaceType: reading.surfaceType,
        moistureLevel: reading.moistureLevel,
        target,
        timestamp: reading.recordedAt ?? reading.createdAt,
      };
      readingSnapshot.push(snap);

      if (reading.moistureLevel > target) {
        failingReadings.push({
          location: reading.location,
          surfaceType: reading.surfaceType,
          moistureLevel: reading.moistureLevel,
          target,
          gap: parseFloat((reading.moistureLevel - target).toFixed(2)),
        });
      }
    }

    if (failingReadings.length > 0) {
      return NextResponse.json({
        status: "IN_PROGRESS",
        message: `${failingReadings.length} reading(s) still above IICRC S500 target EMC. Continue drying.`,
        readingsChecked: readings.length,
        failingReadings,
        iicrcReference: record.iicrcReference,
      });
    }

    // ALL readings are at or below target — goal achieved!
    const now = new Date();
    const startedAt = record.startedAt;
    const dryingMs = now.getTime() - startedAt.getTime();
    const totalDryingDays = Math.ceil(dryingMs / (1000 * 60 * 60 * 24));

    const updated = await (prisma as any).dryingGoalRecord.update({
      where: { inspectionId },
      data: {
        goalAchieved: true,
        goalAchievedAt: now,
        totalDryingDays,
        finalReadingsSnapshot: readingSnapshot,
        signedOffBy: signedOffBy ?? null,
        signedOffAt: signedOffBy ? now : null,
      },
    });

    return NextResponse.json({
      status: "ACHIEVED",
      goalAchievedAt: updated.goalAchievedAt,
      totalDryingDays: updated.totalDryingDays,
      readingsChecked: readings.length,
      iicrcReference: updated.iicrcReference,
      signedOffBy: updated.signedOffBy,
      // This string goes verbatim into the NIR PDF report
      certificate: `Drying Goal: ACHIEVED — ${updated.goalAchievedAt?.toISOString()} — All materials at or below IICRC S500:2025 §11.4 target EMC — ${totalDryingDays} day(s) drying`,
      message: `All ${readings.length} moisture readings are at or below IICRC S500 target EMC. Drying complete in ${totalDryingDays} day(s).`,
    });
  } catch (error) {
    console.error("[drying-goal PUT]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
