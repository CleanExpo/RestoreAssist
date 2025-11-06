import { NextResponse } from "next/server"

/**
 * GET /api/auth/providers
 * Returns which auth providers are configured
 */
export async function GET() {
  const hasGoogleOAuth =
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_ID.includes('your-google-client-id')

  return NextResponse.json({
    google: !!hasGoogleOAuth,
    credentials: true, // Always available
  })
}
