import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  syncContractorToNexus,
  syncCertificationToNexus,
  syncCECToNexus,
} from '@/lib/unitehub/sync'

/**
 * POST /api/nexus/sync
 * Triggered after certification/CEC events to push data to Unite-Hub Nexus.
 * Body: { type: 'certification' | 'cec' | 'contractor', id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, id } = body

    if (!type || !id) {
      return NextResponse.json(
        { error: 'Missing required fields: type, id' },
        { status: 400 }
      )
    }

    switch (type) {
      case 'certification':
        await syncCertificationToNexus(id)
        break
      case 'cec':
        await syncCECToNexus(id)
        break
      case 'contractor':
        await syncContractorToNexus(id)
        break
      default:
        return NextResponse.json(
          { error: `Invalid sync type: ${type}` },
          { status: 400 }
        )
    }

    return NextResponse.json({ success: true, type, id })
  } catch (error: any) {
    console.error('[Nexus Sync API] Error:', error)
    return NextResponse.json(
      { error: 'Nexus sync failed', details: error.message },
      { status: 500 }
    )
  }
}
