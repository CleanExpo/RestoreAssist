/**
 * Daily Drying Monitoring Report — IICRC S500:2025 §11.4
 *
 * GET  /api/inspections/[id]/monitoring-report
 *      Returns grouped daily log from all moisture readings for the inspection.
 *      Computed on-the-fly — no DB model required.
 *
 * POST /api/inspections/[id]/monitoring-report
 *      Body: { date: string (YYYY-MM-DD), notes: string }
 *      Returns the day's log enriched with the provided technician notes.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// ── IICRC S500:2025 §11.4 per-material dry MC% thresholds ───────────────────
// Source: IICRC S500:2025 Standard for Professional Water Damage Restoration
// All values represent the maximum acceptable moisture content % for "DRY" status
const IICRC_TARGETS: Record<string, number> = {
  timber:        19,    // Timber / hardwood
  softwood:      19,    // Softwood / pine (same as hardwood, varies by species)
  plasterboard:  1.5,   // Plasterboard / drywall
  concrete:      3.5,   // Concrete / masonry
  carpet:        3,     // Carpet
  vinyl:         3.5,   // Vinyl / LVT
  particleboard: 10,    // Particleboard / MDF
  brick:         4,     // Brick / render
  insulation:    2,     // Insulation (fibreglass)
  other:         15,    // Generic fallback
}

/** Resolve per-material IICRC target for a surfaceType string */
function getTarget(surfaceType: string): number {
  return IICRC_TARGETS[surfaceType.toLowerCase()] ?? IICRC_TARGETS["other"]
}

/** Format a Date to a YYYY-MM-DD string in local time */
function toDateKey(date: Date): string {
  return date.toISOString().substring(0, 10)
}

// ── Internal DB row type (matches Prisma select shape) ───────────────────────
interface RawReading {
  id: string
  location: string
  surfaceType: string
  moistureLevel: number
  depth: string
  notes: string | null
  recordedAt: Date
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ReadingSnapshot {
  id: string
  location: string
  surfaceType: string
  moistureLevel: number
  depth: string
  target: number
  aboveTarget: boolean
  notes: string | null
  recordedAt: string
}

type DryingStatus = "PROGRESSING" | "PLATEAU" | "ACHIEVED" | "NO_DATA"

interface DailyLog {
  date: string           // YYYY-MM-DD
  readings: ReadingSnapshot[]
  readingCount: number
  avgMoisture: number
  maxMoisture: number
  aboveTargetCount: number
  dryingStatus: DryingStatus
  statusReason: string
  technicianNotes?: string
}

interface MonitoringReport {
  inspectionId: string
  inspectionNumber: string
  propertyAddress: string
  technicianName: string | null
  inspectionDate: string
  iicrcReference: string
  affectedAreas: Array<{
    roomZoneId: string
    category: string | null
    class: string | null
    affectedSquareFootage: number
  }>
  totalDaysMonitored: number
  currentAvgMoisture: number | null
  overallDryingStatus: DryingStatus
  dailyLogs: DailyLog[]
}

// ── Shared computation ────────────────────────────────────────────────────────

async function buildReport(
  inspectionId: string,
  extraNotes?: { date: string; notes: string }
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
  })

  if (!inspection) {
    throw new Error("Inspection not found")
  }

  // Group readings by date key
  const byDate = new Map<string, RawReading[]>()
  for (const r of inspection.moistureReadings as RawReading[]) {
    const key = toDateKey(new Date(r.recordedAt))
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(r)
  }

  const sortedDates = Array.from(byDate.keys()).sort()

  // Build per-day logs
  const dailyLogs: DailyLog[] = sortedDates.map((date, idx) => {
    const dayReadings = byDate.get(date)!

    const snapshots: ReadingSnapshot[] = dayReadings.map((r: RawReading) => {
      const target = getTarget(r.surfaceType)
      return {
        id: r.id,
        location: r.location,
        surfaceType: r.surfaceType,
        moistureLevel: r.moistureLevel,
        depth: r.depth,
        target,
        aboveTarget: r.moistureLevel > target,
        notes: r.notes,
        recordedAt: r.recordedAt.toISOString(),
      }
    })

    const avgMoisture =
      parseFloat(
        (snapshots.reduce((s, r) => s + r.moistureLevel, 0) / snapshots.length).toFixed(2)
      )
    const maxMoisture = Math.max(...snapshots.map((r) => r.moistureLevel))
    const aboveTargetCount = snapshots.filter((r) => r.aboveTarget).length

    // Determine drying status
    let dryingStatus: DryingStatus
    let statusReason: string

    if (aboveTargetCount === 0) {
      dryingStatus = "ACHIEVED"
      statusReason = "All readings at or below IICRC S500:2025 §11.4 material targets"
    } else if (idx === 0) {
      // First day — no comparison baseline
      dryingStatus = "PROGRESSING"
      statusReason = "Baseline day — monitoring commenced"
    } else {
      // Compare avgMoisture to previous day(s)
      const prevDate = sortedDates[idx - 1]
      const prevReadings = byDate.get(prevDate)!
      const prevAvg = prevReadings.reduce((s: number, r: RawReading) => s + r.moistureLevel, 0) / prevReadings.length

      // Check for plateau: no meaningful change for 2+ days
      let plateau = false
      if (idx >= 2) {
        const dayBeforePrev = sortedDates[idx - 2]
        const dbpReadings = byDate.get(dayBeforePrev)!
        const dbpAvg = dbpReadings.reduce((s: number, r: RawReading) => s + r.moistureLevel, 0) / dbpReadings.length
        // Plateau = both today and yesterday within 0.5% of day before that
        plateau = Math.abs(avgMoisture - prevAvg) < 0.5 && Math.abs(prevAvg - dbpAvg) < 0.5
      }

      if (plateau) {
        dryingStatus = "PLATEAU"
        statusReason = "No meaningful reduction over 2+ days — review drying strategy"
      } else if (avgMoisture < prevAvg) {
        dryingStatus = "PROGRESSING"
        statusReason = `Average moisture reduced ${(prevAvg - avgMoisture).toFixed(2)}% from previous day`
      } else {
        // Avg increased or same — flag as plateau if a single day
        dryingStatus = "PLATEAU"
        statusReason = "No moisture reduction from previous day"
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
    }

    // Inject extra notes for requested date (POST endpoint)
    if (extraNotes && extraNotes.date === date) {
      log.technicianNotes = extraNotes.notes
    }

    return log
  })

  // Overall status = status of most recent day (or NO_DATA if no readings)
  const overallDryingStatus: DryingStatus =
    dailyLogs.length > 0 ? dailyLogs[dailyLogs.length - 1].dryingStatus : "NO_DATA"

  const currentAvgMoisture =
    dailyLogs.length > 0 ? dailyLogs[dailyLogs.length - 1].avgMoisture : null

  return {
    inspectionId: inspection.id,
    inspectionNumber: inspection.inspectionNumber,
    propertyAddress: inspection.propertyAddress,
    technicianName: inspection.technicianName,
    inspectionDate: inspection.inspectionDate?.toISOString() ?? new Date().toISOString(),
    iicrcReference: "IICRC S500:2025 §11.4",
    affectedAreas: inspection.affectedAreas,
    totalDaysMonitored: dailyLogs.length,
    currentAvgMoisture,
    overallDryingStatus,
    dailyLogs,
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: inspectionId } = await params

    // Verify ownership
    const ownership = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    })
    if (!ownership) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const report = await buildReport(inspectionId)
    return NextResponse.json({ report })
  } catch (error) {
    console.error("[monitoring-report GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: inspectionId } = await params

    // Verify ownership
    const ownership = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: { id: true },
    })
    if (!ownership) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({})) as { date?: string; notes?: string }
    const { date, notes } = body

    if (!date || !notes) {
      return NextResponse.json(
        { error: "Both 'date' (YYYY-MM-DD) and 'notes' are required" },
        { status: 400 }
      )
    }

    const report = await buildReport(inspectionId, { date, notes })
    return NextResponse.json({ report })
  } catch (error) {
    console.error("[monitoring-report POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

