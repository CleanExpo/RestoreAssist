import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canCreateBulkReports } from '@/lib/report-limits'
import {
  rateLimit,
  validateReportIds,
  validateBatchSize,
  deductBulkCredits,
  formatBulkResponse,
  getUnauthorizedReportIds,
} from '@/lib/bulk-operations'

interface BulkDuplicateRequest {
  ids: string[]
  options?: {
    inspectionDate?: string
    status?: string
    appendText?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Rate limit check
    const rateLimitCheck = rateLimit(session.user.id, 'bulk-duplicate')
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitCheck.retryAfter,
          message: `You can perform 10 bulk operations per hour. Please try again in ${rateLimitCheck.retryAfter} seconds.`,
        },
        { status: 429 }
      )
    }

    // 3. Parse request
    const { ids, options }: BulkDuplicateRequest = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'ids must be a non-empty array' },
        { status: 400 }
      )
    }

    // 4. Validate batch size
    const batchCheck = validateBatchSize(ids.length, 'duplicate')
    if (!batchCheck.valid) {
      return NextResponse.json(
        { error: 'Batch size exceeded', message: batchCheck.message },
        { status: 400 }
      )
    }

    // 5. Check credits/permissions
    const bulkCheckResult = await canCreateBulkReports(session.user.id, ids.length)
    if (!bulkCheckResult.allowed) {
      return NextResponse.json(
        {
          error: 'Insufficient permissions',
          message: bulkCheckResult.reason,
          upgradeRequired: true,
        },
        { status: 403 }
      )
    }

    // 6. Validate user owns all reports
    const ownedIds = await validateReportIds(ids, session.user.id)
    const unauthorizedIds = await getUnauthorizedReportIds(ids, session.user.id)

    if (ownedIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid reports found', message: 'You do not own any of the specified reports' },
        { status: 403 }
      )
    }

    // 7. Fetch reports to duplicate
    const reportsToClone = await prisma.report.findMany({
      where: {
        id: { in: ownedIds },
      },
    })

    if (reportsToClone.length === 0) {
      return NextResponse.json(
        { error: 'No reports found', message: 'Unable to retrieve report data' },
        { status: 404 }
      )
    }

    // 8. Prepare duplication data
    const appendText = options?.appendText || '(Copy)'
    const newStatus = options?.status || undefined
    const newInspectionDate = options?.inspectionDate ? new Date(options.inspectionDate) : undefined

    const errors: Array<{ reportId: string; error: string }> = []
    const newReportIds: string[] = []

    // 9. Execute duplications in transaction
    try {
      const createdReports = await prisma.$transaction(
        reportsToClone.map(report =>
          prisma.report.create({
            data: {
              // Copy all fields from original
              title: report.title,
              description: report.description,
              clientName: report.clientName,
              propertyAddress: report.propertyAddress,
              hazardType: report.hazardType,
              insuranceType: report.insuranceType,
              totalCost: report.totalCost,
              clientContactDetails: report.clientContactDetails,
              propertyPostcode: report.propertyPostcode,
              claimReferenceNumber: report.claimReferenceNumber,
              incidentDate: report.incidentDate,
              technicianAttendanceDate: report.technicianAttendanceDate,
              technicianName: report.technicianName,
              technicianFieldReport: report.technicianFieldReport,
              propertyId: report.propertyId,
              jobNumber: report.jobNumber,
              reportInstructions: report.reportInstructions,
              builderDeveloperCompanyName: report.builderDeveloperCompanyName,
              builderDeveloperContact: report.builderDeveloperContact,
              builderDeveloperAddress: report.builderDeveloperAddress,
              builderDeveloperPhone: report.builderDeveloperPhone,
              ownerManagementContactName: report.ownerManagementContactName,
              ownerManagementPhone: report.ownerManagementPhone,
              ownerManagementEmail: report.ownerManagementEmail,
              lastInspectionDate: report.lastInspectionDate,
              buildingChangedSinceLastInspection: report.buildingChangedSinceLastInspection,
              structureChangesSinceLastInspection: report.structureChangesSinceLastInspection,
              previousLeakage: report.previousLeakage,
              emergencyRepairPerformed: report.emergencyRepairPerformed,
              reportDepthLevel: report.reportDepthLevel,
              reportVersion: report.reportVersion,
              technicianReportAnalysis: report.technicianReportAnalysis,
              tier1Responses: report.tier1Responses,
              tier2Responses: report.tier2Responses,
              tier3Responses: report.tier3Responses,
              scopeOfWorksDocument: report.scopeOfWorksDocument,
              scopeOfWorksData: report.scopeOfWorksData,
              costEstimationDocument: report.costEstimationDocument,
              costEstimationData: report.costEstimationData,
              versionHistory: report.versionHistory,
              geographicIntelligence: report.geographicIntelligence,
              validationWarnings: report.validationWarnings,
              validationErrors: report.validationErrors,
              waterCategory: report.waterCategory,
              waterClass: report.waterClass,
              sourceOfWater: report.sourceOfWater,
              affectedArea: report.affectedArea,
              safetyHazards: report.safetyHazards,
              equipmentUsed: report.equipmentUsed,
              dryingPlan: report.dryingPlan,
              buildingAge: report.buildingAge,
              structureType: report.structureType,
              accessNotes: report.accessNotes,
              methamphetamineScreen: report.methamphetamineScreen,
              methamphetamineTestCount: report.methamphetamineTestCount,
              biologicalMouldDetected: report.biologicalMouldDetected,
              biologicalMouldCategory: report.biologicalMouldCategory,
              insurerName: report.insurerName,
              structuralDamage: report.structuralDamage,
              contentsDamage: report.contentsDamage,
              hvacAffected: report.hvacAffected,
              electricalHazards: report.electricalHazards,
              microbialGrowth: report.microbialGrowth,
              dehumidificationCapacity: report.dehumidificationCapacity,
              airmoversCount: report.airmoversCount,
              targetHumidity: report.targetHumidity,

              // Set new values
              status: newStatus ? (newStatus.toUpperCase() as any) : report.status,
              inspectionDate: newInspectionDate || report.inspectionDate,
              reportNumber: `${report.reportNumber || 'WD'} ${appendText}`,
              userId: session.user.id,
              clientId: report.clientId,
            },
          })
        )
      )

      // 10. Add created report IDs to response
      createdReports.forEach(report => {
        newReportIds.push(report.id)
      })

      // 11. Deduct credits if trial user
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { subscriptionStatus: true, creditsRemaining: true },
      })

      let creditsRemaining = user?.creditsRemaining || 0
      let creditsUsed = 0

      if (user?.subscriptionStatus === 'TRIAL') {
        const creditResult = await deductBulkCredits(session.user.id, ids.length, 'bulk-duplicate')
        creditsRemaining = creditResult.creditsRemaining
        creditsUsed = ids.length
      }

      // 12. Return success response
      return NextResponse.json(
        {
          success: true,
          duplicated: createdReports.length,
          failed: unauthorizedIds.length + (reportsToClone.length - createdReports.length),
          creditsUsed,
          creditsRemaining,
          newReportIds,
          warnings:
            unauthorizedIds.length > 0
              ? [
                  {
                    type: 'unauthorized',
                    count: unauthorizedIds.length,
                    message: `You do not own ${unauthorizedIds.length} of the requested reports`,
                  },
                ]
              : [],
        },
        { status: 200 }
      )
    } catch (transactionError) {
      console.error('Transaction error during bulk duplicate:', transactionError)

      return NextResponse.json(
        {
          success: false,
          duplicated: 0,
          failed: ids.length,
          error: 'Bulk duplication failed',
          message: transactionError instanceof Error ? transactionError.message : 'Unknown error',
          details:
            'An error occurred while duplicating reports. No reports were created. Please try again.',
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in bulk-duplicate:', error)

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON', message: 'Failed to parse request body' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Duplication failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
