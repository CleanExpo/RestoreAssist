import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { callAIProvider } from "@/lib/ai-provider"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { messages } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      )
    }

    // Use ANTHROPIC_API_KEY from environment variables
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY

    if (!anthropicApiKey) {
      return NextResponse.json(
        {
          error:
            "ANTHROPIC_API_KEY is not configured. Please set it in your environment variables.",
        },
        { status: 500 }
      )
    }

    // Create integration object for Anthropic
    const integration = {
      id: "env-anthropic",
      name: "Anthropic Claude (Environment)",
      apiKey: anthropicApiKey,
      provider: "anthropic" as const,
    }

    // Build conversation history for the AI
    const conversationHistory = messages.map((msg: any) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }))

    // Get the last user message
    const lastUserMessage = messages[messages.length - 1]?.content || ""

    // System prompt for the chatbot
    const systemPrompt = `You are a helpful AI assistant for Restore Assist, a professional water damage restoration management platform. Your role is to assist users with questions about:

1. **Water Damage Restoration**: Best practices, IICRC standards, drying procedures, equipment selection, moisture assessment, and remediation techniques.

2. **Report Generation**: How to create inspection reports, scope of works, cost estimations, and other professional documents.

3. **Platform Features**: How to use various features of Restore Assist, including:
   - Creating and managing reports
   - Client management
   - Equipment and tools selection
   - Pricing configuration
   - Integrations and API keys
   - Compliance and standards

4. **Technical Questions**: Equipment sizing, psychrometric calculations, drying time estimates, moisture reading interpretation, and water category/class classifications.

5. **Compliance**: IICRC S500 standards, NCC 2022 compliance, Australian building codes, and industry best practices.

6. **General Support**: Troubleshooting, feature explanations, workflow guidance, and best practices for using the platform.

**Guidelines:**
- Be professional, friendly, and helpful
- Provide accurate, actionable information
- If you don't know something, admit it rather than guessing
- Focus on practical, real-world restoration scenarios
- Reference industry standards when relevant (IICRC, NCC, etc.)
- Keep responses concise but comprehensive
- Use clear, professional language appropriate for restoration professionals

**Important**: If a user asks about something outside your knowledge or requires technical support that needs human intervention, politely direct them to contact support through the platform's help section.`

    // Build the conversation context
    // For Anthropic, we'll include conversation history in the system prompt
    // For other providers, we'll include it in the main prompt
    let conversationContext = ""
    if (conversationHistory.length > 1) {
      // Include previous messages for context (excluding the last user message)
      const previousMessages = conversationHistory.slice(0, -1)
      conversationContext = "\n\nPrevious conversation:\n"
      previousMessages.forEach((msg: any) => {
        conversationContext += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n\n`
      })
    }

    // Use Anthropic with conversation context in system prompt
    const fullSystemPrompt = systemPrompt + conversationContext
    
    const response = await callAIProvider(integration, {
      system: fullSystemPrompt,
      prompt: lastUserMessage,
      maxTokens: 4000,
      temperature: 0.7,
    })

    return NextResponse.json({ response })
  } catch (error: any) {
    console.error("Chatbot error:", error)
    return NextResponse.json(
      {
        error: error.message || "Failed to process chat message",
        details: "Please try again or contact support if the issue persists.",
      },
      { status: 500 }
    )
  }
}

