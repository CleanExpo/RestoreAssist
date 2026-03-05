import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSingleReportExcel, saveWorkbookAsBuffer } from '@/lib/excel-export'
import { uploadExcelToCloudinary } from '@/lib/cloudinary'
import { format } from 'date-fns'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Fetch report with all related data
    const report = await prisma.report.findFirst({
      where: {
        id: id,
        userId: session.user.id
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            businessName: true,
            businessAddress: true,
            businessABN: true,
            businessPhone: true,
            businessEmail: true
          }
        },
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
            company: true,
            address: true,
            contactPerson: true,
            status: true
          }
        }
      }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Parse query parameters for options
    const searchParams = request.nextUrl.searchParams
    const includeScope = searchParams.get('includeScope') === 'true'
    const includeEstimate = searchParams.get('includeEstimate') === 'true'
    const includePhotos = searchParams.get('includePhotos') === 'true'

    // Helper function to safely parse JSON
    const safeParse = (value: any) => {
      if (!value) return null
      if (typeof value === 'object') return value // Already parsed
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch {
          return value // Return as string if parsing fails
        }
      }
      return value
    }

    // Parse JSON fields back to objects
    const parsedReport = {
      ...report,
      psychrometricReadings: safeParse(report.psychrometricReadings),
      moistureReadings: safeParse(report.moistureReadings),
      propertyCover: safeParse(report.propertyCover),
      contentsCover: safeParse(report.contentsCover),
      liabilityCover: safeParse(report.liabilityCover),
      businessInterruption: safeParse(report.businessInterruption),
      additionalCover: safeParse(report.additionalCover),
      technicianReportAnalysis: safeParse(report.technicianReportAnalysis),
      tier1Responses: safeParse(report.tier1Responses),
      tier2Responses: safeParse(report.tier2Responses),
      tier3Responses: safeParse(report.tier3Responses),
      scopeOfWorksData: safeParse(report.scopeOfWorksData),
      costEstimationData: safeParse(report.costEstimationData),
      psychrometricAssessment: safeParse(report.psychrometricAssessment),
      scopeAreas: safeParse(report.scopeAreas),
      equipmentSelection: safeParse(report.equipmentSelection),
    }

    // Generate Excel workbook
    const workbook = await generateSingleReportExcel(parsedReport, {
      includeScope,
      includeEstimate,
      includePhotos
    })

    // Save as buffer
    const buffer = await saveWorkbookAsBuffer(workbook)

    // Generate filename
    const reportNumber = report.reportNumber || report.id
    const filename = `RestoreAssist_Report_${reportNumber}_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.xlsx`

    // Upload to Cloudinary and save URL to database
    try {
      const cloudinaryUrl = await uploadExcelToCloudinary(buffer, filename, 'excel-reports')
      
      // Update report with Excel URL
      await prisma.report.update({
        where: { id: report.id },
        data: { excelReportUrl: cloudinaryUrl }
      })

      console.log(`[Excel Export] ✅ Uploaded to Cloudinary and saved URL: ${cloudinaryUrl}`)
    } catch (cloudinaryError) {
      console.error('[Excel Export] ⚠️ Failed to upload to Cloudinary:', cloudinaryError)
      // Continue with file download even if Cloudinary upload fails
    }

    // Return file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error generating Excel export:', error)
    return NextResponse.json(
      { error: 'Failed to generate Excel report', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
