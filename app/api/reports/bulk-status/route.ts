import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  rateLimit,
  validateReportIds,
  validateBatchSize,
  isValidReportStatus,
  createAuditLogEntry,
  getUnauthorizedReportIds,
} from '@/lib/bulk-operations'
import { sendReportCompletedEmail } from '@/lib/email'

const APP_URL = process.env.NEXTAUTH_URL || "https://restoreassist.com.au"

interface BulkStatusUpdateRequest {
  ids: string[]
  status: string
  reason?: string
}

export async function PATCH(request: NextRequest) {
  try {
    // 1. Authenticate
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Rate limit check
    const rateLimitCheck = rateLimit(session.user.id, 'bulk-status-update')
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
    const { ids, status, reason }: BulkStatusUpdateRequest = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'ids must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!status || typeof status !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request', message: 'status must be a non-empty string' },
        { status: 400 }
      )
    }

    // 4. Validate status value
    if (!isValidReportStatus(status)) {
      return NextResponse.json(
        {
          error: 'Invalid status',
          message: 'status must be one of: DRAFT, PENDING, APPROVED, COMPLETED, ARCHIVED',
        },
        { status: 400 }
      )
    }

    // 5. Validate batch size
    const batchCheck = validateBatchSize(ids.length, 'status-update')
    if (!batchCheck.valid) {
      return NextResponse.json(
        { error: 'Batch size exceeded', message: batchCheck.message },
        { status: 400 }
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

    // 7. Update reports in transaction
    const errors: Array<{ reportId: string; error: string }> = []

    try {
      // Update all reports atomically
      const updateResult = await prisma.report.updateMany({
        where: {
          id: { in: ownedIds },
          userId: session.user.id, // Double-check user ownership
        },
        data: {
          status: status.toUpperCase() as any,
          lastEditedBy: session.user.id,
          lastEditedAt: new Date(),
        },
      })

      // 8. Create audit log entries
      const reportsUpdated = updateResult.count
      if (reportsUpdated > 0) {
        // Log in parallel but don't block response
        Promise.all(
          ownedIds.map(reportId =>
            createAuditLogEntry(session.user.id, reportId, 'status_update', {
              newStatus: status,
              reason,
              timestamp: new Date(),
            })
          )
        ).catch(error => {
          console.error('Error creating audit logs:', error)
        })

        // 8b. Send report completion email notifications to org admin
        if (status.toUpperCase() === 'COMPLETED') {
          notifyAdminOfCompletedReports(session.user.id, ownedIds).catch(error => {
            console.error('Error sending report completion emails:', error)
          })
        }
      }

      // 9. Return response
      return NextResponse.json(
        {
          success: true,
          updated: reportsUpdated,
          failed: unauthorizedIds.length + (ids.length - reportsUpdated - unauthorizedIds.length),
          message: `Successfully updated ${reportsUpdated} report(s) to ${status}`,
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
    } catch (updateError) {
      console.error('Error updating reports:', updateError)

      return NextResponse.json(
        {
          success: false,
          updated: 0,
          failed: ids.length,
          error: 'Status update failed',
          message: updateError instanceof Error ? updateError.message : 'Unknown error',
          details: 'An error occurred while updating report statuses. Please try again.',
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in bulk-status:', error)

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON', message: 'Failed to parse request body' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Request failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Notify organization admin when team members complete reports.
 * Skips notification if the user completing the report is the admin themselves.
 */
async function notifyAdminOfCompletedReports(userId: string, reportIds: string[]) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true, organizationId: true },
  })

  if (!user?.organizationId || user.role === 'ADMIN') return

  // Find the org admin
  const admin = await prisma.user.findFirst({
    where: { organizationId: user.organizationId, role: 'ADMIN' },
    select: { name: true, email: true },
  })

  if (!admin?.email) return

  // Fetch completed reports
  const reports = await prisma.report.findMany({
    where: { id: { in: reportIds } },
    select: { id: true, jobNumber: true, hazardType: true },
  })

  for (const report of reports) {
    await sendReportCompletedEmail({
      recipientEmail: admin.email,
      recipientName: admin.name || 'Admin',
      reportJobNumber: report.jobNumber || report.id.slice(0, 8),
      reportType: report.hazardType || 'Water Damage',
      completedByName: user.name || user.email,
      viewReportUrl: `${APP_URL}/dashboard/reports/${report.id}`,
    }).catch(err => {
      console.error(`Failed to send report completion email for ${report.id}:`, err)
    })
  }
}
