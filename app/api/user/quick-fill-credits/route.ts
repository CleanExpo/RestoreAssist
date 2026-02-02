import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - Check Quick Fill credits
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        quickFillCreditsRemaining: true,
        totalQuickFillUsed: true,
        subscriptionStatus: true,
        organizationId: true,
        role: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Active subscribers have unlimited Quick Fill
    // Invited team members (Managers and Technicians in an org) also get unlimited Quick Fill as part of the org package
    const isInvitedTeamMember = !!user.organizationId && (user.role === 'MANAGER' || user.role === 'USER')
    const hasUnlimited = user.subscriptionStatus === 'ACTIVE' || isInvitedTeamMember
    const creditsRemaining = hasUnlimited ? null : (user.quickFillCreditsRemaining ?? 0)

    return NextResponse.json({ 
      creditsRemaining,
      totalUsed: user.totalQuickFillUsed ?? 0,
      hasUnlimited,
      canUse: hasUnlimited || (creditsRemaining ?? 0) > 0
    })
  } catch (error) {
    console.error('Error checking Quick Fill credits:', error)
    return NextResponse.json(
      { error: 'Failed to check credits' },
      { status: 500 }
    )
  }
}

// POST - Deduct Quick Fill credit
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        quickFillCreditsRemaining: true,
        totalQuickFillUsed: true,
        subscriptionStatus: true,
        organizationId: true,
        role: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Active subscribers have unlimited Quick Fill - no deduction needed
    // Invited team members (Managers and Technicians in an org) also get unlimited Quick Fill
    const isInvitedTeamMember = !!user.organizationId && (user.role === 'MANAGER' || user.role === 'USER')
    if (user.subscriptionStatus === 'ACTIVE' || isInvitedTeamMember) {
      return NextResponse.json({ 
        success: true,
        creditsRemaining: null,
        hasUnlimited: true
      })
    }

    // Check if user has credits
    const creditsRemaining = user.quickFillCreditsRemaining ?? 0
    if (creditsRemaining <= 0) {
      return NextResponse.json(
        { 
          error: 'No Quick Fill credits remaining. Please upgrade to continue using Quick Fill.',
          creditsRemaining: 0,
          requiresUpgrade: true
        },
        { status: 403 }
      )
    }

    // Deduct credit and increment usage
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        quickFillCreditsRemaining: {
          decrement: 1
        },
        totalQuickFillUsed: {
          increment: 1
        }
      },
      select: {
        quickFillCreditsRemaining: true,
        totalQuickFillUsed: true
      }
    })

    return NextResponse.json({ 
      success: true,
      creditsRemaining: updated.quickFillCreditsRemaining ?? 0,
      totalUsed: updated.totalQuickFillUsed ?? 0
    })
  } catch (error) {
    console.error('Error deducting Quick Fill credit:', error)
    return NextResponse.json(
      { error: 'Failed to deduct credit' },
      { status: 500 }
    )
  }
}
