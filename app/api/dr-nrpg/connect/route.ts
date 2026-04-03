/**
 * POST /api/dr-nrpg/connect
 * Save DR-NRPG API credentials and generate a webhook secret.
 *
 * GET /api/dr-nrpg/connect
 * Return integration status (never returns apiKey or webhookSecret).
 *
 * DELETE /api/dr-nrpg/connect
 * Remove the DR-NRPG integration.
 *
 * Body (POST):
 * {
 *   drNrpgApiKey: string
 *   drNrpgBaseUrl?: string  // default: https://api.dr-nrpg.com.au
 *   webhookSecret?: string  // if omitted, a secure 32-byte secret is auto-generated
 * }
 *
 * After connecting, give DR-NRPG the following webhook URL:
 *   POST {NEXTAUTH_URL}/api/webhooks/dr-nrpg
 *   Header: X-DRNRPG-Signature: sha256=<hmac-sha256 of body using webhookSecret>
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"

const DR_NRPG_BASE_URL = "https://api.dr-nrpg.com.au"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      drNrpgApiKey,
      drNrpgBaseUrl,
      webhookSecret,
    } = body as {
      drNrpgApiKey: string
      drNrpgBaseUrl?: string
      webhookSecret?: string
    }

    if (!drNrpgApiKey?.trim()) {
      return NextResponse.json({ error: "drNrpgApiKey is required" }, { status: 400 })
    }

    const resolvedBase = (drNrpgBaseUrl?.trim() || DR_NRPG_BASE_URL).replace(/\/$/, "")

    // Auto-generate a secure webhook secret if not provided
    // This is used to verify inbound webhooks from DR-NRPG
    const resolvedSecret = webhookSecret?.trim() || randomBytes(32).toString("hex")

    const integration = await prisma.drNrpgIntegration.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        drNrpgApiKey: drNrpgApiKey.trim(),
        drNrpgBaseUrl: resolvedBase,
        webhookSecret: resolvedSecret,
        isActive: true,
      },
      update: {
        drNrpgApiKey: drNrpgApiKey.trim(),
        drNrpgBaseUrl: resolvedBase,
        webhookSecret: resolvedSecret,
        isActive: true,
        updatedAt: new Date(),
      },
    })

    const appUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.com.au"

    return NextResponse.json({
      success: true,
      integrationId: integration.id,
      webhookUrl: `${appUrl}/api/webhooks/dr-nrpg`,
      webhookSecret: resolvedSecret, // Return once at creation — store securely in DR-NRPG
      signatureHeader: "X-DRNRPG-Signature",
      signatureFormat: "sha256=<hmac-sha256-hex>",
      message:
        "DR-NRPG integration saved. Configure the webhookUrl and webhookSecret in DR-NRPG's outbound webhook settings.",
    })
  } catch (error) {
    console.error("[dr-nrpg/connect POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const integration = await prisma.drNrpgIntegration.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        isActive: true,
        drNrpgBaseUrl: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        // Never return drNrpgApiKey or webhookSecret
      },
    })

    if (!integration) {
      return NextResponse.json({ integration: null })
    }

    const appUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.com.au"

    return NextResponse.json({
      integration: {
        ...integration,
        webhookUrl: `${appUrl}/api/webhooks/dr-nrpg`,
      },
    })
  } catch (error) {
    console.error("[dr-nrpg/connect GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.drNrpgIntegration.deleteMany({
      where: { userId: session.user.id },
    })

    return NextResponse.json({ success: true, message: "DR-NRPG integration removed." })
  } catch (error) {
    console.error("[dr-nrpg/connect DELETE]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
