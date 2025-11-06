import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateDetailedReport } from "@/lib/anthropic"
import { Prisma } from "@prisma/client"
import { createReportSchema, paginationSchema, handleValidationError } from "@/lib/validation"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const pageParam = searchParams.get("page")
    const limitParam = searchParams.get("limit")

    // Validate query parameters
    const queryValidation = paginationSchema.safeParse({
      page: pageParam,
      limit: limitParam,
      status: searchParams.get("status"),
    })

    if (!queryValidation.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: handleValidationError(queryValidation.error)
        },
        { status: 400 }
      )
    }

    // Only apply pagination if explicitly requested, otherwise fetch all (up to 10000)
    const shouldPaginate = pageParam !== null || limitParam !== null
    const page = queryValidation.data.page || 1
    const limit = queryValidation.data.limit || (shouldPaginate ? 10 : 10000)

    // Validate waterCategory and waterClass to prevent injection
    const status = searchParams.get("status")
    const waterCategory = searchParams.get("waterCategory")
    const waterClass = searchParams.get("waterClass")

    // Define allowed values for enum-like fields
    const allowedStatuses = ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']
    const allowedWaterCategories = ['Category 1', 'Category 2', 'Category 3']
    const allowedWaterClasses = ['Class 1', 'Class 2', 'Class 3', 'Class 4']

    const where: Prisma.ReportWhereInput = {
      userId: session.user.id
    }

    if (status && status !== "all" && allowedStatuses.includes(status)) {
      where.status = status as any
    }

    if (waterCategory && waterCategory !== "all" && allowedWaterCategories.includes(waterCategory)) {
      where.waterCategory = waterCategory
    }

    if (waterClass && waterClass !== "all" && allowedWaterClasses.includes(waterClass)) {
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

    // Validate input with Zod schema
    const validationResult = createReportSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: handleValidationError(validationResult.error)
        },
        { status: 400 }
      )
    }

    // Use validated data
    const validatedData = validationResult.data

    // Check and use credits directly
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

    // Generate report number if not provided
    const reportNumber = validatedData.reportNumber || `WD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

    // Calculate equipment needs based on IICRC S500 guidelines
    const equipmentNeeds = calculateEquipmentNeeds(validatedData.waterClass, validatedData.affectedArea || 0)

    // Process insurance data
    const insuranceData = validatedData.insuranceData || {}

    // Generate detailed report using AI
    let detailedReport = null
    try {
      console.log('Generating detailed report with AI...')

      detailedReport = await generateDetailedReport({
        basicInfo: {
          title: validatedData.title,
          clientName: validatedData.clientName,
          propertyAddress: validatedData.propertyAddress,
          dateOfLoss: body.dateOfLoss,
          waterCategory: validatedData.waterCategory,
          waterClass: validatedData.waterClass,
          hazardType: validatedData.hazardType,
          insuranceType: validatedData.insuranceType,
        },
        remediationData: validatedData.remediationData,
        dryingPlan: validatedData.dryingPlan,
        equipmentSizing: validatedData.equipmentSizing,
        monitoringData: validatedData.monitoringData,
        insuranceData: validatedData.insuranceData,
      })
      console.log('Detailed report generated successfully, length:', detailedReport?.length)
    } catch (aiError) {
      console.error('Error generating detailed report:', aiError)
      console.error('AI Error details:', {
        message: aiError instanceof Error ? aiError.message : 'Unknown error',
        stack: aiError instanceof Error ? aiError.stack : undefined
      })
      // Continue without detailed report - don't fail the entire process
    }
    
    // Find client by name to set clientId (for linking updated client info)
    let clientId = validatedData.clientId || null
    if (validatedData.clientName && !clientId) {
      const client = await prisma.client.findFirst({
        where: {
          name: validatedData.clientName,
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
        title: validatedData.title,
        clientName: validatedData.clientName,
        clientId: clientId,
        propertyAddress: validatedData.propertyAddress,
        hazardType: validatedData.hazardType || null,
        insuranceType: validatedData.insuranceType || null,
        status: 'COMPLETED', // Set status as COMPLETED when report is created
        reportNumber,
        userId: session.user.id,

        // IICRC Assessment fields
        inspectionDate: validatedData.inspectionDate ? new Date(validatedData.inspectionDate) : new Date(),
        waterCategory: validatedData.waterCategory,
        waterClass: validatedData.waterClass,
        sourceOfWater: validatedData.sourceOfWater || null,
        affectedArea: validatedData.affectedArea || null,
        safetyHazards: validatedData.safetyHazards || null,

        // Damage assessment fields
        structuralDamage: validatedData.structuralDamage || null,
        contentsDamage: validatedData.contentsDamage || null,
        hvacAffected: validatedData.hvacAffected || null,
        electricalHazards: validatedData.electricalHazards || null,
        microbialGrowth: validatedData.microbialGrowth || null,

        // Equipment and drying fields
        dehumidificationCapacity: equipmentNeeds.dehumidification,
        airmoversCount: equipmentNeeds.airmovers,
        targetHumidity: validatedData.dryingPlan?.targetHumidity || null,
        targetTemperature: validatedData.dryingPlan?.targetTemperature || null,
        estimatedDryingTime: validatedData.dryingPlan?.estimatedDryingTime || null,
        equipmentPlacement: validatedData.equipmentSizing?.equipmentPlacement || null,

        // Monitoring data (stored as JSON strings)
        psychrometricReadings: validatedData.monitoringData?.psychrometricReadings ? JSON.stringify(validatedData.monitoringData.psychrometricReadings) : null,
        moistureReadings: validatedData.monitoringData?.moistureReadings ? JSON.stringify(validatedData.monitoringData.moistureReadings) : null,

        // Remediation data (stored as JSON strings)
        safetyPlan: validatedData.remediationData?.safetyPlan || null,
        containmentSetup: validatedData.remediationData?.containmentSetup || null,
        decontaminationProcedures: validatedData.remediationData?.decontaminationProcedures || null,
        postRemediationVerification: validatedData.remediationData?.postRemediationVerification || null,

        // Insurance data (stored as JSON strings)
        propertyCover: insuranceData.propertyCover ? JSON.stringify(insuranceData.propertyCover) : null,
        contentsCover: insuranceData.contentsCover ? JSON.stringify(insuranceData.contentsCover) : null,
        liabilityCover: insuranceData.liabilityCover ? JSON.stringify(insuranceData.liabilityCover) : null,
        businessInterruption: insuranceData.businessInterruption ? JSON.stringify(insuranceData.businessInterruption) : null,
        additionalCover: insuranceData.additionalCover ? JSON.stringify(insuranceData.additionalCover) : null,

        // Optional fields
        completionDate: validatedData.completionDate ? new Date(validatedData.completionDate) : null,
        totalCost: validatedData.totalCost || null,
        description: validatedData.description || null,

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
