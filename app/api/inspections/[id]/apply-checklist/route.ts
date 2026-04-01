import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { IICRC_CHECKLISTS } from "@/lib/iicrc-checklists"

// POST — apply an IICRC checklist template to an inspection's scope items
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
    const { checklistId } = body as { checklistId?: string }

    if (!checklistId) {
      return NextResponse.json({ error: "checklistId is required" }, { status: 400 })
    }

    // Validate inspection ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    // Find the checklist template
    const template = IICRC_CHECKLISTS.find((c) => c.id === checklistId)

    if (!template) {
      return NextResponse.json({ error: "Checklist not found" }, { status: 404 })
    }

    // Fetch existing itemTypes to deduplicate
    const existing = await prisma.scopeItem.findMany({
      where: { inspectionId: id },
      select: { itemType: true },
    })
    const existingTypes = new Set(existing.map((e) => e.itemType))

    // Filter out already-present itemTypes
    const newItems = template.items.filter((item) => !existingTypes.has(item.itemType))
    const skippedCount = template.items.length - newItems.length

    // Bulk-create new scope items
    let created: { id: string; itemType: string; description: string }[] = []
    if (newItems.length > 0) {
      await prisma.scopeItem.createMany({
        data: newItems.map((item) => ({
          inspectionId: id,
          itemType: item.itemType,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          justification: item.justification,
          autoDetermined: true,
          isRequired: true,
          isSelected: true,
        })),
      })

      // Retrieve created items to return to caller
      created = await prisma.scopeItem.findMany({
        where: {
          inspectionId: id,
          itemType: { in: newItems.map((i) => i.itemType) },
        },
        select: { id: true, itemType: true, description: true },
      })
    }

    return NextResponse.json({
      added: created.length,
      skipped: skippedCount,
      items: created,
    })
  } catch (error) {
    console.error("Error applying checklist:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
