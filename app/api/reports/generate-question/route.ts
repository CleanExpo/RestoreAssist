import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Anthropic from "@anthropic-ai/sdk"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { conversation } = body

    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return NextResponse.json({ error: "Conversation is required" }, { status: 400 })
    }

    // Get user's connected API integration
    const integrations = await prisma.integration.findMany({
      where: {
        userId: session.user.id,
        status: "CONNECTED",
        apiKey: { not: null }
      }
    })

    // Find Anthropic integration (check for both "Anthropic Claude" and "Anthropic API" for compatibility)
    const integration = integrations.find(i => 
      i.name === "Anthropic Claude" || 
      i.name === "Anthropic API" ||
      i.name.toLowerCase().includes("anthropic")
    )

    if (!integration) {
      return NextResponse.json(
        { error: "No connected Anthropic API integration found. Please connect an Anthropic API key." },
        { status: 400 }
      )
    }

    if (!integration.apiKey) {
      return NextResponse.json(
        { error: "No valid API key found" },
        { status: 400 }
      )
    }

    // Build conversation context
    const conversationHistory = conversation.map((msg: any) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content
    }))

    // Determine if we have enough information
    const lastUserMessage = conversation[conversation.length - 1]?.content || ""
    const conversationLength = conversation.length

    // Generate follow-up question using Anthropic Claude
    let question = ""
    let isComplete = false

    const systemPrompt = `You are a professional water damage restoration assistant helping to gather information from a client about a water damage incident. 

Your role is to ask natural, conversational follow-up questions to gather all necessary information about:
- The extent of the damage (which rooms/areas are affected)
- The source of the water (where did it come from)
- When the incident occurred (timeline)
- Any visible damage or concerns
- Safety concerns

Ask ONE clear, specific question at a time. Be conversational and empathetic, like a real person would ask. Don't be robotic.

IMPORTANT: After gathering sufficient information about the incident (typically 4-6 exchanges), you MUST ask for (in this order):
1. Client's full name
2. Property address (where the incident occurred)
3. Client's email address
4. Client's phone number

Only mark as complete (isComplete: true) AFTER you have collected all four pieces of information: name, address, email, and phone number.

Format your response as a JSON object with:
- "question": the follow-up question to ask (or a conclusion message if enough info gathered)
- "isComplete": true if enough information has been gathered AND you have collected client name, address, email, and phone number, false otherwise

Example responses:
- Early in conversation: "The entire house?"
- Mid conversation: "Where did the water come from?"
- Mid conversation: "When did this happen?"
- After incident details: "Thank you for that information. May I please have your full name?"
- After name: "Thank you. And what is the property address where this incident occurred?"
- After address: "Thank you. What is your email address?"
- After email: "Thank you. And finally, what is your phone number?"
- When complete: "Thank you for providing all the information. A technician will review your case and contact you soon."`

    try {
      const anthropic = new Anthropic({
        apiKey: integration.apiKey
      })

      // Format conversation history for Anthropic
      const formattedMessages = conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }))

      const { tryClaudeModels } = await import('@/lib/anthropic-models')
      
      console.log("Sending request to Anthropic API with fallback models")

      const message = await tryClaudeModels(
        anthropic,
        {
          system: systemPrompt,
        max_tokens: 500,
        messages: [
          ...formattedMessages,
          {
            role: "user",
            content: "Generate the next question or conclusion as a JSON object with 'question' and 'isComplete' fields. If enough information has been gathered, set isComplete to true and provide a conclusion message."
          }
        ]
        }
      )

      const responseText = message.content[0].type === 'text' 
        ? message.content[0].text 
        : JSON.stringify(message.content[0])

      try {
        const parsed = JSON.parse(responseText)
        question = parsed.question || responseText
        isComplete = parsed.isComplete || false
      } catch {
        question = responseText
        isComplete = conversationLength >= 6 // Auto-complete after 6 exchanges
      }

      // Auto-complete logic: if we have enough exchanges, mark as complete
      if (!isComplete && conversationLength >= 8) {
        isComplete = true
        question = question || "Thank you for providing all the information. A technician will review your case and contact you soon."
      }

      return NextResponse.json({
        question,
        isComplete,
        integrationUsed: "Anthropic API"
      })
    } catch (apiError: any) {
      console.error("API Error:", apiError)
      console.error("API Error Details:", {
        status: apiError.status,
        message: apiError.message,
        error: apiError.error
      })
      
      // If 404, the tryClaudeModels utility already tried all models, so just return error
      if (apiError.status === 404) {
        // The utility already tried all models, so we just return the error
            return NextResponse.json({
          error: "Failed to connect to Anthropic API. Please check your API key and try again.",
          details: apiError.message
        }, { status: 500 })
        }
        
      // For other errors, return the error
      return NextResponse.json({
        error: "Failed to generate question. Please check your API key and try again.",
        details: apiError.message
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error("Error generating question:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate question" },
      { status: 500 }
    )
  }
}

