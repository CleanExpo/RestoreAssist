import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { 
        integrations: true,
        pricingConfig: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check subscription status
    const hasActiveSubscription = user.subscriptionStatus === 'ACTIVE'

    // Check if user has a connected API key
    const hasApiKey = user.integrations.some(
      integration => integration.status === 'CONNECTED' && integration.apiKey
    )

    // Check if user has pricing configuration
    const hasPricingConfig = !!user.pricingConfig

    // Determine incomplete steps
    const incompleteSteps: string[] = []
    
    if (!hasActiveSubscription) {
      incompleteSteps.push('upgrade')
    }
    
    if (hasActiveSubscription && !hasApiKey) {
      incompleteSteps.push('api_key')
    }
    
    if (hasActiveSubscription && !hasPricingConfig) {
      incompleteSteps.push('pricing_config')
    }

    const isComplete = incompleteSteps.length === 0

    return NextResponse.json({
      isComplete,
      incompleteSteps,
      steps: {
        upgrade: {
          completed: hasActiveSubscription,
          required: true
        },
        api_key: {
          completed: hasApiKey,
          required: hasActiveSubscription // Only required if upgraded
        },
        pricing_config: {
          completed: hasPricingConfig,
          required: hasActiveSubscription // Only required if upgraded
        }
      }
    })
  } catch (error) {
    console.error('Error checking onboarding status:', error)
    return NextResponse.json(
      { error: 'Failed to check onboarding status' },
      { status: 500 }
    )
  }
}

