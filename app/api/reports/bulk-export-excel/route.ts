import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateExcelWorkbook, saveWorkbookAsBuffer } from '@/lib/excel-export'
import {
  rateLimit,
  validateReportIds,
  validateBatchSize,
  formatBulkResponse,
} from '@/lib/bulk-operations'
import { format } from 'date-fns'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Rate limit check
    const rateLimitCheck = rateLimit(session.user.id, 'bulk-export-excel')
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
    const { ids, options } = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'ids must be a non-empty array' },
        { status: 400 }
      )
    }

    // 4. Validate batch size
    const batchCheck = validateBatchSize(ids.length, 'export-excel')
    if (!batchCheck.valid) {
      return NextResponse.json(
        { error: 'Batch size exceeded', message: batchCheck.message },
        { status: 400 }
      )
    }

    // 5. Validate user owns all reports
    const ownedIds = await validateReportIds(ids, session.user.id)
    if (ownedIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid reports found', message: 'You do not own any of the specified reports' },
        { status: 403 }
      )
    }

    if (ownedIds.length < ids.length) {
      console.warn(
        `User ${session.user.id} attempted to export ${ids.length} reports but only owns ${ownedIds.length}`
      )
    }

    // 6. Fetch report data
    const reports = await prisma.report.findMany({
      where: {
        id: { in: ownedIds },
      },
      select: {
        id: true,
        reportNumber: true,
        clientName: true,
        propertyAddress: true,
        title: true,
        description: true,
        status: true,
        hazardType: true,
        waterCategory: true,
        waterClass: true,
        totalCost: true,
        affectedArea: true,
        inspectionDate: true,
        createdAt: true,
        updatedAt: true,
        scopeOfWorksData: options?.includeScope ? true : false,
        costEstimationData: options?.includeEstimate ? true : false,
      },
    })

    if (reports.length === 0) {
      return NextResponse.json(
        { error: 'No reports found', message: 'Unable to retrieve report data' },
        { status: 404 }
      )
    }

    // 7. Generate Excel workbook
    const workbook = await generateExcelWorkbook(reports, options)

    // 8. Save as buffer
    const buffer = await saveWorkbookAsBuffer(workbook)

    // 9. Return file
    const filename = `RestoreAssist_Export_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in bulk-export-excel:', error)

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON', message: 'Failed to parse request body' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Export failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
