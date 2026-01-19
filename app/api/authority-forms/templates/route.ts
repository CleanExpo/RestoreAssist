import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/authority-forms/templates
 * Get all available authority form templates
 */
export async function GET() {
  try {
    const templates = await prisma.authorityFormTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        isActive: true
      },
      orderBy: { name: "asc" }
    })
    
    return NextResponse.json({ templates })
  } catch (error) {
    console.error("Error fetching authority form templates:", error)
    return NextResponse.json(
      { error: "Failed to fetch templates", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
