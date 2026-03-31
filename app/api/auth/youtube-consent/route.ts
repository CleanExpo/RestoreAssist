/**
 * GET /api/auth/youtube-consent
 *
 * One-time admin setup: redirects to Google OAuth consent with YouTube
 * upload and readonly scopes. The resulting refresh_token is stored in
 * the Account model and used by the distribution cron.
 *
 * GET /api/auth/youtube-consent — initiates consent flow
 * GET /api/auth/youtube-consent?code=...&state=... — handles callback
 *
 * Authentication: session required (admin only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildYouTubeConsentUrl, exchangeYouTubeCode } from '@/lib/youtube/auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only allow ADMIN users to set up YouTube
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // ── Callback: exchange code for tokens ──────────────────────────────────
  if (code && state) {
    try {
      // Validate state to prevent CSRF
      // State format: base64url(JSON({ userId, timestamp, nonce }))
      const stateData = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf8')
      )

      if (stateData.userId !== session.user.id) {
        return redirectWithError('State mismatch — try again')
      }

      if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
        return redirectWithError('Consent session expired — try again')
      }

      // Use the system user ID if set, otherwise the current admin
      const targetUserId = process.env.CONTENT_SYSTEM_USER_ID || session.user.id

      await exchangeYouTubeCode(code, targetUserId)

      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin
      return NextResponse.redirect(
        new URL(
          '/dashboard/integrations?success=' +
            encodeURIComponent('YouTube connected — videos will be published automatically'),
          baseUrl
        )
      )
    } catch (err) {
      console.error('[youtube-consent] Token exchange error:', err)
      return redirectWithError(
        err instanceof Error ? err.message : 'Token exchange failed'
      )
    }
  }

  // ── Initiate: redirect to Google consent ────────────────────────────────
  const statePayload = Buffer.from(
    JSON.stringify({
      userId: session.user.id,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    })
  ).toString('base64url')

  const consentUrl = buildYouTubeConsentUrl(statePayload)
  return NextResponse.redirect(consentUrl)
}

function redirectWithError(error: string): NextResponse {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return NextResponse.redirect(
    new URL(
      `/dashboard/integrations?error=${encodeURIComponent(error)}`,
      baseUrl
    )
  )
}
