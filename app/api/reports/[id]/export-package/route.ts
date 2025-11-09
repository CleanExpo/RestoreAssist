import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// GET - Export complete document package (PDF, Word, JSON)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'pdf' // pdf, word, json, zip

    // Get the complete report
    const report = await prisma.report.findUnique({
      where: { id, userId: user.id }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Parse all data
    const inspectionReport = report.detailedReport || ''
    const scopeOfWorks = report.scopeOfWorksDocument || ''
    const costEstimation = report.costEstimationDocument || ''

    if (!inspectionReport && !scopeOfWorks && !costEstimation) {
      return NextResponse.json(
        { error: 'No documents available to export. Please generate reports first.' },
        { status: 400 }
      )
    }

    // Build version history
    const versionHistory = report.versionHistory 
      ? JSON.parse(report.versionHistory) 
      : [{ version: 1, date: report.createdAt, action: 'Initial creation' }]

    // Build raw data export
    const rawDataExport = {
      reportId: report.id,
      claimReference: report.claimReferenceNumber || report.reportNumber,
      generatedAt: new Date().toISOString(),
      version: report.reportVersion || 1,
      initialData: {
        clientName: report.clientName,
        propertyAddress: report.propertyAddress,
        propertyPostcode: report.propertyPostcode,
        claimReferenceNumber: report.claimReferenceNumber,
        incidentDate: report.incidentDate,
        technicianAttendanceDate: report.technicianAttendanceDate,
        technicianName: report.technicianName,
        technicianFieldReport: report.technicianFieldReport
      },
      analysis: report.technicianReportAnalysis ? JSON.parse(report.technicianReportAnalysis) : null,
      tier1Responses: report.tier1Responses ? JSON.parse(report.tier1Responses) : null,
      tier2Responses: report.tier2Responses ? JSON.parse(report.tier2Responses) : null,
      tier3Responses: report.tier3Responses ? JSON.parse(report.tier3Responses) : null,
      scopeData: report.scopeOfWorksData ? JSON.parse(report.scopeOfWorksData) : null,
      costData: report.costEstimationData ? JSON.parse(report.costEstimationData) : null,
      versionHistory
    }

    if (format === 'json') {
      return NextResponse.json(rawDataExport, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="RestoreAssist-Export-${report.id}.json"`
        }
      })
    }

    if (format === 'zip') {
      // For ZIP format, return JSON with download instructions
      // In production, you would use a library like jszip or archiver
      // For now, we'll return a combined PDF with all documents
      const pdfDoc = await PDFDocument.create()
      
      if (inspectionReport) {
        await addDocumentToPDF(pdfDoc, 'Professional Inspection Report', inspectionReport, report)
      }
      if (scopeOfWorks) {
        await addDocumentToPDF(pdfDoc, 'Scope of Works', scopeOfWorks, report)
      }
      if (costEstimation) {
        await addDocumentToPDF(pdfDoc, 'Cost Estimation', costEstimation, report)
      }
      await addVersionHistoryToPDF(pdfDoc, versionHistory, report)

      const pdfBytes = await pdfDoc.save()

      return new NextResponse(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="RestoreAssist-Complete-Package-${report.id}.pdf"`
        }
      })
    }

    // Single PDF format (default)
    const pdfDoc = await PDFDocument.create()
    
    // Add all three documents to one PDF
    if (inspectionReport) {
      await addDocumentToPDF(pdfDoc, 'Professional Inspection Report', inspectionReport, report)
    }
    if (scopeOfWorks) {
      await addDocumentToPDF(pdfDoc, 'Scope of Works', scopeOfWorks, report)
    }
    if (costEstimation) {
      await addDocumentToPDF(pdfDoc, 'Cost Estimation', costEstimation, report)
    }

    // Add version history page
    await addVersionHistoryToPDF(pdfDoc, versionHistory, report)

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="RestoreAssist-Complete-Package-${report.id}.pdf"`
      }
    })
  } catch (error) {
    console.error('Error exporting package:', error)
    return NextResponse.json(
      { error: 'Failed to export document package' },
      { status: 500 }
    )
  }
}

async function generatePDFDocument(title: string, content: string, report: any): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  
  const headerColor = rgb(0.0, 0.63, 0.8) // Cyan
  const watermarkColor = rgb(0.9, 0.9, 0.9) // Light gray
  let yPosition = height - 60

  // Add watermark
  page.drawText('PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE', {
    x: 50,
    y: height - 30,
    size: 12,
    font: boldFont,
    color: watermarkColor,
    opacity: 0.3,
    rotate: { angleRadians: -0.785 } // 45 degrees
  })

  // Add title
  page.drawText(title, {
    x: 50,
    y: yPosition,
    size: 18,
    font: boldFont,
    color: headerColor
  })
  yPosition -= 30

  // Add metadata
  page.drawText(`Claim Reference: ${report.claimReferenceNumber || report.reportNumber || 'N/A'}`, {
    x: 50,
    y: yPosition,
    size: 10,
    font: font
  })
  yPosition -= 20

  page.drawText(`Date Generated: ${new Date().toLocaleString('en-AU')}`, {
    x: 50,
    y: yPosition,
    size: 10,
    font: font
  })
  yPosition -= 20

  page.drawText(`Version: ${report.reportVersion || 1}`, {
    x: 50,
    y: yPosition,
    size: 10,
    font: font
  })
  yPosition -= 40

  // Add content (simplified - would need proper text wrapping in production)
  const lines = content.split('\n')
  for (const line of lines) {
    if (yPosition < 50) {
      const newPage = pdfDoc.addPage([595.28, 841.89])
      yPosition = height - 50
    }

    if (line.startsWith('##')) {
      page.drawText(line.replace('##', '').trim(), {
        x: 50,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: headerColor
      })
      yPosition -= 20
    } else if (line.trim()) {
      page.drawText(line.substring(0, 80), {
        x: 50,
        y: yPosition,
        size: 10,
        font: font
      })
      yPosition -= 15
    } else {
      yPosition -= 10
    }
  }

  return await pdfDoc.save()
}

async function addDocumentToPDF(pdfDoc: PDFDocument, title: string, content: string, report: any) {
  let page = pdfDoc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const headerColor = rgb(0.0, 0.63, 0.8)
  const watermarkColor = rgb(0.9, 0.9, 0.9)
  let yPosition = height - 60

  // Add watermark
  page.drawText('PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE', {
    x: 50,
    y: height - 30,
    size: 12,
    font: boldFont,
    color: watermarkColor,
    opacity: 0.3,
    rotate: { angleRadians: -0.785 }
  })

  // Add title
  page.drawText(title, {
    x: 50,
    y: yPosition,
    size: 18,
    font: boldFont,
    color: headerColor
  })
  yPosition -= 30

  // Add content (simplified)
  const lines = content.split('\n')
  for (const line of lines) {
    if (yPosition < 50) {
      page = pdfDoc.addPage([595.28, 841.89])
      yPosition = height - 50
    }
    if (line.startsWith('##')) {
      page.drawText(line.replace('##', '').trim(), {
        x: 50,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: headerColor
      })
      yPosition -= 20
    } else if (line.trim()) {
      const text = line.substring(0, 80)
      page.drawText(text, {
        x: 50,
        y: yPosition,
        size: 10,
        font: font
      })
      yPosition -= 15
    } else {
      yPosition -= 10
    }
  }
}

async function addVersionHistoryToPDF(pdfDoc: PDFDocument, versionHistory: any[], report: any) {
  const page = pdfDoc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const headerColor = rgb(0.0, 0.63, 0.8)
  let yPosition = height - 60

  page.drawText('Version History', {
    x: 50,
    y: yPosition,
    size: 18,
    font: boldFont,
    color: headerColor
  })
  yPosition -= 30

  versionHistory.forEach((entry: any) => {
    if (yPosition < 50) return
    page.drawText(`Version ${entry.version}: ${entry.action}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont
    })
    yPosition -= 20
    page.drawText(`Date: ${new Date(entry.date).toLocaleString('en-AU')}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: font
    })
    yPosition -= 20
    if (entry.changedBy) {
      page.drawText(`Changed by: ${entry.changedBy}`, {
        x: 50,
        y: yPosition,
        size: 10,
        font: font
      })
      yPosition -= 20
    }
    yPosition -= 10
  })
}

