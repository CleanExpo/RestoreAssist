import { NextRequest, NextResponse } from 'next/server'

/**
 * Verifies the CRON_SECRET in the Authorization header.
 * Vercel automatically includes this header when invoking cron routes.
 *
 * @param request - The incoming request
 * @returns NextResponse with 401 error if auth fails, null if auth passes
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null // Auth passed
}
