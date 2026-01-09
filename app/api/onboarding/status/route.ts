import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        businessName: true,
        businessAddress: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check subscription status - REQUIRED before onboarding
    const hasActiveSubscription = user.subscriptionStatus === 'ACTIVE'

    // Check integrations (Any AI API key - Anthropic, OpenAI, or Gemini)
    const integration = await prisma.integration.findFirst({
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

    // Check pricing configuration
    const pricingConfig = await prisma.companyPricingConfig.findUnique({
      where: {
        userId: session.user.id
      }
    })

    // Check if user has created at least one report
    const reportCount = await prisma.report.count({
      where: {
        userId: session.user.id
      }
    })

    // Check if user has configured forms (optional setup step)
    const formTemplateCount = await prisma.formTemplate.count({
      where: {
        userId: session.user.id
      }
    })

    // Define onboarding steps - subscription is required first
    const steps = {
      subscription: {
        completed: hasActiveSubscription,
        required: true,
        title: 'Subscribe to a Plan',
        description: 'Choose a monthly or yearly plan to get started',
        route: '/dashboard/pricing'
      },
      business_profile: {
        completed: !!(user.businessName && user.businessAddress),
        required: true,
        title: 'Settings & Profile',
        description: 'Setup Business Details',
        route: '/dashboard/settings'
      },
      integrations: {
        completed: !!(integration?.apiKey),
        required: true,
        title: 'Integrations',
        description: 'Configure API key for report generation',
        route: '/dashboard/integrations'
      },
      pricing_config: {
        completed: !!pricingConfig,
        required: true,
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
      },
      forms_setup: {
        completed: formTemplateCount > 0,
        required: false, // Optional forms setup
        title: 'Forms Setup',
        description: 'Create custom forms or access pre-defined forms',
        route: '/dashboard/forms'
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

