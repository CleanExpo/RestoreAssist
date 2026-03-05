import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { classifyIICRC } from "@/lib/nir-classification-engine"
import { getBuildingCodeRequirements, checkBuildingCodeTriggers } from "@/lib/nir-building-codes"
import { determineScopeItems } from "@/lib/nir-scope-determination"
import { estimateCosts } from "@/lib/nir-cost-estimation"

// POST - Submit inspection for processing
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
    
    // Get inspection with all data
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        environmentalData: true,
        moistureReadings: true,
        affectedAreas: true,
        scopeItems: true,
        photos: true
      }
    })
    
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }
    
    // Validate all required data is present
    if (!inspection.environmentalData) {
      return NextResponse.json(
        { error: "Environmental data is required" },
        { status: 400 }
      )
    }
    
    if (inspection.moistureReadings.length === 0) {
      return NextResponse.json(
        { error: "At least one moisture reading is required" },
        { status: 400 }
      )
    }
    
    if (inspection.affectedAreas.length === 0) {
      return NextResponse.json(
        { error: "At least one affected area is required" },
        { status: 400 }
      )
    }
    
    if (inspection.photos.length === 0) {
      return NextResponse.json(
        { error: "At least one photo is required" },
        { status: 400 }
      )
    }
    
    // Update status to SUBMITTED
    await prisma.inspection.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date()
      }
    })
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Inspection submitted for processing",
        entityType: "Inspection",
        entityId: id,
        userId: session.user.id
      }
    })
    
    // Process classification, scope determination, and cost estimation
    // In production, this should be done asynchronously via a queue
    try {
      await processInspectionComplete(id, inspection)
    } catch (error) {
      console.error("Error processing inspection:", error)
      // Don't fail the submission, but log the error
      // In production, would retry via queue
    }
    
    return NextResponse.json({
      message: "Inspection submitted successfully. Processing classification, scope determination, and cost estimation...",
      inspectionId: id,
      status: "SUBMITTED"
    })
  } catch (error) {
    console.error("Error submitting inspection:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Process complete inspection: classification, scope determination, and cost estimation
async function processInspectionComplete(
  inspectionId: string,
  inspection: any
) {
  // Update status to PROCESSING
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "PROCESSING", processedAt: new Date() }
  })
  
  // Step 1: Get building code requirements
  const buildingCodeRequirements = await getBuildingCodeRequirements(
    inspection.propertyPostcode
  )
  
  // Step 2: Classify each affected area
  let primaryCategory = "1"
  let primaryClass = "1"
  const classifications: any[] = []
  
  for (const area of inspection.affectedAreas) {
    // Get relevant moisture readings for this area
    const relevantReadings = inspection.moistureReadings.filter(
      (r: any) => r.location === area.roomZoneId || 
                 r.location.toLowerCase().includes(area.roomZoneId.toLowerCase())
    )
    
    // Determine classification
    const classification = await classifyIICRC({
      waterSource: area.waterSource,
      affectedSquareFootage: area.affectedSquareFootage,
      moistureReadings: relevantReadings,
      environmentalData: inspection.environmentalData,
      timeSinceLoss: area.timeSinceLoss
    })
    
    // Save classification
    const savedClassification = await prisma.classification.create({
      data: {
        inspectionId,
        category: classification.category,
        class: classification.class,
        justification: classification.justification,
        standardReference: classification.standardReference,
        confidence: classification.confidence,
        inputData: JSON.stringify({
          waterSource: area.waterSource,
          affectedSquareFootage: area.affectedSquareFootage,
          moistureReadings: relevantReadings,
          timeSinceLoss: area.timeSinceLoss
        }),
        isFinal: true
      }
    })
    
    classifications.push(savedClassification)
    
    // Update affected area with classification
    await prisma.affectedArea.update({
      where: { id: area.id },
      data: {
        category: classification.category,
        class: classification.class
      }
    })
    
    // Track primary (worst) category and class
    if (parseInt(classification.category) > parseInt(primaryCategory)) {
      primaryCategory = classification.category
    }
    if (parseInt(classification.class) > parseInt(primaryClass)) {
      primaryClass = classification.class
    }
  }
  
  // Update status to CLASSIFIED
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "CLASSIFIED" }
  })
  
  // Step 3: Check building code triggers
  const maxMoisture = Math.max(
    ...inspection.moistureReadings.map((r: any) => r.moistureLevel),
    0
  )
  
  const hasDrywall = inspection.moistureReadings.some((r: any) =>
    r.surfaceType?.toLowerCase().includes("drywall") ||
    r.surfaceType?.toLowerCase().includes("gyprock")
  )
  
  const buildingCodeTriggers = buildingCodeRequirements
    ? checkBuildingCodeTriggers(buildingCodeRequirements, {
        maxMoistureLevel: maxMoisture,
        hasDrywall,
        hasStructuralMaterials: true,
        daysSinceLoss: inspection.affectedAreas[0]?.timeSinceLoss
          ? Math.floor(inspection.affectedAreas[0].timeSinceLoss / 24)
          : undefined
      })
    : null
  
  // Step 4: Determine scope items
  const scopeItems = determineScopeItems({
    category: primaryCategory,
    class: primaryClass,
    waterSource: inspection.affectedAreas[0]?.waterSource || "Clean Water",
    affectedAreas: inspection.affectedAreas.map((area: any) => ({
      roomZoneId: area.roomZoneId,
      affectedSquareFootage: area.affectedSquareFootage,
      surfaceType: inspection.moistureReadings.find((r: any) =>
        r.location === area.roomZoneId
      )?.surfaceType,
      moistureLevel: inspection.moistureReadings.find((r: any) =>
        r.location === area.roomZoneId
      )?.moistureLevel
    })),
    buildingCodeRequirements: buildingCodeRequirements || undefined,
    buildingCodeTriggers: buildingCodeTriggers || undefined,
    environmentalData: inspection.environmentalData
  })
  
  // Save scope items
  for (const scopeItem of scopeItems) {
    await prisma.scopeItem.create({
      data: {
        inspectionId,
        itemType: scopeItem.itemType,
        description: scopeItem.description,
        justification: scopeItem.justification,
        quantity: scopeItem.quantity || null,
        unit: scopeItem.unit || null,
        specification: scopeItem.specification || null,
        autoDetermined: true,
        isRequired: scopeItem.isRequired,
        isSelected: true
      }
    })
  }
  
  // Update status to SCOPED
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "SCOPED" }
  })
  
  // Step 5: Estimate costs
  const costEstimate = await estimateCosts(scopeItems, buildingCodeRequirements?.state)
  
  // Save cost estimates
  for (const costItem of costEstimate.items) {
    await prisma.costEstimate.create({
      data: {
        inspectionId,
        category: costItem.category,
        description: costItem.description,
        quantity: costItem.quantity,
        unit: costItem.unit,
        rate: costItem.rate,
        subtotal: costItem.subtotal,
        costDatabaseId: costItem.costDatabaseId || null,
        isEstimated: costItem.isEstimated,
        contingency: costEstimate.contingency / costEstimate.items.length, // Distribute contingency
        total: costItem.subtotal + (costEstimate.contingency / costEstimate.items.length)
      }
    })
  }
  
  // Update status to ESTIMATED
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "ESTIMATED" }
  })
  
  // Step 6: Mark as COMPLETED
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "COMPLETED" }
  })
  
  return {
    classification: classifications[0],
    scopeItems,
    costEstimate
  }
}

