import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST - Add scope item
export async function POST(
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
    
    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })
    
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }
    
    // Validate required fields
    if (!body.itemType) {
      return NextResponse.json(
        { error: "Item type is required" },
        { status: 400 }
      )
    }
    
    if (!body.description) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      )
    }
    
    // Create scope item
    const scopeItem = await prisma.scopeItem.create({
      data: {
        inspectionId: id,
        itemType: body.itemType,
        description: body.description,
        areaId: body.areaId || null,
        quantity: body.quantity || null,
        unit: body.unit || null,
        specification: body.specification || null,
        autoDetermined: body.autoDetermined ?? false,
        justification: body.justification || null,
        isRequired: body.isRequired ?? true,
        isSelected: body.isSelected ?? true
      }
    })
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Scope item added",
        entityType: "ScopeItem",
        entityId: scopeItem.id,
        userId: session.user.id,
        changes: JSON.stringify({
          itemType: scopeItem.itemType,
          description: scopeItem.description
        })
      }
    })
    
    return NextResponse.json({ scopeItem }, { status: 201 })
  } catch (error) {
    console.error("Error saving scope item:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

