import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const integrations = await prisma.integration.findMany({
      where: {
        userId: session.user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ integrations })
  } catch (error) {
    console.error("Error fetching integrations:", error)
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
    const { name, description, icon, apiKey, config, provider } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    // Determine provider from name if not provided
    let integrationProvider = provider
    if (!integrationProvider) {
      const nameLower = name.toLowerCase()
      if (nameLower.includes('xero')) {
        integrationProvider = 'XERO'
      } else if (nameLower.includes('quickbook')) {
        integrationProvider = 'QUICKBOOKS'
      } else if (nameLower.includes('myob')) {
        integrationProvider = 'MYOB'
      } else if (nameLower.includes('servicem8') || nameLower.includes('service m8')) {
        integrationProvider = 'SERVICEM8'
      } else if (nameLower.includes('ascora')) {
        integrationProvider = 'ASCORA'
      } else {
        // Default to XERO if cannot be determined (for backwards compatibility)
        // Note: Anthropic Claude and other non-accounting services should provide provider explicitly
        integrationProvider = 'XERO'
      }
    }

    // Validate provider is a valid enum value
    const validProviders = ['XERO', 'QUICKBOOKS', 'MYOB', 'SERVICEM8', 'ASCORA']
    if (!validProviders.includes(integrationProvider)) {
      return NextResponse.json({ 
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` 
      }, { status: 400 })
    }

    const integration = await prisma.integration.create({
      data: {
        name,
        description,
        icon,
        apiKey,
        config: config ? JSON.stringify(config) : null,
        status: apiKey ? "CONNECTED" : "DISCONNECTED",
        provider: integrationProvider as any,
        userId: session.user.id
      }
    })

    return NextResponse.json(integration)
  } catch (error) {
    console.error("Error creating integration:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
