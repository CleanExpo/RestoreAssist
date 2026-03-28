/**
 * Pilot Observation Recording
 *
 * POST /api/pilot/observations
 *   Records a new pilot measurement observation. Used by:
 *     - Technician post-use survey submissions (CLAIM-005)
 *     - Admin recording of adjuster timed sessions (CLAIM-004)
 *     - Admin recording of re-inspection events (CLAIM-003)
 *     - Admin recording of per-claim cost data (CLAIM-002)
 *
 * GET /api/pilot/observations
 *   Returns all recorded observations (admin only).
 *   Grouped by claim for quick inspection.
 *
 * CLAIM-007 (cycle time) is auto-derived from completed inspections.
 * Use GET /api/pilot/readiness to see auto-derived cycle time data.
 *
 * Authentication:
 *   - POST: any authenticated user (technician survey) or ADMIN
 *   - GET: ADMIN role only
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  validateObservation,
  type NewPilotObservation,
  type ObservationType,
  type PilotGroup,
} from '@/lib/nir-pilot-measurement'

// ─── POST — record a new observation ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as {
      claimId?: string
      observationType?: string
      value?: number
      group?: string
      inspectionId?: string
      context?: Record<string, unknown>
      notes?: string
    }

    const obs: NewPilotObservation = {
      claimId:         body.claimId ?? '',
      observationType: (body.observationType ?? '') as ObservationType,
      value:           body.value ?? NaN,
      group:           (body.group ?? 'nir') as PilotGroup,
      inspectionId:    body.inspectionId,
      recordedByUserId: session.user.id,
      context:         body.context,
      notes:           body.notes,
    }

    const errors = validateObservation(obs)
    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid observation', details: errors },
        { status: 400 }
      )
    }

    // If inspectionId provided, verify the user can access it
    if (obs.inspectionId) {
      const inspection = await prisma.inspection.findFirst({
        where: {
          id: obs.inspectionId,
          userId: session.user.id,
        },
        select: { id: true },
      })
      if (!inspection) {
        return NextResponse.json(
          { error: 'Inspection not found or not accessible' },
          { status: 404 }
        )
      }
    }

    const record = await (prisma as any).pilotObservation.create({
      data: {
        claimId:          obs.claimId,
        observationType:  obs.observationType,
        value:            obs.value,
        group:            obs.group ?? 'nir',
        inspectionId:     obs.inspectionId ?? null,
        recordedByUserId: obs.recordedByUserId,
        context:          obs.context ?? null,
        notes:            obs.notes ?? null,
      },
    })

    return NextResponse.json({
      message: 'Pilot observation recorded',
      observation: record,
    }, { status: 201 })

  } catch (error) {
    console.error('Error recording pilot observation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── GET — list all observations (admin) ──────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only ADMIN role can see all observations
    if ((session.user as { role?: string }).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const claimId = searchParams.get('claimId')
    const group   = searchParams.get('group')

    const where: Record<string, unknown> = {}
    if (claimId) where.claimId = claimId
    if (group)   where.group   = group

    const observations = await (prisma as any).pilotObservation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Group by claim for convenience
    const grouped: Record<string, typeof observations> = {}
    for (const obs of observations) {
      if (!grouped[obs.claimId]) grouped[obs.claimId] = []
      grouped[obs.claimId].push(obs)
    }

    return NextResponse.json({
      total: observations.length,
      grouped,
      observations,
    })

  } catch (error) {
    console.error('Error fetching pilot observations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
