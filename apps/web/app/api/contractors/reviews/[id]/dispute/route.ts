import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Submit a dispute for a review (contractors only)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { disputeReason } = body

    // Get review and verify ownership
    const review = await prisma.contractorReview.findUnique({
      where: { id: params.id },
      include: {
        profile: {
          select: {
            userId: true
          }
        }
      }
    })

    if (!review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      )
    }

    if (review.profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Check if already disputed
    if (review.disputeStatus !== 'NONE') {
      return NextResponse.json(
        { error: 'Review has already been disputed' },
        { status: 400 }
      )
    }

    if (!disputeReason || disputeReason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Dispute reason is required' },
        { status: 400 }
      )
    }

    // Update review with dispute
    const updated = await prisma.contractorReview.update({
      where: { id: params.id },
      data: {
        disputeStatus: 'PENDING_REVIEW',
        disputeReason,
        disputeSubmittedAt: new Date(),
        status: 'DISPUTED'
      }
    })

    return NextResponse.json({ review: updated })
  } catch (error: any) {
    console.error('Error disputing review:', error)
    return NextResponse.json(
      { error: 'Failed to dispute review' },
      { status: 500 }
    )
  }
}
