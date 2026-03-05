import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Get contractor's CEC records + total points
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.contractorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Contractor profile not found' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')

    const where: Record<string, unknown> = { contractorId: profile.id }
    if (provider && provider !== 'all') {
      where.provider = provider
    }

    const records = await prisma.continuingEducation.findMany({
      where,
      orderBy: { completedAt: 'desc' }
    })

    // Calculate totals
    const allRecords = await prisma.continuingEducation.findMany({
      where: { contractorId: profile.id },
      select: { cecPoints: true, provider: true }
    })

    const totalPoints = allRecords.reduce((sum, r) => sum + r.cecPoints, 0)
    const pointsByProvider: Record<string, number> = {}
    for (const r of allRecords) {
      pointsByProvider[r.provider] = (pointsByProvider[r.provider] || 0) + r.cecPoints
    }

    return NextResponse.json({
      records,
      totalPoints,
      pointsByProvider
    })
  } catch (error: unknown) {
    console.error('Error fetching CEC records:', error)
    return NextResponse.json(
      { error: 'Failed to fetch CEC records' },
      { status: 500 }
    )
  }
}

// Log a new CEC record
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.contractorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Contractor profile not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { courseName, provider, cecPoints, completedAt, certificateUrl, expiresAt } = body

    if (!courseName || !provider || !cecPoints || !completedAt) {
      return NextResponse.json(
        { error: 'Missing required fields: courseName, provider, cecPoints, completedAt' },
        { status: 400 }
      )
    }

    if (!['IICRC', 'CARSI', 'Other'].includes(provider)) {
      return NextResponse.json(
        { error: 'Provider must be IICRC, CARSI, or Other' },
        { status: 400 }
      )
    }

    const points = parseFloat(cecPoints)
    if (isNaN(points) || points <= 0) {
      return NextResponse.json(
        { error: 'CEC points must be a positive number' },
        { status: 400 }
      )
    }

    const record = await prisma.continuingEducation.create({
      data: {
        contractorId: profile.id,
        courseName,
        provider,
        cecPoints: points,
        completedAt: new Date(completedAt),
        certificateUrl: certificateUrl || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    })

    return NextResponse.json({ record }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating CEC record:', error)
    return NextResponse.json(
      { error: 'Failed to create CEC record' },
      { status: 500 }
    )
  }
}
