import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEffectiveSubscription, getOrganizationOwner } from '@/lib/organization-credits'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
        businessName: true,
        businessAddress: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        organizationId: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get effective subscription (Admin's for Managers/Technicians, own for Admins)
    const effectiveSub = await getEffectiveSubscription(session.user.id)
    
    // Subscription is no longer required for onboarding - users get 3 free credits to start
    // Use effective subscription for team members
    const hasActiveSubscription = effectiveSub?.subscriptionStatus === 'ACTIVE'

    // For Managers/Technicians, check Admin's onboarding status
    // For Admins, check their own onboarding status
    const isAdmin = user.role === 'ADMIN'
    const isTeamMember = user.role === 'MANAGER' || user.role === 'USER'
    
    let targetUserId = session.user.id
    let businessProfileCompleted = !!(user.businessName && user.businessAddress)
    let integration = null
    let pricingConfig = null

    if (isTeamMember) {
      // Get Admin's ID
      const ownerId = await getOrganizationOwner(session.user.id)
      if (ownerId) {
        targetUserId = ownerId
        
        // Check Admin's business profile
        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: {
            businessName: true,
            businessAddress: true,
          }
        })
        businessProfileCompleted = !!(owner?.businessName && owner?.businessAddress)

        // Check Admin's integrations
        integration = await prisma.integration.findFirst({
          where: {
            userId: ownerId,
            status: 'CONNECTED',
            OR: [
              { name: { contains: 'Anthropic' } },
              { name: { contains: 'OpenAI' } },
              { name: { contains: 'Gemini' } },
              { name: { contains: 'Claude' } },
              { name: { contains: 'GPT' } }
            ]
          },
          select: {
            apiKey: true
          }
        })

        // Check Admin's pricing configuration
        pricingConfig = await prisma.companyPricingConfig.findUnique({
          where: {
            userId: ownerId
          }
        })
      }
    } else {
      // Admin - check their own onboarding
      integration = await prisma.integration.findFirst({
        where: {
          userId: session.user.id,
          status: 'CONNECTED',
          OR: [
            { name: { contains: 'Anthropic' } },
            { name: { contains: 'OpenAI' } },
            { name: { contains: 'Gemini' } },
            { name: { contains: 'Claude' } },
            { name: { contains: 'GPT' } }
          ]
        },
        select: {
          apiKey: true
        }
      })

      pricingConfig = await prisma.companyPricingConfig.findUnique({
        where: {
          userId: session.user.id
        }
      })
    }

    // Check if user has created at least one report (check current user's reports, not Admin's)
    const reportCount = await prisma.report.count({
      where: {
        userId: session.user.id
      }
    })

    // Check for Deepseek API key (for free users) or regular integrations (for paid users)
    let hasApiKey = !!(integration?.apiKey)
    // Skip deepseekApiKey check if column doesn't exist (temporary fix for schema mismatch)
    // TODO: Re-enable after database migration
    /*
    if (!hasApiKey && isAdmin) {
      // Check for Deepseek API key for free users
      const adminUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { deepseekApiKey: true }
      })
      hasApiKey = !!(adminUser?.deepseekApiKey)
    } else if (!hasApiKey && isTeamMember) {
      // For team members, check Admin's Deepseek API key
      const ownerId = await getOrganizationOwner(session.user.id)
      if (ownerId) {
        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: { deepseekApiKey: true }
        })
        hasApiKey = !!(owner?.deepseekApiKey)
      }
    }
    */

    // Check if user is on trial (free user)
    const isTrial = effectiveSub?.subscriptionStatus === 'TRIAL' || user.subscriptionStatus === 'TRIAL'

    // Define onboarding steps - Simplified for free users
    // For team members, use Admin's onboarding status; for Admins, use their own
    const steps = {
      business_profile: {
        completed: businessProfileCompleted, // Uses Admin's profile for team members
        required: !isTrial, // Only required for paid users
        title: 'Settings & Profile',
        description: 'Setup Business Details',
        route: '/dashboard/settings'
      },
      pricing_config: {
        completed: !!pricingConfig, // Uses Admin's pricing config for team members
        required: !isTrial, // Only required for paid users (locked for free users)
        title: 'Pricing Configuration',
        description: 'Set up your company pricing rates',
        route: '/dashboard/pricing-config'
      },
      first_report: {
        completed: reportCount > 0,
        required: false, // This is informational, not blocking
        title: 'Start First Report',
        description: 'Create your first report to complete setup',
        route: '/dashboard/reports/new'
      }
    }

    // Get incomplete required steps
    const incompleteSteps = Object.entries(steps)
      .filter(([key, step]) => step.required && !step.completed)
      .map(([key]) => key)

    const isComplete = incompleteSteps.length === 0

    return NextResponse.json({
      isComplete,
      incompleteSteps,
      steps,
      nextStep: incompleteSteps.length > 0 ? incompleteSteps[0] : null
    })
  } catch (error) {
    console.error('Error checking onboarding status:', error)
    return NextResponse.json(
      { error: 'Failed to check onboarding status' },
      { status: 500 }
    )
  }
}

