import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/logs/[id]/retry
 *
 * Re-queues a FAILED webhook event by resetting its status to PENDING.
 * The event will be picked up on the next cron run (/api/webhooks/process).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Find the event and verify it belongs to this user via the integration
    const webhookEvent = await prisma.webhookEvent.findFirst({
      where: {
        id,
        integration: { userId: session.user.id },
      },
    })

    if (!webhookEvent) {
      return NextResponse.json({ error: 'Webhook event not found' }, { status: 404 })
    }

    if (webhookEvent.status !== 'FAILED') {
      return NextResponse.json(
        { error: 'Only FAILED events can be retried' },
        { status: 400 }
      )
    }

    const updated = await prisma.webhookEvent.update({
      where: { id },
      data: {
        status: 'PENDING',
        retryCount: { increment: 1 },
        errorMessage: null,
        processedAt: null,
      },
    })

    return NextResponse.json({ success: true, event: updated })
  } catch (error) {
    console.error('[Webhook Retry] POST error:', error)
    return NextResponse.json({ error: 'Failed to retry webhook event' }, { status: 500 })
  }
}
