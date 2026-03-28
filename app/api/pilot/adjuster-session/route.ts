/**
 * Adjuster Review Time Recording (CLAIM-004)
 *
 * POST /api/pilot/adjuster-session
 *   Records the time an insurance adjuster spent reviewing a report.
 *   No authentication required — adjusters are external users without accounts.
 *   A short-lived pilot token (passed as query param) prevents abuse.
 *
 *   Body:
 *     {
 *       pilotToken: string        — shared token issued to participating insurer teams
 *       reportFormat: 'nir' | 'existing'  — NIR or non-standardised format
 *       reviewMinutes: number     — time spent reviewing the report (minutes)
 *       reportId?: string         — NIR inspection ID if format='nir'
 *       adjusterCode?: string     — anonymised adjuster identifier (e.g. "ADJ-03")
 *       notes?: string
 *     }
 *
 * GET /api/pilot/adjuster-session/status
 *   Returns aggregate adjuster session counts (admin only, see readiness endpoint).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ── Pilot token guard ─────────────────────────────────────────────────────────
// In production, rotate this via environment variable.
// Set PILOT_ADJUSTER_TOKEN in .env — shared with participating insurer teams.
const VALID_PILOT_TOKEN = process.env.PILOT_ADJUSTER_TOKEN ?? 'nir-pilot-2026'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      pilotToken?: string
      reportFormat?: string
      reviewMinutes?: number
      reportId?: string
      adjusterCode?: string
      notes?: string
    }

    // Token guard — prevents random public submissions
    if (!body.pilotToken || body.pilotToken !== VALID_PILOT_TOKEN) {
      return NextResponse.json(
        { error: 'Invalid pilot token. Contact the RestoreAssist pilot team.' },
        { status: 403 }
      )
    }

    // Validate required fields
    const errors: string[] = []
    if (!body.reportFormat || !['nir', 'existing'].includes(body.reportFormat)) {
      errors.push("reportFormat must be 'nir' or 'existing'")
    }
    if (typeof body.reviewMinutes !== 'number' || body.reviewMinutes <= 0 || body.reviewMinutes > 480) {
      errors.push('reviewMinutes must be a positive number (max 480 minutes / 8 hours)')
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: 'Invalid submission', details: errors }, { status: 400 })
    }

    // Use a system user ID for adjuster submissions (no account)
    const systemUserId = 'pilot-adjuster-system'

    await (prisma as any).pilotObservation.create({
      data: {
        claimId:          'CLAIM-004',
        observationType:  'adjuster_session',
        value:            body.reviewMinutes!,
        group:            body.reportFormat === 'nir' ? 'nir' : 'control',
        inspectionId:     body.reportId ?? null,
        recordedByUserId: systemUserId,
        context: {
          adjusterCode: body.adjusterCode ?? 'anonymous',
          reportFormat: body.reportFormat,
          source:       'adjuster-self-report',
        },
        notes: body.notes ?? null,
      },
    })

    return NextResponse.json({
      message: 'Review time recorded. Thank you for contributing to the NIR pilot.',
      claimId: 'CLAIM-004',
    }, { status: 201 })

  } catch (error) {
    console.error('Error recording adjuster session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
