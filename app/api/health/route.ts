import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { applyRateLimit } from '@/lib/rate-limiter'

const startTime = Date.now()

export async function GET(request: NextRequest) {
  // Rate limit: 60 requests per minute per IP
  const rateLimited = applyRateLimit(request, { maxRequests: 60, windowMs: 60_000, prefix: 'health' })
  if (rateLimited) return rateLimited

  const checks: Record<string, { status: string; latencyMs?: number }> = {}

  // 1. Database connectivity check
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart }
  } catch {
    checks.database = { status: 'error' }
  }

  const allHealthy = Object.values(checks).every(c => c.status === 'ok')

  return NextResponse.json(
    {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - startTime) / 1000),
      version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  )
}
