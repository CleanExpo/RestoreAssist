import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validateAPIKey, type LLMProvider } from "@/lib/llm-providers"

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
        openaiApiKey: true,
        googleApiKey: true,
        preferredLLMProvider: true,
        preferredLLMModel: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Helper function to mask API keys
    const maskKey = (key: string | null, prefix: string) => {
      if (!key) return null
      const visibleLength = Math.min(8, Math.floor(key.length / 4))
      return `${prefix}...${key.slice(-visibleLength)}`
    }

    // Return whether API keys exist (don't expose the actual keys)
    return NextResponse.json({
      providers: {
        anthropic: {
          hasKey: !!user.anthropicApiKey,
          maskedKey: maskKey(user.anthropicApiKey, 'sk-ant')
        },
        openai: {
          hasKey: !!user.openaiApiKey,
          maskedKey: maskKey(user.openaiApiKey, 'sk')
        },
        google: {
          hasKey: !!user.googleApiKey,
          maskedKey: maskKey(user.googleApiKey, 'AIza')
        }
      },
      preferredProvider: user.preferredLLMProvider || 'anthropic',
      preferredModel: user.preferredLLMModel,
      hasAnyKey: !!(user.anthropicApiKey || user.openaiApiKey || user.googleApiKey)
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
    const { provider, apiKey, setAsPreferred, model } = body

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Provider and API key are required" }, { status: 400 })
    }

    // Validate provider
    const validProviders: LLMProvider[] = ['anthropic', 'openai', 'google']
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
    }

    // Validate API key format
    const keyPrefixes = {
      anthropic: 'sk-ant-',
      openai: 'sk-',
      google: 'AIza'
    }

    const expectedPrefix = keyPrefixes[provider as LLMProvider]
    if (!apiKey.startsWith(expectedPrefix)) {
      return NextResponse.json({
        error: `Invalid API key format. ${provider} API keys should start with '${expectedPrefix}'`
      }, { status: 400 })
    }

    // Test the API key by making a simple request
    try {
      const isValid = await validateAPIKey(provider as LLMProvider, apiKey)
      if (!isValid) {
        throw new Error('API key validation failed')
      }
    } catch (testError: any) {
      console.error(`${provider} API key validation failed:`, testError)
      return NextResponse.json({
        error: `Invalid ${provider} API key. Please check your key and try again.`,
        details: testError.message || "API key test failed"
      }, { status: 400 })
    }

    // Prepare update data
    const updateData: any = {}

    if (provider === 'anthropic') {
      updateData.anthropicApiKey = apiKey
    } else if (provider === 'openai') {
      updateData.openaiApiKey = apiKey
    } else if (provider === 'google') {
      updateData.googleApiKey = apiKey
    }

    // Set as preferred if requested
    if (setAsPreferred) {
      updateData.preferredLLMProvider = provider
    }

    // Set model if provided
    if (model) {
      updateData.preferredLLMModel = model
    }

    // Save the validated API key
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        preferredLLMProvider: true,
      }
    })

    console.log(`[API Key] User ${updatedUser.email} saved their ${provider} API key`)

    return NextResponse.json({
      success: true,
      message: `${provider} API key saved successfully`,
      provider,
      hasApiKey: true,
      maskedKey: `${expectedPrefix}...${apiKey.slice(-8)}`,
      isPreferred: setAsPreferred || updatedUser.preferredLLMProvider === provider
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

    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')

    if (!provider) {
      return NextResponse.json({ error: "Provider parameter is required" }, { status: 400 })
    }

    // Validate provider
    const validProviders = ['anthropic', 'openai', 'google']
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
    }

    // Prepare update data
    const updateData: any = {}

    if (provider === 'anthropic') {
      updateData.anthropicApiKey = null
    } else if (provider === 'openai') {
      updateData.openaiApiKey = null
    } else if (provider === 'google') {
      updateData.googleApiKey = null
    }

    // Remove the API key
    await prisma.user.update({
      where: { id: session.user.id },
      data: updateData
    })

    console.log(`[API Key] User removed their ${provider} API key`)

    return NextResponse.json({
      success: true,
      message: `${provider} API key removed successfully`,
      provider,
      hasApiKey: false
    })
  } catch (error) {
    console.error("Error removing API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
