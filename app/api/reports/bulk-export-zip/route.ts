import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createZipArchive } from '@/lib/zip-archive'
import {
  rateLimit,
  validateReportIds,
  validateBatchSize,
} from '@/lib/bulk-operations'
import { format } from 'date-fns'

// Helper: Generate PDF for a report by calling the internal download endpoint
async function generateReportPDF(reportId: string): Promise<Buffer | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Call the existing PDF generation endpoint internally
    const response = await fetch(`${baseUrl}/api/reports/${reportId}/download?type=summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error(`Failed to generate PDF for report ${reportId}: ${response.status}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.error(`Error generating PDF for report ${reportId}:`, error)
    return null
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
    const rateLimitCheck = rateLimit(session.user.id, 'bulk-export-zip')
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
    const { ids, pdfType } = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'ids must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!pdfType || !['basic', 'enhanced', 'forensic', 'inspection'].includes(pdfType)) {
      return NextResponse.json(
        {
          error: 'Invalid PDF type',
          message: 'pdfType must be one of: basic, enhanced, forensic, inspection',
        },
        { status: 400 }
      )
    }

    // 4. Validate batch size (max 25 for ZIP due to Vercel timeout)
    const batchCheck = validateBatchSize(ids.length, 'export-zip')
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

    // 6. Fetch report metadata
    const reports = await prisma.report.findMany({
      where: {
        id: { in: ownedIds },
      },
      select: {
        id: true,
        reportNumber: true,
        clientName: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (reports.length === 0) {
      return NextResponse.json(
        { error: 'No reports found', message: 'Unable to retrieve report data' },
        { status: 404 }
      )
    }

    // 7. Generate PDFs (in batches to avoid timeouts)
    const pdfBuffers: Array<{
      reportNumber: string
      clientName: string
      buffer: Buffer
      pdfType: string
    }> = []
    const batchSize = 5
    const errors: string[] = []

    for (let i = 0; i < reports.length; i += batchSize) {
      const batch = reports.slice(i, i + batchSize)

      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async report => {
          try {
            // Generate PDF using the internal download endpoint
            const pdfBuffer = await generateReportPDF(report.id)

            if (!pdfBuffer) {
              errors.push(`Failed to generate PDF for report ${report.reportNumber}`)
              return null
            }

            return {
              reportNumber: report.reportNumber || 'Unknown',
              clientName: report.clientName,
              buffer: pdfBuffer,
              pdfType,
            }
          } catch (error) {
            errors.push(
              `Error processing report ${report.reportNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
            return null
          }
        })
      )

      // Collect successful results
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          pdfBuffers.push(result.value)
        }
      })
    }

    if (pdfBuffers.length === 0) {
      return NextResponse.json(
        {
          error: 'PDF generation failed',
          message: 'Unable to generate PDFs for any reports',
          details: errors,
        },
        { status: 500 }
      )
    }

    // 8. Create ZIP archive
    const zipBuffer = await createZipArchive(pdfBuffers, reports)

    // 9. Return ZIP file
    const filename = `RestoreAssist_PDFs_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.zip`

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error in bulk-export-zip:', error)

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
