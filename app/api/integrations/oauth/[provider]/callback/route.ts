/**
 * OAuth Callback Route
 * GET /api/integrations/oauth/[provider]/callback
 * Handles OAuth callback and token exchange
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  validateOAuthState,
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from '@/lib/integrations/oauth-handler'
import { createClientForIntegration } from '@/lib/integrations'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider: providerParam } = await params
    const provider = providerParam.toUpperCase() as IntegrationProvider

    // Validate provider
    if (!PROVIDER_CONFIG[provider]) {
      return redirectWithError('Invalid provider', providerParam)
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, errorDescription)
      return redirectWithError(errorDescription || error, providerParam)
    }

    if (!code || !state) {
      return redirectWithError('Missing code or state', providerParam)
    }

    // Validate state
    const stateData = validateOAuthState(state)
    if (!stateData) {
      return redirectWithError('Invalid or expired state', providerParam)
    }

    // Find integration by user and provider
    const integration = await prisma.integration.findFirst({
      where: {
        userId: stateData.userId,
        provider,
      },
    })

    if (!integration) {
      return redirectWithError('Integration not found', providerParam)
    }

    // Parse stored config for redirect URI and code verifier
    let config: { redirectUri?: string; codeVerifier?: string } = {}
    if (integration.config) {
      try {
        config = JSON.parse(integration.config)
      } catch {
        // Ignore parse errors
      }
    }

    const redirectUri = config.redirectUri || `${process.env.NEXTAUTH_URL}/api/integrations/oauth/${providerParam.toLowerCase()}/callback`

    // Create client and exchange code for tokens
    const client = await createClientForIntegration(integration.id)
    await client.exchangeCodeForTokens(code, redirectUri, config.codeVerifier)

    // Handle QuickBooks realm ID from callback
    if (provider === 'QUICKBOOKS') {
      const realmId = searchParams.get('realmId')
      if (realmId) {
        await prisma.integration.update({
          where: { id: integration.id },
          data: { realmId },
        })
      }
    }

    // Clear config (remove stored state and code verifier)
    await prisma.integration.update({
      where: { id: integration.id },
      data: { config: null },
    })

    // Redirect to integrations page with success
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?success=${encodeURIComponent(`${PROVIDER_CONFIG[provider].name} connected successfully`)}`, process.env.NEXTAUTH_URL || request.nextUrl.origin)
    )
  } catch (error) {
    console.error('OAuth callback error:', error)
    const { provider: providerParam } = await params
    return redirectWithError(
      error instanceof Error ? error.message : 'Token exchange failed',
      providerParam
    )
  }
}

function redirectWithError(error: string, provider: string): NextResponse {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return NextResponse.redirect(
    new URL(`/dashboard/integrations?error=${encodeURIComponent(error)}&provider=${provider}`, baseUrl)
  )
}
