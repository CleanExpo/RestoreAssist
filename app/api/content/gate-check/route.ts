/**
 * POST /api/content/gate-check
 *
 * Validates a piece of content against the NIR evidence content gate before publication.
 * Returns a structured gate check result — the CMS or publishing workflow calls this
 * before allowing content to go live.
 *
 * Authentication: session required (admin or content editor role)
 *
 * Request body: ContentMetadata
 *   {
 *     domain: 'water-damage' | 'mould-remediation' | 'fire-smoke' | 'cost-savings' | 'industry-standard'
 *     contentType: 'blog-post' | 'case-study' | 'landing-page' | ...
 *     title: string
 *     claimIds: string[]   // CLAIM-001, CLAIM-002, etc.
 *     submittedBy?: string
 *   }
 *
 * Response 200: gate open or partial
 *   { gateStatus: 'open' | 'partial', allowedClaims, blockedClaims, requiredActions, checkedAt }
 *
 * Response 403: gate blocked
 *   { gateStatus: 'blocked', blockReasons, blockedClaims, requiredActions }
 *
 * Response 400: invalid request body
 * Response 401: not authenticated
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  validateContentBeforePublish,
  checkContentGate,
  getAllGateStatuses,
  ContentGateViolationError,
  type ContentMetadata,
  type ContentDomain,
  type ContentType,
} from '@/lib/nir-content-gate'

// ─── VALIDATION ────────────────────────────────────────────────────────────────

const VALID_DOMAINS: ContentDomain[] = [
  'water-damage',
  'mould-remediation',
  'fire-smoke',
  'cost-savings',
  'industry-standard',
]

const VALID_CONTENT_TYPES: ContentType[] = [
  'blog-post',
  'case-study',
  'landing-page',
  'social-post',
  'press-release',
  'pitch-deck',
  'enterprise-proposal',
]

function parseAndValidateBody(body: unknown): ContentMetadata | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object' }
  }

  const b = body as Record<string, unknown>

  if (!b.domain || !VALID_DOMAINS.includes(b.domain as ContentDomain)) {
    return { error: `domain must be one of: ${VALID_DOMAINS.join(', ')}` }
  }

  if (!b.contentType || !VALID_CONTENT_TYPES.includes(b.contentType as ContentType)) {
    return { error: `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}` }
  }

  if (!b.title || typeof b.title !== 'string' || b.title.trim().length === 0) {
    return { error: 'title must be a non-empty string' }
  }

  if (!Array.isArray(b.claimIds) || !b.claimIds.every(id => typeof id === 'string')) {
    return { error: 'claimIds must be an array of claim ID strings (e.g. ["CLAIM-001"])' }
  }

  return {
    domain: b.domain as ContentDomain,
    contentType: b.contentType as ContentType,
    title: (b.title as string).trim(),
    claimIds: b.claimIds as string[],
    submittedBy: typeof b.submittedBy === 'string' ? b.submittedBy : undefined,
  }
}

// ─── POST — Gate check for a single piece of content ─────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validated = parseAndValidateBody(body)
  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  try {
    // validateContentBeforePublish throws ContentGateViolationError if blocked
    const result = validateContentBeforePublish(validated)

    return NextResponse.json(
      {
        gateStatus: result.gateStatus,
        domain: result.domain,
        certificationMet: result.certificationMet,
        allowedClaims: result.allowedClaims.map(c => ({
          id: c.id,
          claim: c.claim,
          value: c.value,
          status: c.status,
          source: c.source,
        })),
        blockedClaims: result.blockedClaims.map(c => ({
          id: c.id,
          claim: c.claim,
          status: c.status,
          measurementPlan: c.hypothesis?.measurementMethod,
        })),
        blockReasons: result.blockReasons,
        requiredActions: result.requiredActions,
        checkedAt: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (err) {
    if (err instanceof ContentGateViolationError) {
      const result = err.gateResult
      return NextResponse.json(
        {
          gateStatus: 'blocked',
          domain: result.domain,
          certificationMet: result.certificationMet,
          blockReasons: result.blockReasons,
          blockedClaims: result.blockedClaims.map(c => ({
            id: c.id,
            claim: c.claim,
            status: c.status,
            notes: c.notes,
            measurementPlan: c.hypothesis
              ? {
                  method: c.hypothesis.measurementMethod,
                  sampleSize: c.hypothesis.sampleSize,
                  phase: c.hypothesis.measurementPhase,
                  successCriteria: c.hypothesis.successCriteria,
                }
              : undefined,
          })),
          requiredActions: result.requiredActions,
          checkedAt: new Date().toISOString(),
        },
        { status: 403 }
      )
    }

    console.error('[Content Gate] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── GET — Full gate dashboard (all domains) ─────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const clearance = getAllGateStatuses()

  return NextResponse.json(
    {
      overallApproved: clearance.approved,
      approvedDomains: clearance.approvedDomains,
      blockedDomains: clearance.blockedDomains,
      checkedAt: clearance.checkedAt,
      domains: Object.fromEntries(
        Object.entries(clearance.results).map(([domain, result]) => [
          domain,
          {
            gateStatus: result.gateStatus,
            certificationMet: result.certificationMet,
            blockReasonCount: result.blockReasons.length,
            blockedClaimCount: result.blockedClaims.length,
            allowedClaimCount: result.allowedClaims.length,
            certificationOwner: result.certificationRecord.gateOwner,
            certificationRequirement: result.certificationRecord.requirement,
            requiredActions: result.requiredActions,
          },
        ])
      ),
    },
    { status: 200 }
  )
}
