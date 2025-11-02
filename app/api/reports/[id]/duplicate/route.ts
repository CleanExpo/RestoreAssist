import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    // Check and use credits
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if user has enough credits (only for trial users)
    if (user.subscriptionStatus === 'TRIAL' && user.creditsRemaining < 1) {
      return NextResponse.json(
        { 
          error: "Insufficient credits. Please upgrade your plan to create more reports.",
          upgradeRequired: true,
          creditsRemaining: user.creditsRemaining
        },
        { status: 402 }
      )
    }

    // Find the original report
    const originalReport = await prisma.report.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!originalReport) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Deduct credits BEFORE creating report (only for trial users)
    if (user.subscriptionStatus === 'TRIAL') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          creditsRemaining: Math.max(0, user.creditsRemaining - 1),
          totalCreditsUsed: user.totalCreditsUsed + 1,
        }
      })
    }

    // Generate new report number
    const newReportNumber = `WD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

    // Create duplicate report with updated fields
    const duplicatedReport = await prisma.report.create({
      data: {
        // Basic fields
        title: `${originalReport.title} (Copy)`,
        clientName: originalReport.clientName,
        propertyAddress: originalReport.propertyAddress,
        hazardType: originalReport.hazardType,
        insuranceType: originalReport.insuranceType,
        reportNumber: newReportNumber,
        userId: session.user.id,
        clientId: originalReport.clientId,
        
        // IICRC Assessment fields
        inspectionDate: new Date(),
        waterCategory: originalReport.waterCategory,
        waterClass: originalReport.waterClass,
        sourceOfWater: originalReport.sourceOfWater,
        affectedArea: originalReport.affectedArea,
        safetyHazards: originalReport.safetyHazards,
        
        // Damage assessment fields
        structuralDamage: originalReport.structuralDamage,
        contentsDamage: originalReport.contentsDamage,
        hvacAffected: originalReport.hvacAffected,
        electricalHazards: originalReport.electricalHazards,
        microbialGrowth: originalReport.microbialGrowth,
        
        // Equipment and drying fields
        dehumidificationCapacity: originalReport.dehumidificationCapacity,
        airmoversCount: originalReport.airmoversCount,
        targetHumidity: originalReport.targetHumidity,
        targetTemperature: originalReport.targetTemperature,
        estimatedDryingTime: originalReport.estimatedDryingTime,
        equipmentPlacement: originalReport.equipmentPlacement,
        
        // Monitoring data (copy JSON strings)
        psychrometricReadings: originalReport.psychrometricReadings,
        moistureReadings: originalReport.moistureReadings,
        
        // Remediation data
        safetyPlan: originalReport.safetyPlan,
        containmentSetup: originalReport.containmentSetup,
        decontaminationProcedures: originalReport.decontaminationProcedures,
        postRemediationVerification: originalReport.postRemediationVerification,
        
        // Insurance data (copy JSON strings)
        propertyCover: originalReport.propertyCover,
        contentsCover: originalReport.contentsCover,
        liabilityCover: originalReport.liabilityCover,
        businessInterruption: originalReport.businessInterruption,
        additionalCover: originalReport.additionalCover,
        
        // Set as draft
        status: "DRAFT",
        
        // Optional fields
        totalCost: null, // Reset cost for new report
        description: originalReport.description,
        completionDate: null // Reset completion date
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        },
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
            company: true
          }
        }
      }
    })

    return NextResponse.json(duplicatedReport, { status: 201 })
  } catch (error) {
    console.error("Error duplicating report:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
