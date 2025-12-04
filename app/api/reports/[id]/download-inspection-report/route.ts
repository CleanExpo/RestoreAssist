import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// GET - Download inspection report as PDF
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

    // Get the report
    const report = await prisma.report.findUnique({
      where: { id, userId: user.id }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const inspectionReport = report.detailedReport || ''

    if (!inspectionReport) {
      return NextResponse.json(
        { error: 'Inspection report document not found. Please generate it first.' },
        { status: 400 }
      )
    }

    // Generate PDF
    const pdfDoc = await PDFDocument.create()
    await addDocumentToPDF(pdfDoc, 'Professional Inspection Report', inspectionReport, report)

    const pdfBytes = await pdfDoc.save()

    const claimRef = report.claimReferenceNumber || report.reportNumber || report.id
    const filename = `Inspection-Report-${claimRef}.pdf`

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error('Error generating inspection report PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}

async function addDocumentToPDF(pdfDoc: PDFDocument, title: string, content: string, report: any) {
  let page = pdfDoc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const headerColor = rgb(0.0, 0.63, 0.8) // Cyan
  const watermarkColor = rgb(0.9, 0.9, 0.9) // Light gray
  let yPosition = height - 60
  const margin = 50
  const lineHeight = 15
  const fontSize = 10
  const maxWidth = width - (margin * 2)

  // Add watermark (removed rotation as it's not supported in this version of pdf-lib)
  page.drawText('PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE', {
    x: margin,
    y: height - 30,
    size: 12,
    font: boldFont,
    color: watermarkColor,
    opacity: 0.3
  })

  // Add title
  page.drawText(title, {
    x: margin,
    y: yPosition,
    size: 18,
    font: boldFont,
    color: headerColor
  })
  yPosition -= 30

  // Add metadata
  const metadata = [
    `Claim Reference: ${report.claimReferenceNumber || report.reportNumber || 'N/A'}`,
    `Date Generated: ${new Date().toLocaleString('en-AU')}`,
    `Version: ${report.reportVersion || 1}`
  ]

  metadata.forEach((text) => {
    page.drawText(text, {
      x: margin,
      y: yPosition,
      size: fontSize,
      font: font
    })
    yPosition -= lineHeight
  })
  yPosition -= 20

  // Helper function to wrap text
  const wrapText = (text: string, maxWidth: number, size: number): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const testWidth = font.widthOfTextAtSize(testLine, size)
      
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) {
      lines.push(currentLine)
    }
    return lines
  }

  // Remove HTML tags and extract signature section
  let processedContent = content
  processedContent = processedContent.replace(/<p[^>]*>/gi, '')
  processedContent = processedContent.replace(/<\/p>/gi, '\n')
  processedContent = processedContent.replace(/<br\s*\/?>/gi, '\n')
  processedContent = processedContent.replace(/<div[^>]*>/gi, '')
  processedContent = processedContent.replace(/<\/div>/gi, '\n')
  processedContent = processedContent.replace(/style="[^"]*"/gi, '')
  
  // Extract signature section for separate handling
  const signaturePattern = /##\s*SIGNATURE[\s\S]*?(?=##|$)/i
  const signatureMatch = processedContent.match(signaturePattern)
  let signatureLines: string[] = []
  
  if (signatureMatch) {
    signatureLines = signatureMatch[0]
      .replace(/##\s*SIGNATURE/gi, '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.match(/^(Technician Name|Date|Position|Company):/i))
      .filter(l => l.length > 0 && !l.match(/^[-•]/))
      .filter(l => !l.match(/^<[^>]+>/))
    
    // Remove signature section from main content
    processedContent = processedContent.replace(signaturePattern, '')
  }
  
  // Add content with proper formatting
  const lines = processedContent.split('\n')
  for (const line of lines) {
    if (yPosition < 80) {
      page = pdfDoc.addPage([595.28, 841.89])
      yPosition = height - 50
    }

    const trimmedLine = line.trim()
    
    if (trimmedLine.startsWith('# ')) {
      // Main heading
      const text = trimmedLine.replace(/^#+\s*/, '').trim()
      yPosition -= 10
      page.drawText(text, {
        x: margin,
        y: yPosition,
        size: 16,
        font: boldFont,
        color: headerColor
      })
      yPosition -= 25
    } else if (trimmedLine.startsWith('## ')) {
      // Subheading
      const text = trimmedLine.replace(/^#+\s*/, '').trim()
      yPosition -= 5
      page.drawText(text, {
        x: margin,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: headerColor
      })
      yPosition -= 20
    } else if (trimmedLine.startsWith('### ')) {
      // Sub-subheading
      const text = trimmedLine.replace(/^#+\s*/, '').trim()
      yPosition -= 5
      page.drawText(text, {
        x: margin,
        y: yPosition,
        size: 12,
        font: boldFont
      })
      yPosition -= 18
    } else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
      // Bold text
      const text = trimmedLine.replace(/\*\*/g, '').trim()
      const wrapped = wrapText(text, maxWidth, fontSize)
      wrapped.forEach((wrappedLine) => {
        if (yPosition < 80) {
          page = pdfDoc.addPage([595.28, 841.89])
          yPosition = height - 50
        }
        page.drawText(wrappedLine, {
          x: margin,
          y: yPosition,
          size: fontSize,
          font: boldFont
        })
        yPosition -= lineHeight
      })
    } else if (trimmedLine.startsWith('- ')) {
      // Bullet point
      const text = trimmedLine.replace(/^-\s*/, '').trim()
      const wrapped = wrapText(text, maxWidth - 15, fontSize)
      wrapped.forEach((wrappedLine, index) => {
        if (yPosition < 80) {
          page = pdfDoc.addPage([595.28, 841.89])
          yPosition = height - 50
        }
        page.drawText(index === 0 ? `• ${wrappedLine}` : `  ${wrappedLine}`, {
          x: margin,
          y: yPosition,
          size: fontSize,
          font: font
        })
        yPosition -= lineHeight
      })
    } else if (trimmedLine) {
      // Regular text
      const wrapped = wrapText(trimmedLine, maxWidth, fontSize)
      wrapped.forEach((wrappedLine) => {
        if (yPosition < 80) {
          page = pdfDoc.addPage([595.28, 841.89])
          yPosition = height - 50
        }
        page.drawText(wrappedLine, {
          x: margin,
          y: yPosition,
          size: fontSize,
          font: font
        })
        yPosition -= lineHeight
      })
    } else {
      // Empty line
      yPosition -= lineHeight / 2
    }
  }
  
  // Add signature section at the bottom right (before footer)
  if (signatureLines.length > 0) {
    if (yPosition < 80) {
      page = pdfDoc.addPage([595.28, 841.89])
      yPosition = height - 50
    }
    
    yPosition -= 30 // Add spacing before signature
    
    // Draw a line above signature
    page.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: width - margin, y: yPosition },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7)
    })
    yPosition -= 20
    
    // Add signature lines, right-aligned
    const signatureStartX = width - margin - 200 // Right-aligned, 200pt wide
    let signatureY = yPosition
    
    signatureLines.forEach((line) => {
      if (signatureY < 80) {
        page = pdfDoc.addPage([595.28, 841.89])
        signatureY = height - 50
      }
      
      const cleanLine = line.trim()
      if (cleanLine) {
        // Calculate text width for right alignment
        const textWidth = font.widthOfTextAtSize(cleanLine, fontSize)
        page.drawText(cleanLine, {
          x: signatureStartX + (200 - textWidth), // Right-align within 200pt width
          y: signatureY,
          size: fontSize,
          font: font,
          color: rgb(0.1, 0.1, 0.1)
        })
        signatureY -= lineHeight
      }
    })
  }
}

