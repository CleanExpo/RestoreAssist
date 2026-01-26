import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - List active form templates for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const templates = await prisma.formTemplate.findMany({
      where: {
        OR: [
          { userId: session.user.id },
          { isSystemTemplate: true },
        ],
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        formType: true,
        category: true,
        description: true,
      },
      orderBy: [
        { isSystemTemplate: "desc" },
        { name: "asc" },
      ],
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error("Error fetching form templates:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
