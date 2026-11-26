/**
 * Daily Drying Monitoring Report. Each reading is judged against its drying
 * goal from lib/iicrc-dry-standards.ts (RA-8508): the job's reference reading
 * from unaffected like material, otherwise a starting guide value.
 *
 * GET  /api/inspections/[id]/monitoring-report
 *      Returns grouped daily log from all moisture readings for the inspection.
 *      Computed on-the-fly — no DB model required.
 *
 * POST /api/inspections/[id]/monitoring-report
 *      Body: { date: string (YYYY-MM-DD), notes: string }
 *      Returns the day's log enriched with the provided technician notes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionAssignedWrite,
  assertInspectionReadable,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

import {
  DRYING_GOAL_BASIS_SHORT,
  isProgressReading,
  pickReferenceReadings,
  resolveDryingGoal,
} from "@/lib/iicrc-dry-standards";

/** Format a Date to a YYYY-MM-DD string in local time */
function toDateKey(date: Date): string {
  return date.toISOString().substring(0, 10);
}

// ── Internal DB row type (matches Prisma select shape) ───────────────────────
interface RawReading {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
  notes: string | null;
  isBaseline: boolean;
  unit: string | null;
  invalidatedAt: Date | null;
  recordedAt: Date;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ReadingSnapshot {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
  /** Recorded unit; a reference applies only to a moisture-content reading. */
  unit: string | null;
  target: number;
  aboveTarget: boolean;
  notes: string | null;
  recordedAt: string;
}

type DryingStatus = "PROGRESSING" | "PLATEAU" | "ACHIEVED" | "NO_DATA";

interface DailyLog {
  date: string; // YYYY-MM-DD
  readings: ReadingSnapshot[];
  readingCount: number;
  avgMoisture: number;
  maxMoisture: number;
  aboveTargetCount: number;
  dryingStatus: DryingStatus;
  statusReason: string;
  technicianNotes?: string;
}

interface MonitoringReport {
  inspectionId: string;
  inspectionNumber: string;
  propertyAddress: string;
  technicianName: string | null;
  inspectionDate: string | null;
  iicrcReference: string;
  affectedAreas: Array<{
    roomZoneId: string;
    category: string | null;
    class: string | null;
    affectedSquareFootage: number;
  }>;
  totalDaysMonitored: number;
  currentAvgMoisture: number | null;
  overallDryingStatus: DryingStatus;
  dailyLogs: DailyLog[];
  /** The job's reference readings by material (RA-8509), for the drying charts. */
  references: Record<string, number>;
}

// ── Shared computation ────────────────────────────────────────────────────────

async function buildReport(
  inspectionId: string,
  extraNotes?: { date: string; notes: string },
): Promise<MonitoringReport> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      technicianName: true,
      inspectionDate: true,
      moistureReadings: {
        orderBy: { recordedAt: "asc" },
        select: {
          id: true,
          location: true,
          surfaceType: true,
          moistureLevel: true,
          depth: true,
          notes: true,
          isBaseline: true,
          unit: true,
          invalidatedAt: true,
          recordedAt: true,
        },
      },
      affectedAreas: {
        select: {
          roomZoneId: true,
          category: true,
          class: true,
          affectedSquareFootage: true,
        },
      },
    },
  });

  if (!inspection) {
    throw new Error("Inspection not found");
  }

  // Group readings by date key
  // RA-8508: reference readings set the goal and invalidated readings are
  // retained for audit only; neither counts as drying progress.
  const allReadings = inspection.moistureReadings as RawReading[];
  const references = pickReferenceReadings(allReadings);
  const byDate = new Map<string, RawReading[]>();
  for (const r of allReadings.filter(isProgressReading)) {
    const key = toDateKey(new Date(r.recordedAt));
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(r);
  }

  const sortedDates = Array.from(byDate.keys()).sort();

  // Build per-day logs
  const dailyLogs: DailyLog[] = sortedDates.map((date, idx) => {
    const dayReadings = byDate.get(date)!;

    const snapshots: ReadingSnapshot[] = dayReadings.map((r: RawReading) => {
      const target = resolveDryingGoal(
        r.surfaceType,
        references,
        undefined,
        r.unit,
      ).target;
      return {
        id: r.id,
        location: r.location,
        surfaceType: r.surfaceType,
        moistureLevel: r.moistureLevel,
        depth: r.depth,
        unit: r.unit,
        target,
        aboveTarget: r.moistureLevel > target,
        notes: r.notes,
        recordedAt: r.recordedAt.toISOString(),
      };
    });

    const avgMoisture = parseFloat(
      (
        snapshots.reduce((s, r) => s + r.moistureLevel, 0) / snapshots.length
      ).toFixed(2),
    );
    const maxMoisture = Math.max(...snapshots.map((r) => r.moistureLevel));
    const aboveTargetCount = snapshots.filter((r) => r.aboveTarget).length;

    // Determine drying status
    let dryingStatus: DryingStatus;
    let statusReason: string;

    if (aboveTargetCount === 0) {
      dryingStatus = "ACHIEVED";
      statusReason =
        "All readings at or below their drying goal";
    } else if (idx === 0) {
      // First day — no comparison baseline
      dryingStatus = "PROGRESSING";
      statusReason = "Baseline day — monitoring commenced";
    } else {
      // Compare avgMoisture to previous day(s)
      const prevDate = sortedDates[idx - 1];
      const prevReadings = byDate.get(prevDate)!;
      const prevAvg =
        prevReadings.reduce(
          (s: number, r: RawReading) => s + r.moistureLevel,
          0,
        ) / prevReadings.length;

      // Check for plateau: no meaningful change for 2+ days
      let plateau = false;
      if (idx >= 2) {
        const dayBeforePrev = sortedDates[idx - 2];
        const dbpReadings = byDate.get(dayBeforePrev)!;
        const dbpAvg =
          dbpReadings.reduce(
            (s: number, r: RawReading) => s + r.moistureLevel,
            0,
          ) / dbpReadings.length;
        // Plateau = both today and yesterday within 0.5% of day before that
        plateau =
          Math.abs(avgMoisture - prevAvg) < 0.5 &&
          Math.abs(prevAvg - dbpAvg) < 0.5;
      }

      if (plateau) {
        dryingStatus = "PLATEAU";
        statusReason =
          "No meaningful reduction over 2+ days — review drying strategy";
      } else if (avgMoisture < prevAvg) {
        dryingStatus = "PROGRESSING";
        statusReason = `Average moisture reduced ${(prevAvg - avgMoisture).toFixed(2)}% from previous day`;
      } else {
        // Avg increased or same — flag as plateau if a single day
        dryingStatus = "PLATEAU";
        statusReason = "No moisture reduction from previous day";
      }
    }

    const log: DailyLog = {
      date,
      readings: snapshots,
      readingCount: snapshots.length,
      avgMoisture,
      maxMoisture,
      aboveTargetCount,
      dryingStatus,
      statusReason,
    };

    // Inject extra notes for requested date (POST endpoint)
    if (extraNotes && extraNotes.date === date) {
      log.technicianNotes = extraNotes.notes;
    }

    return log;
  });

  // Overall status = status of most recent day (or NO_DATA if no readings)
  const overallDryingStatus: DryingStatus =
    dailyLogs.length > 0
      ? dailyLogs[dailyLogs.length - 1].dryingStatus
      : "NO_DATA";

  const currentAvgMoisture =
    dailyLogs.length > 0 ? dailyLogs[dailyLogs.length - 1].avgMoisture : null;

  return {
    inspectionId: inspection.id,
    inspectionNumber: inspection.inspectionNumber,
    propertyAddress: inspection.propertyAddress,
    technicianName: inspection.technicianName,
    inspectionDate: inspection.inspectionDate?.toISOString() ?? null,
    // Field name kept for the page that reads it; the value names no standard.
    iicrcReference: DRYING_GOAL_BASIS_SHORT,
    affectedAreas: inspection.affectedAreas,
    totalDaysMonitored: dailyLogs.length,
    currentAvgMoisture,
    overallDryingStatus,
    dailyLogs,
    references,
  };
}

// ── Route handlers ────────────────────────────────────────────────────────────

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id: inspectionId } = await params;

    // D-028 / D-023: the assigned technician reads back what they record.
    const tenancy = await assertInspectionReadable(session, inspectionId);
    if (!tenancy.ok) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const report = await buildReport(inspectionId);
    return NextResponse.json({ report });
  } catch (error) {
    return fromException(request, error, {
      stage: "inspection-monitoring-report-get",
    });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id: inspectionId } = await params;

    // Verify ownership
    // D-028: the owner's reach, plus the technician assigned to the job.
    const tenancy = await assertInspectionAssignedWrite(session, inspectionId);
    if (!tenancy.ok) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }
    const ownership = await prisma.inspection.findFirst({
      where: tenancy.data.inspectionManyWhere,
      select: { id: true },
    });
    if (!ownership) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      date?: string;
      notes?: string;
    };
    const { date, notes } = body;

    if (!date || !notes) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Both 'date' (YYYY-MM-DD) and 'notes' are required",
        status: 400,
      });
    }

    const report = await buildReport(inspectionId, { date, notes });
    return NextResponse.json({ report });
  } catch (error) {
    return fromException(request, error, {
      stage: "inspection-monitoring-report-post",
    });
  }
}
