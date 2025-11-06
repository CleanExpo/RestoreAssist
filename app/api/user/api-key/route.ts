import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/crypto"

/**
 * GET /api/user/api-key
 * Retrieve user's API key (decrypted)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        anthropicApiKey: true,
        hasCompletedOnboarding: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Decrypt API key if it exists
    let apiKey = null
    if (user.anthropicApiKey) {
      try {
        apiKey = decrypt(user.anthropicApiKey)
        // Mask the API key for security (show only first 10 and last 4 characters)
        const masked = apiKey.slice(0, 10) + '...' + apiKey.slice(-4)
        return NextResponse.json({
          hasApiKey: true,
          apiKey: masked,
          hasCompletedOnboarding: user.hasCompletedOnboarding
        })
      } catch (error) {
        console.error('Error decrypting API key:', error)
        return NextResponse.json({
          hasApiKey: false,
          hasCompletedOnboarding: user.hasCompletedOnboarding
        })
      }
    }

    return NextResponse.json({
      hasApiKey: false,
      hasCompletedOnboarding: user.hasCompletedOnboarding
    })
  } catch (error) {
    console.error("Error fetching API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/user/api-key
 * Save or update user's API key (encrypted)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    }

    const body = await request.json()
    const { apiKey } = body

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    // Basic validation for Anthropic API keys
    if (!apiKey.startsWith('sk-ant-')) {
      return NextResponse.json({
        error: "Invalid API key format. Anthropic API keys should start with 'sk-ant-'"
      }, { status: 400 })
    }

    if (apiKey.length < 20) {
      return NextResponse.json({
        error: "API key is too short"
      }, { status: 400 })
    }

    // Encrypt the API key
    let encryptedApiKey: string
    try {
      encryptedApiKey = encrypt(apiKey)
    } catch (error) {
      console.error('Error encrypting API key:', error)
      return NextResponse.json({
        error: "Failed to encrypt API key"
      }, { status: 500 })
    }

    // Save encrypted API key to database
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        anthropicApiKey: encryptedApiKey,
        hasCompletedOnboarding: true,
      },
      select: {
        id: true,
        hasCompletedOnboarding: true,
      }
    })

    return NextResponse.json({
      success: true,
      message: "API key saved successfully",
      hasCompletedOnboarding: updatedUser.hasCompletedOnboarding
    })
  } catch (error) {
    console.error("Error saving API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * DELETE /api/user/api-key
 * Remove user's API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        anthropicApiKey: null,
      }
    })

    return NextResponse.json({
      success: true,
      message: "API key removed successfully"
    })
  } catch (error) {
    console.error("Error deleting API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
