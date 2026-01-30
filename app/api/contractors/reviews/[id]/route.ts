import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Respond to a review (contractors only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { contractorResponse } = body

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

    if (!contractorResponse || contractorResponse.trim().length === 0) {
      return NextResponse.json(
        { error: 'Response cannot be empty' },
        { status: 400 }
      )
    }

    const updated = await prisma.contractorReview.update({
      where: { id: params.id },
      data: {
        contractorResponse,
        respondedAt: new Date()
      }
    })

    return NextResponse.json({ review: updated })
  } catch (error: any) {
    console.error('Error responding to review:', error)
    return NextResponse.json(
      { error: 'Failed to respond to review' },
      { status: 500 }
    )
  }
}
