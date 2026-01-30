import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sanitizeString } from "@/lib/sanitize"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const libraryId = body.libraryId
    const category = sanitizeString(body.category, 200)
    const description = sanitizeString(body.description, 1000)
    const rate = body.rate
    const unit = sanitizeString(body.unit, 50)

    if (!libraryId || !category || !description || rate === undefined || !unit) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    // Verify library belongs to user
    const library = await prisma.costLibrary.findFirst({
      where: {
        id: libraryId,
        userId: session.user.id
      }
    })

    if (!library) {
      return NextResponse.json({ error: "Cost library not found" }, { status: 404 })
    }

    const item = await prisma.costItem.create({
      data: {
        category,
        description,
        rate: parseFloat(rate),
        unit,
        libraryId
      }
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error("Error creating cost item:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
