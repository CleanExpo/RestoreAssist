/**
 * POST /api/inspections/[id]/equipment-calculator
 *
 * Calculate IICRC S500-compliant equipment quantities for a water damage inspection.
 * Saves results as ScopeItem records with IICRC justifications (autoDetermined: true).
 *
 * Body: {
 *   affectedAreaM2: number
 *   damageClass?: "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4"   // overrides inspection record
 *   damageCategory?: "CAT_1" | "CAT_2" | "CAT_3"                  // overrides inspection record
 *   floorCount?: number
 *   saveScopeItems?: boolean   // default true — persist as ScopeItem records
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  calculateEquipment,
  type DamageCategory,
  type DamageClass,
} from "@/lib/equipment-calculator"

interface RouteParams {
  params: { id: string }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: inspectionId } = params

    // Verify ownership + get classification from inspection record
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: {
        id: true,
        classifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { category: true, class: true },
        },
      },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const body = await request.json()
    const {
      affectedAreaM2,
      damageClass: bodyClass,
      damageCategory: bodyCategory,
      floorCount = 1,
      saveScopeItems = true,
    } = body as {
      affectedAreaM2: number
      damageClass?: DamageClass
      damageCategory?: DamageCategory
      floorCount?: number
      saveScopeItems?: boolean
    }

    if (!affectedAreaM2 || affectedAreaM2 <= 0) {
      return NextResponse.json({ error: "affectedAreaM2 must be a positive number" }, { status: 400 })
    }

    // Resolve category/class: body overrides → inspection classification record → error
    const latestClassification = inspection.classifications[0]
    const resolvedCategory = (bodyCategory ??
      (latestClassification?.category ? `CAT_${latestClassification.category}` : undefined)) as DamageCategory | undefined
    const resolvedClass = (bodyClass ??
      (latestClassification?.class ? `CLASS_${latestClassification.class}` : undefined)) as DamageClass | undefined

    if (!resolvedCategory || !resolvedClass) {
      return NextResponse.json(
        {
          error:
            "damageCategory and damageClass are required. Either pass them in the request body, or ensure the inspection has a Classification record.",
        },
        { status: 400 }
      )
    }

    // Run the calculator
    const result = calculateEquipment({
      affectedAreaM2,
      damageClass: resolvedClass,
      damageCategory: resolvedCategory,
      floorCount,
    })

    // Persist as ScopeItem records (autoDetermined)
    let savedScopeItems: string[] = []
    if (saveScopeItems) {
      // Remove any previous auto-determined equipment scope items
      await prisma.scopeItem.deleteMany({
        where: {
          inspectionId,
          autoDetermined: true,
          itemType: {
            in: ["air_mover", "lgr_dehumidifier", "air_scrubber", "negative_air_machine"],
          },
        },
      })

      for (const item of result.equipmentList) {
        const scopeItem = await prisma.scopeItem.create({
          data: {
            inspectionId,
            itemType: item.type,
            description: `${item.label} — ${item.suggestedModel}`,
            quantity: item.quantity,
            unit: "unit/day",
            specification: `Estimated amps: ${item.estimatedAmpsEach}A each (${item.estimatedAmpsTotal}A total)`,
            autoDetermined: true,
            justification: `${item.justification} — ${item.iicrcReference}`,
            isRequired: true,
            isSelected: true,
          },
        })
        savedScopeItems.push(scopeItem.id)
      }
    }

    return NextResponse.json({
      ...result,
      inspectionId,
      affectedAreaM2,
      floorCount,
      damageCategory: resolvedCategory,
      damageClass: resolvedClass,
      savedScopeItemIds: savedScopeItems,
      message: saveScopeItems
        ? `Equipment calculated and saved as ${savedScopeItems.length} ScopeItem records.`
        : "Equipment calculated (not saved — pass saveScopeItems: true to persist).",
    })
  } catch (error) {
    console.error("[equipment-calculator POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
