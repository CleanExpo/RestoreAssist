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
    const { name, description, icon, apiKey, config } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const integration = await prisma.integration.create({
      data: {
        name,
        description,
        icon,
        apiKey,
        config: config ? JSON.stringify(config) : null,
        status: apiKey ? "CONNECTED" : "DISCONNECTED",
        userId: session.user.id
      }
    })

    return NextResponse.json(integration)
  } catch (error) {
    console.error("Error creating integration:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
