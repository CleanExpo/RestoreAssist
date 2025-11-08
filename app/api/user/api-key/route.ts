import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAnthropicClient } from "@/lib/anthropic"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        anthropicApiKey: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Return whether API key exists (don't expose the actual key)
    return NextResponse.json({
      hasApiKey: !!user.anthropicApiKey,
      // Return masked version if key exists
      maskedKey: user.anthropicApiKey
        ? `sk-ant-...${user.anthropicApiKey.slice(-4)}`
        : null
    })
  } catch (error) {
    console.error("Error fetching API key status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { apiKey } = body

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    // Validate API key format (basic validation)
    if (!apiKey.startsWith('sk-ant-')) {
      return NextResponse.json({
        error: "Invalid API key format. Anthropic API keys should start with 'sk-ant-'"
      }, { status: 400 })
    }

    // Test the API key by making a simple request
    try {
      const testClient = createAnthropicClient(apiKey)
      // Make a minimal test request to validate the key
      await testClient.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: "Hi"
          }
        ]
      })
    } catch (testError: any) {
      console.error("API key validation failed:", testError)
      return NextResponse.json({
        error: "Invalid API key. Please check your key and try again.",
        details: testError.message || "API key test failed"
      }, { status: 400 })
    }

    // Save the validated API key
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        anthropicApiKey: apiKey,
      },
      select: {
        id: true,
        email: true,
      }
    })

    console.log(`[API Key] User ${updatedUser.email} saved their Anthropic API key`)

    return NextResponse.json({
      success: true,
      message: "API key saved successfully",
      hasApiKey: true,
      maskedKey: `sk-ant-...${apiKey.slice(-4)}`
    })
  } catch (error) {
    console.error("Error saving API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Remove the API key
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        anthropicApiKey: null,
      }
    })

    console.log(`[API Key] User removed their Anthropic API key`)

    return NextResponse.json({
      success: true,
      message: "API key removed successfully",
      hasApiKey: false
    })
  } catch (error) {
    console.error("Error removing API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
