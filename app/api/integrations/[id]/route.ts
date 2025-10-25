import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const integration = await prisma.integration.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    return NextResponse.json(integration)
  } catch (error) {
    console.error("Error fetching integration:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, icon, apiKey, config, status } = body

    // Check if integration exists and belongs to user
    const existingIntegration = await prisma.integration.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existingIntegration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    const integration = await prisma.integration.update({
      where: { id },
      data: {
        name,
        description,
        icon,
        apiKey,
        config: config ? JSON.stringify(config) : null,
        status: status || (apiKey ? "CONNECTED" : "DISCONNECTED")
      }
    })

    return NextResponse.json(integration)
  } catch (error) {
    console.error("Error updating integration:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Check if integration exists and belongs to user
    const existingIntegration = await prisma.integration.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existingIntegration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    await prisma.integration.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting integration:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
