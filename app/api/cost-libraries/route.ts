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

    const libraries = await prisma.costLibrary.findMany({
      where: {
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ libraries })
  } catch (error) {
    console.error("Error fetching cost libraries:", error)
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
    const { name, region, description, isDefault } = body

    if (!name || !region) {
      return NextResponse.json({ error: "Name and region are required" }, { status: 400 })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.costLibrary.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true
        },
        data: {
          isDefault: false
        }
      })
    }

    const library = await prisma.costLibrary.create({
      data: {
        name,
        region,
        description,
        isDefault: isDefault || false,
        userId: session.user.id
      },
      include: {
        items: true,
        _count: {
          select: {
            items: true
          }
        }
      }
    })

    return NextResponse.json(library)
  } catch (error) {
    console.error("Error creating cost library:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
