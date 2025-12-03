import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST - Save tier responses (Tier 1, 2, or 3)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { reportId, tier, responses } = await request.json()

    if (!reportId || !tier || !responses) {
      return NextResponse.json(
        { error: 'Report ID, tier, and responses are required' },
        { status: 400 }
      )
    }

    if (![1, 2, 3].includes(tier)) {
      return NextResponse.json(
        { error: 'Tier must be 1, 2, or 3' },
        { status: 400 }
      )
    }

    // Verify report belongs to user
    const report = await prisma.report.findUnique({
      where: { id: reportId, userId: user.id }
    })

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      )
    }

    // Update the appropriate tier field
    const updateData: any = {}
    if (tier === 1) {
      updateData.tier1Responses = JSON.stringify(responses)
      // Also update report depth level if not set
      if (!report.reportDepthLevel) {
        updateData.reportDepthLevel = 'Enhanced'
      }
    } else if (tier === 2) {
      updateData.tier2Responses = JSON.stringify(responses)
    } else if (tier === 3) {
      updateData.tier3Responses = JSON.stringify(responses)
      updateData.reportDepthLevel = 'Optimised'
    }

    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: updateData
    })

    return NextResponse.json({ 
      report: updatedReport,
      message: `Tier ${tier} responses saved successfully`
    })
  } catch (error) {
    console.error('Error saving tier responses:', error)
    return NextResponse.json(
      { error: 'Failed to save tier responses' },
      { status: 500 }
    )
  }
}

