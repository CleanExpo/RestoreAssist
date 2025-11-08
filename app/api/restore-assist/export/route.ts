import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  exportInspectionReportToPDF,
  exportScopeOfWorkToPDF,
  exportEstimationToPDF,
  exportCompletePackageToPDF,
} from '@/lib/exportPDF'
import {
  exportInspectionReportToDOCX,
  exportScopeOfWorkToDOCX,
  exportEstimationToDOCX,
  exportCompletePackageToDOCX,
} from '@/lib/exportDOCX'

// POST: Export inspection + scope + estimation
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    const body = await req.json()
    const {
      inspectionId,
      format = 'json',
      includeScope = false,
      includeEstimation = false,
      estimateId
    } = body

    if (!inspectionId) {
      return NextResponse.json(
        { success: false, error: 'Inspection ID is required' },
        { status: 400 }
      )
    }

    if (!['json', 'pdf', 'docx'].includes(format)) {
      return NextResponse.json(
        { success: false, error: 'Invalid format. Supported: json, pdf, docx' },
        { status: 400 }
      )
    }

    // Fetch complete data
    const report = await prisma.report.findFirst({
      where: {
        id: inspectionId,
        userId
      },
      include: {
        client: true,
        scope: true,
        estimates: {
          include: {
            lineItems: {
              orderBy: { displayOrder: 'asc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Report not found or access denied' },
        { status: 404 }
      )
    }

    let scope = report.scope
    let estimate = null

    if (includeScope && !scope) {
      return NextResponse.json(
        { success: false, error: 'Scope not found for this report' },
        { status: 404 }
      )
    }

    if (includeEstimation) {
      if (estimateId) {
        estimate = report.estimates.find(e => e.id === estimateId)
        if (!estimate) {
          return NextResponse.json(
            { success: false, error: 'Estimate not found' },
            { status: 404 }
          )
        }
      } else {
        estimate = report.estimates[0] || null
        if (!estimate) {
          return NextResponse.json(
            { success: false, error: 'No estimate found for this report' },
            { status: 404 }
          )
        }
      }
    }

    // Generate export based on format
    let buffer: Buffer | null = null
    let contentType: string
    let filename: string
    const claimRef = report.reportNumber || report.id.substring(0, 8)

    if (format === 'pdf') {
      if (includeScope && includeEstimation && scope && estimate) {
        buffer = await exportCompletePackageToPDF(report, scope, estimate)
        filename = `RestoreAssist_${claimRef}_Complete.pdf`
      } else if (includeEstimation && estimate) {
        buffer = await exportEstimationToPDF(report, estimate)
        filename = `RestoreAssist_${claimRef}_Estimation.pdf`
      } else if (includeScope && scope) {
        buffer = await exportScopeOfWorkToPDF(report, scope)
        filename = `RestoreAssist_${claimRef}_Scope.pdf`
      } else {
        buffer = await exportInspectionReportToPDF(report)
        filename = `RestoreAssist_${claimRef}_Inspection.pdf`
      }
      contentType = 'application/pdf'
    } else if (format === 'docx') {
      if (includeScope && includeEstimation && scope && estimate) {
        buffer = await exportCompletePackageToDOCX(report, scope, estimate)
        filename = `RestoreAssist_${claimRef}_Complete.docx`
      } else if (includeEstimation && estimate) {
        buffer = await exportEstimationToDOCX(report, estimate)
        filename = `RestoreAssist_${claimRef}_Estimation.docx`
      } else if (includeScope && scope) {
        buffer = await exportScopeOfWorkToDOCX(report, scope)
        filename = `RestoreAssist_${claimRef}_Scope.docx`
      } else {
        buffer = await exportInspectionReportToDOCX(report)
        filename = `RestoreAssist_${claimRef}_Inspection.docx`
      }
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } else if (format === 'json') {
      const exportData = {
        report: {
          id: report.id,
          reportNumber: report.reportNumber,
          title: report.title,
          clientName: report.clientName,
          propertyAddress: report.propertyAddress,
          inspectionDate: report.inspectionDate,
          hazardType: report.hazardType,
          insuranceType: report.insuranceType,
          description: report.description,
          detailedReport: report.detailedReport,
          status: report.status,
          waterCategory: report.waterCategory,
          waterClass: report.waterClass,
          sourceOfWater: report.sourceOfWater,
          affectedArea: report.affectedArea,
          structuralDamage: report.structuralDamage,
          contentsDamage: report.contentsDamage,
          hvacAffected: report.hvacAffected,
          safetyHazards: report.safetyHazards,
          electricalHazards: report.electricalHazards,
          microbialGrowth: report.microbialGrowth
        },
        client: report.client ? {
          name: report.client.name,
          email: report.client.email,
          phone: report.client.phone,
          address: report.client.address,
          company: report.client.company
        } : null,
        scope: includeScope && scope ? {
          id: scope.id,
          scopeType: scope.scopeType,
          siteVariables: scope.siteVariables ? JSON.parse(scope.siteVariables) : null,
          labourParameters: scope.labourParameters ? JSON.parse(scope.labourParameters) : null,
          equipmentParameters: scope.equipmentParameters ? JSON.parse(scope.equipmentParameters) : null,
          chemicalApplication: scope.chemicalApplication ? JSON.parse(scope.chemicalApplication) : null,
          timeCalculations: scope.timeCalculations ? JSON.parse(scope.timeCalculations) : null,
          labourCostTotal: scope.labourCostTotal,
          equipmentCostTotal: scope.equipmentCostTotal,
          chemicalCostTotal: scope.chemicalCostTotal,
          totalDuration: scope.totalDuration,
          complianceNotes: scope.complianceNotes,
          assumptions: scope.assumptions
        } : null,
        estimate: includeEstimation && estimate ? {
          id: estimate.id,
          status: estimate.status,
          version: estimate.version,
          lineItems: estimate.lineItems,
          totals: {
            labourSubtotal: estimate.labourSubtotal,
            equipmentSubtotal: estimate.equipmentSubtotal,
            chemicalsSubtotal: estimate.chemicalsSubtotal,
            subcontractorSubtotal: estimate.subcontractorSubtotal,
            travelSubtotal: estimate.travelSubtotal,
            wasteSubtotal: estimate.wasteSubtotal,
            overheads: estimate.overheads,
            profit: estimate.profit,
            contingency: estimate.contingency,
            escalation: estimate.escalation,
            subtotalExGST: estimate.subtotalExGST,
            gst: estimate.gst,
            totalIncGST: estimate.totalIncGST
          },
          assumptions: estimate.assumptions,
          inclusions: estimate.inclusions,
          exclusions: estimate.exclusions,
          allowances: estimate.allowances,
          complianceStatement: estimate.complianceStatement,
          disclaimer: estimate.disclaimer
        } : null,
        exportedAt: new Date().toISOString(),
        exportedBy: userId
      }

      // Create audit log for JSON export
      await prisma.auditLog.create({
        data: {
          reportId: inspectionId,
          userId: userId,
          action: 'EXPORTED',
          changes: JSON.stringify({ format, includeScope, includeEstimation })
        }
      }).catch(err => console.error('Failed to create audit log:', err))

      return NextResponse.json({
        success: true,
        data: exportData
      })
    }

    // Create audit log for PDF/DOCX export
    await prisma.auditLog.create({
      data: {
        reportId: inspectionId,
        userId: userId,
        action: 'EXPORTED',
        changes: JSON.stringify({ format, includeScope, includeEstimation, filename })
      }
    }).catch(err => console.error('Failed to create audit log:', err))

    // Return file as download
    if (buffer) {
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length.toString(),
        }
      })
    }

    return NextResponse.json(
      { success: false, error: 'Failed to generate export' },
      { status: 500 }
    )
  } catch (error) {
    console.error('Error exporting data:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to export data' },
      { status: 500 }
    )
  }
}
