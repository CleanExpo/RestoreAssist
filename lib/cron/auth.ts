import { NextRequest, NextResponse } from 'next/server'

const WEAK_DEFAULT_SECRET = 'development-secret-12345'

/**
 * Verifies the CRON_SECRET in the Authorization header.
 * Vercel automatically includes this header when invoking cron routes.
 *
 * Rejects requests if CRON_SECRET is missing or equals the known weak default.
 *
 * @param request - The incoming request
 * @returns NextResponse with 401 error if auth fails, null if auth passes
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || cronSecret === WEAK_DEFAULT_SECRET) {
    console.error('[CRON] CRITICAL: CRON_SECRET is not set or is using default value. Rejecting request.')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null // Auth passed
}
