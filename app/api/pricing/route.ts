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

    // Get user's pricing structure
    const pricingStructure = await prisma.pricingStructure.findUnique({
      where: { userId: session.user.id }
    })

    if (!pricingStructure) {
      // Return empty structure with defaults
      return NextResponse.json({
        exists: false,
        pricing: null,
        message: "No pricing structure configured. Please set up your pricing."
      })
    }

    return NextResponse.json({
      exists: true,
      pricing: pricingStructure
    })
  } catch (error) {
    console.error("Error fetching pricing structure:", error)
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

    // Check if pricing structure already exists
    const existing = await prisma.pricingStructure.findUnique({
      where: { userId: session.user.id }
    })

    if (existing) {
      return NextResponse.json(
        { error: "Pricing structure already exists. Use PUT to update." },
        { status: 400 }
      )
    }

    // Create new pricing structure
    const pricingStructure = await prisma.pricingStructure.create({
      data: {
        userId: session.user.id,

        // Callout Fees
        minimalCalloutFee: body.minimalCalloutFee || 0,
        administrationFee: body.administrationFee || 0,

        // Normal Hours Labour Rates
        masterTechnicianRate: body.masterTechnicianRate || 0,
        qualifiedTechnicianRate: body.qualifiedTechnicianRate || 0,
        labourerRate: body.labourerRate || 0,

        // After Hours - Master Technician
        masterAfterHoursWeekday: body.masterAfterHoursWeekday || 0,
        masterSaturday: body.masterSaturday || 0,
        masterSunday: body.masterSunday || 0,

        // After Hours - Qualified Technician
        qualifiedAfterHoursWeekday: body.qualifiedAfterHoursWeekday || 0,
        qualifiedSaturday: body.qualifiedSaturday || 0,
        qualifiedSunday: body.qualifiedSunday || 0,

        // After Hours - Labourer
        labourerAfterHoursWeekday: body.labourerAfterHoursWeekday || 0,
        labourerSaturday: body.labourerSaturday || 0,
        labourerSunday: body.labourerSunday || 0,

        // Equipment Rates - Dehumidifiers
        dehumidifierLarge: body.dehumidifierLarge || 0,
        dehumidifierMedium: body.dehumidifierMedium || 0,
        dehumidifierDesiccant: body.dehumidifierDesiccant || 0,

        // Equipment Rates - Air Movers
        airmoverAxial: body.airmoverAxial || 0,
        airmoverCentrifugal: body.airmoverCentrifugal || 0,
        airmoverLayflat: body.airmoverLayflat || 0,

        // Equipment Rates - AFDs
        afdExtraLarge: body.afdExtraLarge || 0,
        afdLarge500cfm: body.afdLarge500cfm || 0,

        // Equipment Rates - Extraction
        extractionTruckMounted: body.extractionTruckMounted || 0,
        extractionElectric: body.extractionElectric || 0,

        // Thermal Camera
        thermalCameraClaimCost: body.thermalCameraClaimCost || 0,

        // Chemical Costs
        chemicalAntiMicrobial: body.chemicalAntiMicrobial || 1.50,
        chemicalMouldRemediation: body.chemicalMouldRemediation || 2.50,
        chemicalBioHazard: body.chemicalBioHazard || 4.50,

        // Custom Fields (JSON)
        customLabourRates: body.customLabourRates ? JSON.stringify(body.customLabourRates) : null,
        customEquipmentRates: body.customEquipmentRates ? JSON.stringify(body.customEquipmentRates) : null,
        customChemicalRates: body.customChemicalRates ? JSON.stringify(body.customChemicalRates) : null,
        customMiscRates: body.customMiscRates ? JSON.stringify(body.customMiscRates) : null,

        // Metadata
        currency: body.currency || "AUD",
        taxRate: body.taxRate || 0.10,
      }
    })

    console.log(`[Pricing] User ${session.user.email} created pricing structure`)

    return NextResponse.json({
      success: true,
      pricing: pricingStructure
    }, { status: 201 })
  } catch (error) {
    console.error("Error creating pricing structure:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Update pricing structure
    const pricingStructure = await prisma.pricingStructure.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,

        // Callout Fees
        minimalCalloutFee: body.minimalCalloutFee || 0,
        administrationFee: body.administrationFee || 0,

        // Normal Hours Labour Rates
        masterTechnicianRate: body.masterTechnicianRate || 0,
        qualifiedTechnicianRate: body.qualifiedTechnicianRate || 0,
        labourerRate: body.labourerRate || 0,

        // After Hours - Master Technician
        masterAfterHoursWeekday: body.masterAfterHoursWeekday || 0,
        masterSaturday: body.masterSaturday || 0,
        masterSunday: body.masterSunday || 0,

        // After Hours - Qualified Technician
        qualifiedAfterHoursWeekday: body.qualifiedAfterHoursWeekday || 0,
        qualifiedSaturday: body.qualifiedSaturday || 0,
        qualifiedSunday: body.qualifiedSunday || 0,

        // After Hours - Labourer
        labourerAfterHoursWeekday: body.labourerAfterHoursWeekday || 0,
        labourerSaturday: body.labourerSaturday || 0,
        labourerSunday: body.labourerSunday || 0,

        // Equipment Rates - Dehumidifiers
        dehumidifierLarge: body.dehumidifierLarge || 0,
        dehumidifierMedium: body.dehumidifierMedium || 0,
        dehumidifierDesiccant: body.dehumidifierDesiccant || 0,

        // Equipment Rates - Air Movers
        airmoverAxial: body.airmoverAxial || 0,
        airmoverCentrifugal: body.airmoverCentrifugal || 0,
        airmoverLayflat: body.airmoverLayflat || 0,

        // Equipment Rates - AFDs
        afdExtraLarge: body.afdExtraLarge || 0,
        afdLarge500cfm: body.afdLarge500cfm || 0,

        // Equipment Rates - Extraction
        extractionTruckMounted: body.extractionTruckMounted || 0,
        extractionElectric: body.extractionElectric || 0,

        // Thermal Camera
        thermalCameraClaimCost: body.thermalCameraClaimCost || 0,

        // Chemical Costs
        chemicalAntiMicrobial: body.chemicalAntiMicrobial || 1.50,
        chemicalMouldRemediation: body.chemicalMouldRemediation || 2.50,
        chemicalBioHazard: body.chemicalBioHazard || 4.50,

        // Custom Fields (JSON)
        customLabourRates: body.customLabourRates ? JSON.stringify(body.customLabourRates) : null,
        customEquipmentRates: body.customEquipmentRates ? JSON.stringify(body.customEquipmentRates) : null,
        customChemicalRates: body.customChemicalRates ? JSON.stringify(body.customChemicalRates) : null,
        customMiscRates: body.customMiscRates ? JSON.stringify(body.customMiscRates) : null,

        // Metadata
        currency: body.currency || "AUD",
        taxRate: body.taxRate || 0.10,
      },
      update: {
        // Callout Fees
        minimalCalloutFee: body.minimalCalloutFee,
        administrationFee: body.administrationFee,

        // Normal Hours Labour Rates
        masterTechnicianRate: body.masterTechnicianRate,
        qualifiedTechnicianRate: body.qualifiedTechnicianRate,
        labourerRate: body.labourerRate,

        // After Hours - Master Technician
        masterAfterHoursWeekday: body.masterAfterHoursWeekday,
        masterSaturday: body.masterSaturday,
        masterSunday: body.masterSunday,

        // After Hours - Qualified Technician
        qualifiedAfterHoursWeekday: body.qualifiedAfterHoursWeekday,
        qualifiedSaturday: body.qualifiedSaturday,
        qualifiedSunday: body.qualifiedSunday,

        // After Hours - Labourer
        labourerAfterHoursWeekday: body.labourerAfterHoursWeekday,
        labourerSaturday: body.labourerSaturday,
        labourerSunday: body.labourerSunday,

        // Equipment Rates - Dehumidifiers
        dehumidifierLarge: body.dehumidifierLarge,
        dehumidifierMedium: body.dehumidifierMedium,
        dehumidifierDesiccant: body.dehumidifierDesiccant,

        // Equipment Rates - Air Movers
        airmoverAxial: body.airmoverAxial,
        airmoverCentrifugal: body.airmoverCentrifugal,
        airmoverLayflat: body.airmoverLayflat,

        // Equipment Rates - AFDs
        afdExtraLarge: body.afdExtraLarge,
        afdLarge500cfm: body.afdLarge500cfm,

        // Equipment Rates - Extraction
        extractionTruckMounted: body.extractionTruckMounted,
        extractionElectric: body.extractionElectric,

        // Thermal Camera
        thermalCameraClaimCost: body.thermalCameraClaimCost,

        // Chemical Costs
        chemicalAntiMicrobial: body.chemicalAntiMicrobial,
        chemicalMouldRemediation: body.chemicalMouldRemediation,
        chemicalBioHazard: body.chemicalBioHazard,

        // Custom Fields (JSON)
        customLabourRates: body.customLabourRates ? JSON.stringify(body.customLabourRates) : undefined,
        customEquipmentRates: body.customEquipmentRates ? JSON.stringify(body.customEquipmentRates) : undefined,
        customChemicalRates: body.customChemicalRates ? JSON.stringify(body.customChemicalRates) : undefined,
        customMiscRates: body.customMiscRates ? JSON.stringify(body.customMiscRates) : undefined,

        // Metadata
        currency: body.currency,
        taxRate: body.taxRate,
      }
    })

    console.log(`[Pricing] User ${session.user.email} updated pricing structure`)

    return NextResponse.json({
      success: true,
      pricing: pricingStructure
    })
  } catch (error) {
    console.error("Error updating pricing structure:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
