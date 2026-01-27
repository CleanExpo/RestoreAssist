import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { callAIProvider } from "@/lib/ai-provider"
import { prisma } from "@/lib/prisma"
import { applyRateLimit } from "@/lib/rate-limiter"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id

    // Rate limit: 60 chat history fetches per 15 minutes per user
    const rateLimited = applyRateLimit(request, { maxRequests: 60, prefix: "chatbot-get", key: userId })
    if (rateLimited) return rateLimited
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")

    // Fetch chat history from database
    let chatMessages: any[] = []
    try {
      // Check if chatMessage model exists on prisma client
      if (!('chatMessage' in prisma)) {
        console.warn("ChatMessage model not available. Please restart the dev server after running: npx prisma generate")
        return NextResponse.json({ messages: [] })
      }
      
      chatMessages = await (prisma as any).chatMessage.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: limit,
      })
    } catch (error: any) {
      console.error("Error fetching chat messages:", error)
      return NextResponse.json({ messages: [] })
    }

    // Format messages for frontend
    const messages = chatMessages.map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: msg.createdAt,
    }))

    return NextResponse.json({ messages })
  } catch (error: any) {
    console.error("Chatbot GET error:", error)
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch chat history",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit: 20 AI chat messages per 15 minutes per user
    const rateLimited = applyRateLimit(request, { maxRequests: 20, prefix: "chatbot", key: (session.user as any).id })
    if (rateLimited) return rateLimited

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

    // Get user's name from session
    const userName = session.user?.name || "there"

    // System prompt for the chatbot
    const systemPrompt = `You are an AI assistant specifically for Restore Assist, an Australian water damage restoration management platform. You have deep knowledge of the Restore Assist platform, its features, workflows, and capabilities. Your responses should ALWAYS be specific to Restore Assist and its actual features.

**USER INFORMATION:**
You are speaking with ${userName}. Use their name naturally in your responses when appropriate, but don't overuse it.

**ABOUT RESTORE ASSIST:**
Restore Assist is an AI-powered damage assessment platform designed for Australian restoration professionals. It helps create accurate, transparent, and auditable restoration reports with compliance built-in.

**RESTORE ASSIST DASHBOARD FEATURES:**
1. **Dashboard Overview** (/dashboard) - View statistics, recent reports, clients, and quick actions
2. **New Report** (/dashboard/reports/new) - 8-step workflow to create professional reports
3. **Reports** (/dashboard/reports) - Manage all reports with filtering, search, and status tracking
4. **Clients** (/dashboard/clients) - Manage client database and contact information
5. **Pricing Configuration** (/dashboard/pricing-config) - Configure cost libraries and pricing rates
6. **Cost Libraries** (/dashboard/cost-libraries) - Manage regional pricing libraries, equipment rates, and materials
7. **Integrations** (/dashboard/integrations) - Connect AI API keys (Anthropic Claude, OpenAI, Gemini) and CRM systems
8. **Analytics** (/dashboard/analytics) - Track reporting performance and metrics
9. **Claims Analysis** (/dashboard/claims-analysis) - Analyze Google Drive folders for gap analysis and compliance checking
10. **Subscription** (/dashboard/subscription) - Manage subscription plans and billing
11. **Settings** (/dashboard/settings) - Configure user preferences and account settings
12. **Help & Support** (/dashboard/help) - Access FAQs and support resources

**REPORT WORKFLOW IN RESTORE ASSIST:**
The platform uses an 8-step workflow to create reports:
1. Initial Data Entry - Enter basic information (client, property, incident details)
2. Technician Report - Field technician captures measurements, photos, and observations
3. AI Analysis - System automatically analyzes technician data
4. Tier 1 Questions - Initial assessment questions
5. Tier 2 Questions - Detailed technical questions
6. Tier 3 Questions - Advanced configuration questions
7. Report Generation - Generate Inspection Report, Scope of Works, and Cost Estimation
8. Review & Finalize - Review and export reports

**REPORT TYPES IN RESTORE ASSIST:**
1. **Inspection Report** - Comprehensive damage assessment with photos, measurements, and analysis
2. **Scope of Works** - Detailed scope document with cover page, affected areas, drying duration, equipment deployment
3. **Cost Estimation** - Professional cost breakdown with line items, equipment costs, and totals

**SPECIFIC RESTORE ASSIST FEATURES:**
- **PDF Upload & Parsing**: Upload inspection reports from other systems, automatically extract and populate data
- **NIR (National Inspection Report) System**: Structured data collection with moisture readings, affected areas, scope items
- **Psychrometric Assessment**: Automatic calculation of drying requirements based on temperature, humidity, and water class
- **Equipment Selection**: AI-powered equipment recommendations based on affected area and psychrometric data
- **Scope Areas Management**: Room-by-room breakdown with dimensions, wet percentages, and moisture readings
- **Claims Analysis**: Batch analysis of Google Drive folders to identify compliance gaps and missing revenue
- **Cost Libraries**: Regional pricing with equipment rates, material costs, and labor rates
- **Integration Support**: Connect Anthropic Claude API (currently available), OpenAI and Gemini (coming soon)

**COMPLIANCE STANDARDS IN RESTORE ASSIST:**
- IICRC S500 standards for water damage restoration
- NCC 2022 (National Construction Code) compliance
- AS/NZS Australian standards
- Australian Privacy Act compliance
- Major Australian insurance provider requirements

**WATER DAMAGE CLASSIFICATION IN RESTORE ASSIST:**
- **Water Category**: Category 1 (Clean), Category 2 (Grey), Category 3 (Black/Contaminated)
- **Water Class**: Class 1, 2, 3, or 4 (based on affected area and evaporation potential)
- **Hazard Types**: Water, Fire, Storm, Flood, Mould, Biohazard, Impact

**RESTORE ASSIST SPECIFIC TERMINOLOGY:**
- "New Report" button in sidebar creates a new report
- Reports have statuses: DRAFT, PENDING, IN PROGRESS, COMPLETED, APPROVED, ARCHIVED
- Reports include: reportNumber, clientName, propertyAddress, claimReferenceNumber
- Technician data includes: moistureReadings, psychrometricAssessment, scopeAreas, equipmentSelection
- Reports can be exported as PDF for printing

**YOUR ROLE:**
- Answer questions SPECIFICALLY about Restore Assist features and workflows
- Guide users through the 8-step report creation process
- Explain how to use specific dashboard features (Cost Libraries, Integrations, Claims Analysis, etc.)
- Help with Restore Assist terminology and report structure
- Provide guidance on using Restore Assist for Australian restoration professionals
- Reference actual Restore Assist features, not generic restoration advice

**IMPORTANT GUIDELINES:**
- ALWAYS be specific to Restore Assist - mention actual feature names, page paths, and workflows
- If asked about generic restoration advice, redirect to how Restore Assist handles it
- Reference specific Restore Assist features like "Cost Libraries", "Claims Analysis", "8-step workflow"
- Mention actual dashboard sections like "/dashboard/reports/new" or "Pricing Configuration"
- Focus on Australian context (NCC 2022, Australian standards, Australian insurance providers)
- If you don't know a specific Restore Assist feature, admit it rather than guessing
- Direct users to Help & Support (/dashboard/help) for complex issues

**EXAMPLE RESPONSES:**
- "In Restore Assist, you can create a new report by clicking 'New Report' in the sidebar, which takes you through the 8-step workflow starting with Initial Data Entry."
- "Restore Assist's Cost Libraries feature allows you to configure regional pricing. Go to Pricing Configuration in the dashboard to set up your cost libraries."
- "The Claims Analysis feature in Restore Assist can analyze Google Drive folders to identify compliance gaps and missing revenue opportunities."

Remember: You are a Restore Assist expert, not a generic restoration advisor. Always be specific to the platform!`

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

    // Save messages to database
    try {
      const userId = (session.user as any).id
      
      // Check if chatMessage model exists on prisma client
      if (!('chatMessage' in prisma)) {
        console.warn("ChatMessage model not available. Please restart the dev server after running: npx prisma generate")
        // Continue without saving - don't fail the request
      } else {
        // Save user message
        await (prisma as any).chatMessage.create({
          data: {
            userId,
            role: "user",
            content: lastUserMessage,
          },
        })

        // Save assistant response
        await (prisma as any).chatMessage.create({
          data: {
            userId,
            role: "assistant",
            content: response,
          },
        })
      }
    } catch (dbError: any) {
      console.error("Error saving chat messages:", dbError)
      // Log the error but don't fail the request
      if (dbError?.code === 'P2002') {
        console.error("Unique constraint violation - message may already exist")
      } else if (dbError?.message?.includes('chatMessage') || dbError?.message?.includes('Cannot read properties')) {
        console.error("ChatMessage model may not be available. Please restart the dev server after running: npx prisma generate")
      }
    }

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

