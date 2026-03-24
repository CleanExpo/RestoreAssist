/**
 * Pilot Readiness Report
 *
 * GET /api/pilot/readiness
 *   Returns the full pilot readiness report — which HYPOTHESIS claims
 *   are ready to be promoted to VALIDATED, which are still in progress,
 *   and exactly what data is still needed.
 *
 *   This is the primary tool the Product Lead uses to decide when to open
 *   a promotion PR in lib/nir-evidence-architecture.ts.
 *
 * Authentication: ADMIN role required.
 *
 * CLAIM-007 (cycle time) is auto-derived from all COMPLETED inspections
 * in the database — no manual entry required for that claim.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  generatePilotReport,
  deriveCycleTimeObservations,
  type PilotObservation,
  type ObservationType,
  type PilotGroup,
} from '@/lib/nir-pilot-measurement'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if ((session.user as { role?: string }).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 })
    }

    // ── 1. Load all recorded observations from the database ─────────────────

    const rawObs = await prisma.pilotObservation.findMany({
      orderBy: { createdAt: 'asc' },
    })

    const dbObservations: PilotObservation[] = rawObs.map(r => ({
      id:               r.id,
      claimId:          r.claimId,
      observationType:  r.observationType as ObservationType,
      value:            r.value,
      group:            r.group as PilotGroup,
      inspectionId:     r.inspectionId ?? undefined,
      recordedByUserId: r.recordedByUserId,
      context:          r.context as Record<string, unknown> | null,
      notes:            r.notes ?? undefined,
      createdAt:        r.createdAt,
    }))

    // ── 2. Auto-derive CLAIM-007 cycle time from completed inspections ───────
    //
    // Group inspections by organizationId so we can check the ≥3 companies
    // requirement. Use organizationId as the companyId proxy.

    const completedInspections = await prisma.inspection.findMany({
      where: { status: 'COMPLETED' },
      select: {
        id:             true,
        inspectionDate: true,
        completedAt:    true,
        userId:         true,
        status:         true,
        user: {
          select: { organizationId: true },
        },
      },
    })

    // Group by organization, derive cycle time observations
    const byOrg: Record<string, typeof completedInspections> = {}
    for (const insp of completedInspections) {
      const orgId = insp.user?.organizationId ?? 'unknown'
      if (!byOrg[orgId]) byOrg[orgId] = []
      byOrg[orgId].push(insp)
    }

    const derivedCycleTime: PilotObservation[] = []
    for (const [orgId, inspections] of Object.entries(byOrg)) {
      const derived = deriveCycleTimeObservations(
        inspections.map(i => ({
          id:             i.id,
          inspectionDate: i.inspectionDate,
          completedAt:    i.completedAt,
          userId:         i.userId,
          status:         i.status,
        })),
        orgId
      )
      derivedCycleTime.push(
        ...derived.map((d, idx) => ({
          ...d,
          id:        `derived-${orgId}-${idx}`,
          createdAt: new Date(),
        }))
      )
    }

    // Merge manual DB observations with auto-derived cycle time
    // Filter out any manually recorded CLAIM-007 to avoid double-counting
    const manualNonCycleTime = dbObservations.filter(o => o.claimId !== 'CLAIM-007')
    const allObservations    = [...manualNonCycleTime, ...derivedCycleTime]

    // ── 3. Generate readiness report ─────────────────────────────────────────

    const report = generatePilotReport(allObservations)

    // ── 4. Augment with derived cycle time summary ────────────────────────────

    const cycleTimeSummary = {
      derivedFromInspections: derivedCycleTime.length,
      companies:              Object.keys(byOrg).length,
      totalCompletedInspections: completedInspections.length,
    }

    return NextResponse.json({
      report,
      cycleTimeSummary,
      meta: {
        generatedAt:        report.generatedAt,
        totalObservations:  allObservations.length,
        manualObservations: manualNonCycleTime.length,
        derivedObservations: derivedCycleTime.length,
        note: [
          'CLAIM-007 cycle time is auto-derived from completed inspections — no manual entry required.',
          'All other claims require observations submitted via POST /api/pilot/observations.',
          'When readyToPromote is non-empty, update lib/nir-evidence-architecture.ts and open a PR.',
        ],
      },
    })

  } catch (error) {
    console.error('Error generating pilot readiness report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
