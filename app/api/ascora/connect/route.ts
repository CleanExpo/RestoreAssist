/**
 * POST /api/ascora/connect
 * Save Ascora API key and verify connectivity.
 *
 * DELETE /api/ascora/connect
 * Remove the Ascora integration for the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const ASCORA_BASE_URL = "https://api.ascora.com.au"

/** Verify the key is valid by hitting the Ascora health/jobs endpoint */
async function verifyAscoraKey(apiKey: string, baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/jobs?page=1&pageSize=1`, {
      headers: { Auth: apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { apiKey, baseUrl } = body as { apiKey: string; baseUrl?: string }

    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 })
    }

    const resolvedBase = (baseUrl?.trim() || ASCORA_BASE_URL).replace(/\/$/, "")

    // Verify key before saving
    const valid = await verifyAscoraKey(apiKey.trim(), resolvedBase)
    if (!valid) {
      return NextResponse.json(
        { error: "Could not connect to Ascora with the provided API key. Check Administration → API Settings in Ascora." },
        { status: 422 }
      )
    }

    // Upsert the integration record
    const integration = await prisma.ascoraIntegration.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        apiKey: apiKey.trim(),
        baseUrl: resolvedBase,
        isActive: true,
      },
      update: {
        apiKey: apiKey.trim(),
        baseUrl: resolvedBase,
        isActive: true,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      integrationId: integration.id,
      message: "Ascora connected. Run /api/ascora/sync to import historical data.",
    })
  } catch (error) {
    console.error("[ascora/connect POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.ascoraIntegration.deleteMany({
      where: { userId: session.user.id },
    })

    return NextResponse.json({ success: true, message: "Ascora integration removed." })
  } catch (error) {
    console.error("[ascora/connect DELETE]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const integration = await prisma.ascoraIntegration.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        isActive: true,
        lastSyncAt: true,
        totalJobsImported: true,
        baseUrl: true,
        createdAt: true,
        // Never return apiKey
      },
    })

    return NextResponse.json({ integration })
  } catch (error) {
    console.error("[ascora/connect GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
