import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sanitizeString } from "@/lib/sanitize"

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

    const library = await prisma.costLibrary.findFirst({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        items: {
          orderBy: {
            category: 'asc'
          }
        },
        _count: {
          select: {
            items: true
          }
        }
      }
    })

    if (!library) {
      return NextResponse.json({ error: "Cost library not found" }, { status: 404 })
    }

    return NextResponse.json(library)
  } catch (error) {
    console.error("Error fetching cost library:", error)
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
    const name = sanitizeString(body.name, 200)
    const region = sanitizeString(body.region, 200)
    const description = sanitizeString(body.description, 1000)
    const isDefault = body.isDefault

    if (!name || !region) {
      return NextResponse.json({ error: "Name and region are required" }, { status: 400 })
    }

    // Check if library exists and belongs to user
    const existingLibrary = await prisma.costLibrary.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existingLibrary) {
      return NextResponse.json({ error: "Cost library not found" }, { status: 404 })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.costLibrary.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
          id: { not: id }
        },
        data: {
          isDefault: false
        }
      })
    }

    const library = await prisma.costLibrary.update({
      where: { id },
      data: {
        name,
        region,
        description,
        isDefault: isDefault || false
      },
      include: {
        items: {
          orderBy: {
            category: 'asc'
          }
        },
        _count: {
          select: {
            items: true
          }
        }
      }
    })

    return NextResponse.json(library)
  } catch (error) {
    console.error("Error updating cost library:", error)
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

    // Check if library exists and belongs to user
    const existingLibrary = await prisma.costLibrary.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existingLibrary) {
      return NextResponse.json({ error: "Cost library not found" }, { status: 404 })
    }

    await prisma.costLibrary.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting cost library:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
