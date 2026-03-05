import { NextRequest, NextResponse } from 'next/server'

// POST /api/nrpg/sync
// Syncs a contractor's compliance data to NRPG
// Spec: docs/features/NRPG-ONBOARDING-SYNC.md
export async function POST(req: NextRequest) {
  // TODO: implement NRPG API integration when API credentials are available
  const body = await req.json()
  const { contractorId } = body

  if (!contractorId) {
    return NextResponse.json(
      { error: 'contractorId required' },
      { status: 400 }
    )
  }

  // Stub: return success shape that matches the expected NRPG response
  return NextResponse.json({
    status: 'pending',
    message: 'NRPG sync queued (integration pending NRPG API access)',
    contractorId,
    nrpgMembershipId: null,
  })
}
