import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    // Fetch the report
    const report = await prisma.report.findFirst({
      where: {
        id: id,
        userId: session.user.id
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

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Fetch scope if exists - include ALL fields
    let scope = null
    try {
      const scopeData = await prisma.scope.findFirst({
        where: { reportId: id }
      })
      if (scopeData) {
        scope = {
          id: scopeData.id,
          reportId: scopeData.reportId,
          scopeType: scopeData.scopeType,
          siteVariables: scopeData.siteVariables ? JSON.parse(scopeData.siteVariables) : null,
          labourParameters: scopeData.labourParameters ? JSON.parse(scopeData.labourParameters) : null,
          equipmentParameters: scopeData.equipmentParameters ? JSON.parse(scopeData.equipmentParameters) : null,
          chemicalApplication: scopeData.chemicalApplication ? JSON.parse(scopeData.chemicalApplication) : null,
          timeCalculations: scopeData.timeCalculations ? JSON.parse(scopeData.timeCalculations) : null,
          labourCostTotal: scopeData.labourCostTotal,
          equipmentCostTotal: scopeData.equipmentCostTotal,
          chemicalCostTotal: scopeData.chemicalCostTotal,
          totalDuration: scopeData.totalDuration,
          complianceNotes: scopeData.complianceNotes,
          assumptions: scopeData.assumptions,
          createdAt: scopeData.createdAt,
          updatedAt: scopeData.updatedAt,
          createdBy: scopeData.createdBy,
          updatedBy: scopeData.updatedBy,
          userId: scopeData.userId
        }
      }
    } catch (err) {
      console.log("No scope found")
    }

    // Fetch estimate if exists - include ALL fields including lineItems
    let estimate = null
    try {
      const estimateData = await prisma.estimate.findFirst({
        where: { reportId: id },
        orderBy: { createdAt: "desc" },
        include: {
          lineItems: {
            orderBy: { displayOrder: 'asc' }
          }
        }
      })
      if (estimateData) {
        estimate = {
          id: estimateData.id,
          reportId: estimateData.reportId,
          scopeId: estimateData.scopeId,
          status: estimateData.status,
          version: estimateData.version,
          rateTables: estimateData.rateTables ? JSON.parse(estimateData.rateTables) : null,
          commercialParams: estimateData.commercialParams ? JSON.parse(estimateData.commercialParams) : null,
          lineItems: estimateData.lineItems.map(item => ({
            id: item.id,
            estimateId: item.estimateId,
            code: item.code,
            category: item.category,
            description: item.description,
            qty: item.qty,
            unit: item.unit,
            rate: item.rate,
            formula: item.formula,
            subtotal: item.subtotal,
            isScopeLinked: item.isScopeLinked,
            isEstimatorAdded: item.isEstimatorAdded,
            displayOrder: item.displayOrder,
            createdBy: item.createdBy,
            modifiedBy: item.modifiedBy,
            modifiedAt: item.modifiedAt,
            changeReason: item.changeReason,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          })),
          labourSubtotal: estimateData.labourSubtotal,
          equipmentSubtotal: estimateData.equipmentSubtotal,
          chemicalsSubtotal: estimateData.chemicalsSubtotal,
          subcontractorSubtotal: estimateData.subcontractorSubtotal,
          travelSubtotal: estimateData.travelSubtotal,
          wasteSubtotal: estimateData.wasteSubtotal,
          overheads: estimateData.overheads,
          profit: estimateData.profit,
          contingency: estimateData.contingency,
          escalation: estimateData.escalation,
          subtotalExGST: estimateData.subtotalExGST,
          gst: estimateData.gst,
          totalIncGST: estimateData.totalIncGST,
          assumptions: estimateData.assumptions,
          inclusions: estimateData.inclusions,
          exclusions: estimateData.exclusions,
          allowances: estimateData.allowances,
          complianceStatement: estimateData.complianceStatement,
          disclaimer: estimateData.disclaimer,
          approverName: estimateData.approverName,
          approverRole: estimateData.approverRole,
          approverSignature: estimateData.approverSignature,
          approvedAt: estimateData.approvedAt,
          estimatedDuration: estimateData.estimatedDuration,
          createdAt: estimateData.createdAt,
          updatedAt: estimateData.updatedAt,
          createdBy: estimateData.createdBy,
          updatedBy: estimateData.updatedBy,
          userId: estimateData.userId
        }
      }
    } catch (err) {
      console.log("No estimate found")
    }

    // Parse JSON fields - include ALL report fields
    const parsedReport = {
      // All basic report fields
      id: report.id,
      title: report.title,
      description: report.description,
      status: report.status,
      clientName: report.clientName,
      propertyAddress: report.propertyAddress,
      hazardType: report.hazardType,
      insuranceType: report.insuranceType,
      totalCost: report.totalCost,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      userId: report.userId,
      clientId: report.clientId,
      
      // IICRC S500 Compliance Fields
      reportNumber: report.reportNumber,
      inspectionDate: report.inspectionDate,
      waterCategory: report.waterCategory,
      waterClass: report.waterClass,
      sourceOfWater: report.sourceOfWater,
      affectedArea: report.affectedArea,
      safetyHazards: report.safetyHazards,
      equipmentUsed: report.equipmentUsed,
      dryingPlan: report.dryingPlan,
      completionDate: report.completionDate,
      
      // Detailed Assessment Fields
      structuralDamage: report.structuralDamage,
      contentsDamage: report.contentsDamage,
      hvacAffected: report.hvacAffected,
      electricalHazards: report.electricalHazards,
      microbialGrowth: report.microbialGrowth,
      
      // Drying Plan Details
      dehumidificationCapacity: report.dehumidificationCapacity,
      airmoversCount: report.airmoversCount,
      targetHumidity: report.targetHumidity,
      targetTemperature: report.targetTemperature,
      estimatedDryingTime: report.estimatedDryingTime,
      
      // Monitoring Data (parsed from JSON)
      psychrometricReadings: report.psychrometricReadings ? JSON.parse(report.psychrometricReadings) : null,
      moistureReadings: report.moistureReadings ? JSON.parse(report.moistureReadings) : null,
      equipmentPlacement: report.equipmentPlacement,
      
      // Compliance Documentation
      safetyPlan: report.safetyPlan,
      containmentSetup: report.containmentSetup,
      decontaminationProcedures: report.decontaminationProcedures,
      postRemediationVerification: report.postRemediationVerification,
      
      // Insurance Information (parsed from JSON)
      propertyCover: report.propertyCover ? JSON.parse(report.propertyCover) : null,
      contentsCover: report.contentsCover ? JSON.parse(report.contentsCover) : null,
      liabilityCover: report.liabilityCover ? JSON.parse(report.liabilityCover) : null,
      businessInterruption: report.businessInterruption ? JSON.parse(report.businessInterruption) : null,
      additionalCover: report.additionalCover ? JSON.parse(report.additionalCover) : null,
      
      // AI-Generated Detailed Report
      detailedReport: report.detailedReport,
      
      // Relations
      user: report.user,
      client: report.client,
      scope: scope,
      estimate: estimate
    }

    // Convert to JSON string
    const jsonString = JSON.stringify(parsedReport, null, 2)
    const jsonBuffer = Buffer.from(jsonString, 'utf-8')

    // Return JSON as downloadable file
    return new NextResponse(jsonBuffer, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="report-${report.reportNumber || report.id}.json"`,
        'Content-Length': jsonBuffer.length.toString(),
      },
    })

  } catch (error) {
    console.error("Error generating JSON:", error)
    return NextResponse.json(
      { error: "Failed to generate JSON" },
      { status: 500 }
    )
  }
}

