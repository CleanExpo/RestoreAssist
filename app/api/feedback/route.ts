/**
 * API Route: Feedback
 * POST - Submit feedback (authenticated)
 * GET  - List feedback: all for ADMIN, own for others; ?inbox=1 for admin inbox
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyRateLimit } from '@/lib/rate-limiter'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimited = applyRateLimit(request, {
      maxRequests: 10,
      prefix: 'feedback-submit',
      key: session.user.id,
    })
    if (rateLimited) return rateLimited

    const body = await request.json()
    const { rating, whatDoing, whatHappened, page } = body

    const feedback = await prisma.feedback.create({
      data: {
        userId: session.user.id,
        rating: typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : null,
        whatDoing: typeof whatDoing === 'string' ? whatDoing.slice(0, 2000) : null,
        whatHappened: typeof whatHappened === 'string' ? whatHappened.slice(0, 5000) : null,
        page: typeof page === 'string' ? page.slice(0, 500) : null,
      },
    })

    return NextResponse.json({ id: feedback.id, success: true })
  } catch (error: unknown) {
    console.error('Feedback POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit feedback' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const inbox = searchParams.get('inbox') === '1'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const skip = (page - 1) * limit

    const isAdmin = session.user.role === 'ADMIN'

    if (inbox && isAdmin) {
      const [items, total] = await Promise.all([
        prisma.feedback.findMany({
          where: {},
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.feedback.count(),
      ])
      return NextResponse.json({
        feedback: items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    }

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.feedback.count({ where: { userId: session.user.id } }),
    ])
    return NextResponse.json({
      feedback: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error: unknown) {
    console.error('Feedback GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load feedback' },
      { status: 500 }
    )
  }
}
