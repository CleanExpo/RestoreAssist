import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { applyRateLimit } from "@/lib/rate-limiter"

export async function GET(request: NextRequest) {
  // Rate limit: 60 requests per minute per IP
  const rateLimited = applyRateLimit(request, { maxRequests: 60, windowMs: 60_000, prefix: "health" })
  if (rateLimited) return rateLimited

  try {
    // Verify database connectivity
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: "Database connection failed",
      },
      { status: 503 }
    )
  }
}
