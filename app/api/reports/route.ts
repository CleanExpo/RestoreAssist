import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateDetailedReport } from "@/lib/anthropic"
import { canCreateReport, incrementReportUsage } from "@/lib/report-limits"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const pageParam = searchParams.get("page")
    const limitParam = searchParams.get("limit")
    // Only apply pagination if explicitly requested, otherwise fetch all (up to 10000)
    const shouldPaginate = pageParam !== null || limitParam !== null
    const page = pageParam ? parseInt(pageParam) : 1
    const limit = limitParam ? parseInt(limitParam) : (shouldPaginate ? 10 : 10000)
    const status = searchParams.get("status")
    const waterCategory = searchParams.get("waterCategory")
    const waterClass = searchParams.get("waterClass")

    const where: any = {
      userId: session.user.id
    }

    if (status && status !== "all") {
      where.status = status
    }

    if (waterCategory && waterCategory !== "all") {
      where.waterCategory = waterCategory
    }

    if (waterClass && waterClass !== "all") {
      where.waterClass = waterClass
    }

    const reports = await prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: shouldPaginate ? (page - 1) * limit : 0,
      take: limit,
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        },
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            totalIncGST: true
          }
        }
      }
    })

    // Map reports to include estimatedCost from estimate
    const reportsWithCost = reports.map(report => ({
      ...report,
      estimatedCost: report.estimates?.[0]?.totalIncGST || report.estimatedCost || null
    }))

    const total = await prisma.report.count({ where })

    return NextResponse.json({
      reports: reportsWithCost,
      ...(page && limit ? {
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      } : { total })
    })
  } catch (error) {
    console.error("Error fetching reports:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate required fields
    const requiredFields = [
      "title",
      "clientName", 
      "propertyAddress",
      "waterCategory",
      "waterClass"
    ]

    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    // Check if user can create a report
    const canCreate = await canCreateReport(session.user.id)
    
    if (!canCreate.allowed) {
      return NextResponse.json(
        { 
          error: canCreate.reason || "Cannot create report",
          upgradeRequired: true,
        },
        { status: 402 }
      )
    }

    // For trial users, deduct credits
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

    if (user.subscriptionStatus === 'TRIAL') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          creditsRemaining: Math.max(0, (user.creditsRemaining || 0) - 1),
          totalCreditsUsed: (user.totalCreditsUsed || 0) + 1,
        }
      })
    } else if (user.subscriptionStatus === 'ACTIVE') {
      // Increment monthly usage for active subscribers
      await incrementReportUsage(session.user.id)
    }

    // Generate report number if not provided
    const reportNumber = body.reportNumber || `WD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

    // Calculate equipment needs based on IICRC S500 guidelines
    const equipmentNeeds = calculateEquipmentNeeds(body.waterClass, body.affectedArea)
    
    // Process insurance data
    const insuranceData = body.insuranceData || {}
    
    // Generate detailed report using AI
    let detailedReport = null
    try {
      detailedReport = await generateDetailedReport({
        basicInfo: {
          title: body.title,
          clientName: body.clientName,
          propertyAddress: body.propertyAddress,
          dateOfLoss: body.dateOfLoss,
          waterCategory: body.waterCategory,
          waterClass: body.waterClass,
          hazardType: body.hazardType,
          insuranceType: body.insuranceType,
        },
        remediationData: body.remediationData,
        dryingPlan: body.dryingPlan,
        equipmentSizing: body.equipmentSizing,
        monitoringData: body.monitoringData,
        insuranceData: body.insuranceData,
      })
    } catch (aiError) {
      // Continue without detailed report - don't fail the entire process
    }
    
    // Find client by name to set clientId (for linking updated client info)
    let clientId = body.clientId || null
    if (body.clientName && !clientId) {
      const client = await prisma.client.findFirst({
        where: {
          name: body.clientName,
          userId: session.user.id
        }
      })
      if (client) {
        clientId = client.id
      }
    }
    
    const report = await prisma.report.create({
      data: {
        // Basic fields
        title: body.title,
        clientName: body.clientName,
        clientId: clientId,
        propertyAddress: body.propertyAddress,
        hazardType: body.hazardType,
        insuranceType: body.insuranceType,
        status: 'COMPLETED', // Set status as COMPLETED when report is created
        reportNumber,
        userId: session.user.id,
        
        // IICRC Assessment fields
        inspectionDate: body.inspectionDate ? new Date(body.inspectionDate) : new Date(),
        waterCategory: body.waterCategory,
        waterClass: body.waterClass,
        sourceOfWater: body.sourceOfWater,
        affectedArea: body.affectedArea,
        safetyHazards: body.safetyHazards,
        
        // Damage assessment fields
        structuralDamage: body.structuralDamage,
        contentsDamage: body.contentsDamage,
        hvacAffected: body.hvacAffected,
        electricalHazards: body.electricalHazards,
        microbialGrowth: body.microbialGrowth,
        
        // Equipment and drying fields
        dehumidificationCapacity: equipmentNeeds.dehumidification,
        airmoversCount: equipmentNeeds.airmovers,
        targetHumidity: body.dryingPlan?.targetHumidity,
        targetTemperature: body.dryingPlan?.targetTemperature,
        estimatedDryingTime: body.dryingPlan?.estimatedDryingTime,
        equipmentPlacement: body.equipmentSizing?.equipmentPlacement,
        
        // Monitoring data (stored as JSON strings)
        psychrometricReadings: body.monitoringData?.psychrometricReadings ? JSON.stringify(body.monitoringData.psychrometricReadings) : null,
        moistureReadings: body.monitoringData?.moistureReadings ? JSON.stringify(body.monitoringData.moistureReadings) : null,
        
        // Remediation data (stored as JSON strings)
        safetyPlan: body.remediationData?.safetyPlan,
        containmentSetup: body.remediationData?.containmentSetup,
        decontaminationProcedures: body.remediationData?.decontaminationProcedures,
        postRemediationVerification: body.remediationData?.postRemediationVerification,
        
        // Insurance data (stored as JSON strings)
        propertyCover: insuranceData.propertyCover ? JSON.stringify(insuranceData.propertyCover) : null,
        contentsCover: insuranceData.contentsCover ? JSON.stringify(insuranceData.contentsCover) : null,
        liabilityCover: insuranceData.liabilityCover ? JSON.stringify(insuranceData.liabilityCover) : null,
        businessInterruption: insuranceData.businessInterruption ? JSON.stringify(insuranceData.businessInterruption) : null,
        additionalCover: insuranceData.additionalCover ? JSON.stringify(insuranceData.additionalCover) : null,
        
        // Optional fields
        completionDate: body.completionDate ? new Date(body.completionDate) : null,
        totalCost: body.totalCost,
        description: body.description,
        
        // AI-Generated Detailed Report
        detailedReport: detailedReport,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    })

    return NextResponse.json({
      ...report,
      detailedReportGenerated: !!detailedReport,
      detailedReportLength: detailedReport?.length || 0,
      aiGenerationStatus: detailedReport ? 'success' : 'failed'
    }, { status: 201 })
  } catch (error) {
    console.error("Error creating report:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

function calculateEquipmentNeeds(waterClass: string, affectedArea: number) {
  if (!affectedArea) return { airmovers: 0, dehumidification: 0 }

  let airmovers = 0
  let dehumidification = 0

  switch (waterClass) {
    case "Class 1":
      airmovers = Math.ceil(affectedArea / 60) // 1 per 50-70 sq ft
      dehumidification = Math.ceil(affectedArea / 100) * 20 // 20L per 100 sq ft
      break
    case "Class 2":
      airmovers = Math.ceil(affectedArea / 50) // 1 per 50 sq ft
      dehumidification = Math.ceil(affectedArea / 80) * 30 // 30L per 80 sq ft
      break
    case "Class 3":
      airmovers = Math.ceil(affectedArea / 40) // 1 per 40 sq ft
      dehumidification = Math.ceil(affectedArea / 60) * 40 // 40L per 60 sq ft
      break
    case "Class 4":
      airmovers = Math.ceil(affectedArea / 30) // 1 per 30 sq ft
      dehumidification = Math.ceil(affectedArea / 40) * 50 // 50L per 40 sq ft
      break
    default:
      airmovers = Math.ceil(affectedArea / 50)
      dehumidification = Math.ceil(affectedArea / 80) * 25
  }

  return { airmovers, dehumidification }
}
