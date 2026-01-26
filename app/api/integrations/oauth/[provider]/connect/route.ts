/**
 * OAuth Connect Route
 * POST /api/integrations/oauth/[provider]/connect
 * Initiates OAuth flow for the specified provider
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  generateOAuthState,
  generatePKCE,
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from '@/lib/integrations/oauth-handler'
import { getProviderAuthUrl } from '@/lib/integrations'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { provider: providerParam } = await params
    const provider = providerParam.toUpperCase() as IntegrationProvider

    // Validate provider
    if (!PROVIDER_CONFIG[provider]) {
      return NextResponse.json(
        { error: `Invalid provider: ${providerParam}` },
        { status: 400 }
      )
    }

    const config = PROVIDER_CONFIG[provider]

    // Check if integration already exists for this user/provider
    let integration = await prisma.integration.findFirst({
      where: {
        userId: session.user.id,
        provider,
      },
    })

    // Create integration record if it doesn't exist
    if (!integration) {
      integration = await prisma.integration.create({
        data: {
          userId: session.user.id,
          provider,
          name: config.name,
          icon: config.icon,
          status: 'DISCONNECTED',
        },
      })
    }

    // Generate OAuth state
    const state = generateOAuthState(session.user.id, provider)

    // Generate PKCE if required
    let codeVerifier: string | undefined
    let codeChallenge: string | undefined

    if (config.usePKCE) {
      const pkce = generatePKCE()
      codeVerifier = pkce.codeVerifier
      codeChallenge = pkce.codeChallenge
    }

    // Build redirect URI
    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin
    const redirectUri = `${baseUrl}/api/integrations/oauth/${providerParam.toLowerCase()}/callback`

    // Get auth URL
    const authUrl = getProviderAuthUrl(
      provider,
      integration.id,
      redirectUri,
      state,
      codeChallenge
    )

    // Store state and code verifier in integration for callback validation
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        config: JSON.stringify({
          oauthState: state,
          codeVerifier,
          redirectUri,
        }),
      },
    })

    return NextResponse.json({
      authUrl,
      integrationId: integration.id,
    })
  } catch (error) {
    console.error('OAuth connect error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    )
  }
}
