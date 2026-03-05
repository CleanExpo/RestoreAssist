import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateCompletenessScore, checkCompletenessBeforeGeneration } from '@/lib/validation'

// GET - Check report completeness
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    const report = await prisma.report.findUnique({
      where: { id, userId: user.id }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Calculate completeness score
    const completenessScore = calculateCompletenessScore(report)

    // Check completeness before generation
    const completenessCheck = checkCompletenessBeforeGeneration(report)

    // Update report with completeness score
    await prisma.report.update({
      where: { id },
      data: {
        completenessScore
      }
    })

    // Calculate section breakdown
    const sections = {
      required: {
        label: 'Required Sections',
        completed: completenessCheck.missingItems.length === 0,
        percentage: completenessCheck.missingItems.length === 0 ? 100 : 
          Math.max(0, 100 - (completenessCheck.missingItems.length * 10))
      },
      enhancement: {
        label: 'Enhancement Sections',
        completed: report.tier2Responses ? true : false,
        percentage: report.tier2Responses ? 100 : 0,
        details: report.tier2Responses 
          ? 'All Tier 2 questions completed ✓'
          : 'Tier 2 questions not started'
      },
      optimisation: {
        label: 'Optimisation Sections',
        completed: report.tier3Responses ? true : false,
        percentage: report.tier3Responses ? 100 : 0,
        details: report.tier3Responses 
          ? 'All Tier 3 questions completed ✓'
          : 'Tier 3 questions not started'
      }
    }

    return NextResponse.json({
      completenessScore,
      canGenerate: completenessCheck.canGenerate,
      missingItems: completenessCheck.missingItems,
      warnings: completenessCheck.warnings,
      sections,
      overallPercentage: completenessScore
    })
  } catch (error) {
    console.error('Error checking completeness:', error)
    return NextResponse.json(
      { error: 'Failed to check completeness' },
      { status: 500 }
    )
  }
}

