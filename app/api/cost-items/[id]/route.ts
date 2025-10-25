import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
    const { category, description, rate, unit } = body

    if (!category || !description || rate === undefined || !unit) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    // Check if item exists and belongs to user's library
    const existingItem = await prisma.costItem.findFirst({
      where: {
        id,
        library: {
          userId: session.user.id
        }
      }
    })

    if (!existingItem) {
      return NextResponse.json({ error: "Cost item not found" }, { status: 404 })
    }

    const item = await prisma.costItem.update({
      where: { id },
      data: {
        category,
        description,
        rate: parseFloat(rate),
        unit
      }
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error("Error updating cost item:", error)
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

    // Check if item exists and belongs to user's library
    const existingItem = await prisma.costItem.findFirst({
      where: {
        id,
        library: {
          userId: session.user.id
        }
      }
    })

    if (!existingItem) {
      return NextResponse.json({ error: "Cost item not found" }, { status: 404 })
    }

    await prisma.costItem.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting cost item:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
