import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Get classification results
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
    
    // Get inspection with classifications
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        classifications: {
          orderBy: { createdAt: "desc" }
        },
        affectedAreas: {
          include: {
            // Link classifications to areas if needed
          }
        }
      }
    })
    
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }
    
    if (inspection.classifications.length === 0) {
      return NextResponse.json(
        { error: "Classification not yet determined. Please submit the inspection first." },
        { status: 400 }
      )
    }
    
    // Get the most recent classification (should be final)
    const classification = inspection.classifications[0]
    
    return NextResponse.json({
      classification,
      inspection: {
        id: inspection.id,
        status: inspection.status,
        inspectionNumber: inspection.inspectionNumber
      }
    })
  } catch (error) {
    console.error("Error fetching classification:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

