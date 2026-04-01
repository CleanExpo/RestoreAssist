/**
 * YouTube OAuth Helper
 *
 * Retrieves the YouTube-scoped Google OAuth refresh token from the Account
 * model and creates an authenticated `youtube('v3')` client.
 *
 * The refresh token is stored by the one-time consent flow at
 * /api/auth/youtube-consent — the admin visits that URL once, grants
 * youtube.upload + youtube.readonly scopes, and the token is persisted.
 */

import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'

/**
 * Get an authenticated YouTube Data API v3 client for the system user.
 *
 * Looks up the Account record with provider='google' and scope containing
 * 'youtube' for the given userId.
 */
export async function getYouTubeClient(systemUserId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId: systemUserId,
      provider: 'google',
      scope: { contains: 'youtube' },
    },
    select: {
      refresh_token: true,
      access_token: true,
      expires_at: true,
    },
  })

  if (!account?.refresh_token) {
    throw new Error(
      'YouTube OAuth not configured. Admin must visit /api/auth/youtube-consent to grant upload permission.'
    )
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/youtube-consent/callback`
  )

  oauth2Client.setCredentials({
    refresh_token: account.refresh_token,
    access_token: account.access_token ?? undefined,
  })

  return google.youtube({ version: 'v3', auth: oauth2Client })
}

/**
 * Build the Google OAuth consent URL for YouTube upload scope.
 * Used by the one-time /api/auth/youtube-consent route.
 */
export function buildYouTubeConsentUrl(state: string): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/youtube-consent/callback`
  )

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent to always get refresh_token
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    state,
  })
}

/**
 * Exchange an authorization code for tokens and store them.
 */
export async function exchangeYouTubeCode(
  code: string,
  userId: string
): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/youtube-consent/callback`
  )

  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.refresh_token) {
    throw new Error('No refresh_token received — user may need to revoke and re-grant')
  }

  // Upsert an Account record specifically for YouTube
  // Using providerAccountId = 'youtube-upload' to distinguish from the login Account
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: 'google',
        providerAccountId: 'youtube-upload',
      },
    },
    create: {
      userId,
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'youtube-upload',
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? null,
      expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
      token_type: tokens.token_type ?? 'Bearer',
      scope: tokens.scope ?? 'youtube.upload youtube.readonly',
    },
    update: {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? null,
      expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
      scope: tokens.scope ?? 'youtube.upload youtube.readonly',
    },
  })
}
