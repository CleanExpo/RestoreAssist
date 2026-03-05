import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

interface EnhancedReportData {
  enhancedReport: string
  technicianNotes?: string
  dateOfAttendance?: string
  clientContacted?: string
  reportNumber?: string
  clientName?: string
  propertyAddress?: string
}

export async function generateEnhancedReportPDF(data: EnhancedReportData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4 size
  const { width, height } = page.getSize()

  // Colors
  const headerColor = rgb(0.11, 0.18, 0.28) // #1C2E47
  const textColor = rgb(0.1, 0.1, 0.1)
  const secondaryColor = rgb(0.4, 0.4, 0.4)

  // Fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let currentPage = page
  let yPosition = height - 50
  const margin = 50
  const lineHeight = 16
  const sectionSpacing = 20

  // Helper function to sanitize text for WinAnsi encoding
  const sanitizeText = (text: string): string => {
    if (!text) return ""
    // Replace newlines with spaces
    return text
      .replace(/\r\n/g, ' ')  // Windows line breaks
      .replace(/\n/g, ' ')    // Unix line breaks
      .replace(/\r/g, ' ')    // Old Mac line breaks
      .replace(/\t/g, ' ')    // Tabs
      .replace(/\s+/g, ' ')   // Multiple spaces to single space
      .trim()
  }

  // Helper function to add text with word wrapping
  const addText = (
    text: string,
    x: number,
    y: number,
    size: number,
    font: any,
    color: any = textColor,
    maxWidth?: number
  ): number => {
    let page = currentPage
    let currentY = y
    
    // Sanitize text first
    const sanitizedText = sanitizeText(text)
    
    if (maxWidth) {
      const words = sanitizedText.split(' ')
      let line = ''
      
      for (const word of words) {
        if (!word) continue // Skip empty words
        
        const testLine = line + (line ? ' ' : '') + word
        const width = font.widthOfTextAtSize(testLine, size)
        
        if (width > maxWidth && line.length > 0) {
          page.drawText(line, {
            x,
            y: currentY,
            size,
            font,
            color
          })
          line = word
          currentY -= lineHeight
          
          if (currentY < margin) {
            // Create new page
            currentPage = pdfDoc.addPage([595, 842])
            page = currentPage
            currentY = height - 50
          }
        } else {
          line = testLine
        }
      }
      
      if (line.length > 0) {
        page.drawText(line, {
          x,
          y: currentY,
          size,
          font,
          color
        })
        currentY -= lineHeight
      }
      
      return currentY
    } else {
      page.drawText(sanitizedText, {
        x,
        y,
        size,
        font,
        color
      })
      return y - lineHeight
    }
  }

  // Header bar
  currentPage.drawRectangle({
    x: 0,
    y: height - 30,
    width: width,
    height: 30,
    color: headerColor
  })

  // Logo placeholder (you can add actual logo later)
  currentPage.drawText("RestoreAssist", {
    x: margin,
    y: height - 20,
    size: 14,
    font: helveticaBold,
    color: rgb(1, 1, 1)
  })

  // Title
  yPosition = height - 80
  currentPage.drawText("Professional Inspection Report (Enhanced Version)", {
    x: margin,
    y: yPosition,
    size: 18,
    font: helveticaBold,
    color: textColor
  })
  yPosition -= 30

  // Report metadata - sanitize all inputs
  if (data.reportNumber) {
    const reportNum = sanitizeText(String(data.reportNumber))
    yPosition = addText(`Report Number: ${reportNum}`, margin, yPosition, 10, helvetica, secondaryColor)
  }
  if (data.dateOfAttendance) {
    try {
      const date = new Date(data.dateOfAttendance)
      const dateStr = date.toLocaleDateString('en-AU', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      yPosition = addText(`Date of Attendance: ${sanitizeText(dateStr)}`, margin, yPosition, 10, helvetica, secondaryColor)
    } catch (e) {
      // Skip invalid dates
    }
  }
  if (data.clientName) {
    const clientName = sanitizeText(String(data.clientName))
    if (clientName) {
      yPosition = addText(`Client: ${clientName}`, margin, yPosition, 10, helvetica, secondaryColor)
    }
  }
  if (data.propertyAddress) {
    const propertyAddr = sanitizeText(String(data.propertyAddress))
    if (propertyAddr) {
      yPosition = addText(`Property Address: ${propertyAddr}`, margin, yPosition, 10, helvetica, secondaryColor)
    }
  }

  yPosition -= sectionSpacing

  // Enhanced Report Content
  let reportText = data.enhancedReport || ""
  
  // Remove HTML tags that might have been incorrectly included
  reportText = reportText.replace(/<p[^>]*>/gi, '')
  reportText = reportText.replace(/<\/p>/gi, '\n')
  reportText = reportText.replace(/<br\s*\/?>/gi, '\n')
  reportText = reportText.replace(/<div[^>]*>/gi, '')
  reportText = reportText.replace(/<\/div>/gi, '\n')
  reportText = reportText.replace(/style="[^"]*"/gi, '')
  
  // Extract signature section for separate handling
  const signaturePattern = /##\s*SIGNATURE[\s\S]*?(?=##|$)/i
  const signatureMatch = reportText.match(signaturePattern)
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
    reportText = reportText.replace(signaturePattern, '')
  }
  
  // Process line by line for better heading detection
  const lines = reportText.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    if (yPosition < margin + 50) {
      currentPage = pdfDoc.addPage([595, 842])
      yPosition = height - 50
    }

    const trimmedLine = line.trim()
    if (!trimmedLine) {
      yPosition -= 8 // Small spacing for empty lines
      continue
    }

    // Check for different heading levels (process before sanitization to preserve markdown)
    if (trimmedLine.startsWith('# ')) {
      // Main heading (H1) - size 16, bold, colored
      const text = trimmedLine.replace(/^#+\s*/, '').trim()
      const cleanText = sanitizeText(text)
      if (cleanText) {
        yPosition -= 10
        currentPage.drawText(cleanText, {
          x: margin,
          y: yPosition,
          size: 16,
          font: helveticaBold,
          color: headerColor
        })
        yPosition -= 25
      }
    } else if (trimmedLine.startsWith('## ')) {
      // Subheading (H2) - size 14, bold, colored
      const text = trimmedLine.replace(/^#+\s*/, '').trim()
      const cleanText = sanitizeText(text)
      if (cleanText) {
        yPosition -= 5
        currentPage.drawText(cleanText, {
          x: margin,
          y: yPosition,
          size: 14,
          font: helveticaBold,
          color: headerColor
        })
        yPosition -= 20
      }
    } else if (trimmedLine.startsWith('### ')) {
      // Sub-subheading (H3) - size 12, bold
      const text = trimmedLine.replace(/^#+\s*/, '').trim()
      const cleanText = sanitizeText(text)
      if (cleanText) {
        yPosition -= 5
        currentPage.drawText(cleanText, {
          x: margin,
          y: yPosition,
          size: 12,
          font: helveticaBold,
          color: textColor
        })
        yPosition -= 18
      }
    } else if (trimmedLine.startsWith('#### ')) {
      // H4 heading - size 11, bold
      const text = trimmedLine.replace(/^#+\s*/, '').trim()
      const cleanText = sanitizeText(text)
      if (cleanText) {
        yPosition -= 5
        currentPage.drawText(cleanText, {
          x: margin,
          y: yPosition,
          size: 11,
          font: helveticaBold,
          color: textColor
        })
        yPosition -= 16
      }
    } else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**') && trimmedLine.length > 4) {
      // Bold text (markdown **text**)
      const text = trimmedLine.replace(/\*\*/g, '').trim()
      const cleanText = sanitizeText(text)
      if (cleanText) {
        yPosition = addText(cleanText, margin, yPosition, 11, helveticaBold, textColor, width - (margin * 2))
        yPosition -= 6
      }
    } else {
      // Regular text
      const cleanText = sanitizeText(trimmedLine)
      if (cleanText) {
        yPosition = addText(cleanText, margin, yPosition, 11, helvetica, textColor, width - (margin * 2))
        yPosition -= 4
      }
    }
  }

  // Add signature section at the bottom right (before footer)
  if (signatureLines.length > 0) {
    if (yPosition < margin + 80) {
      currentPage = pdfDoc.addPage([595, 842])
      yPosition = height - 50
    }
    
    yPosition -= 30 // Add spacing before signature
    
    // Draw a line above signature
    currentPage.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: width - margin, y: yPosition },
      thickness: 0.5,
      color: secondaryColor
    })
    yPosition -= 20
    
    // Add signature lines, right-aligned
    const signatureStartX = width - margin - 200 // Right-aligned, 200pt wide
    let signatureY = yPosition
    
    signatureLines.forEach((line) => {
      if (signatureY < margin + 20) {
        currentPage = pdfDoc.addPage([595, 842])
        signatureY = height - 50
      }
      
      const cleanLine = sanitizeText(line)
      if (cleanLine) {
        // Calculate text width for right alignment
        const textWidth = helvetica.widthOfTextAtSize(cleanLine, 11)
        currentPage.drawText(cleanLine, {
          x: signatureStartX + (200 - textWidth), // Right-align within 200pt width
          y: signatureY,
          size: 11,
          font: helvetica,
          color: textColor
        })
        signatureY -= 14
      }
    })
    
    yPosition = signatureY
  }

  // Add footer to all pages
  const pages = pdfDoc.getPages()
  const footerY = 30
  for (const page of pages) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: footerY,
      color: headerColor
    })

    page.drawText("Insurance Claims made easier", {
      x: margin,
      y: 10,
      size: 10,
      font: helvetica,
      color: rgb(1, 1, 1)
    })

    page.drawText(`Generated on ${new Date().toLocaleDateString('en-AU')}`, {
      x: width - margin - 100,
      y: 10,
      size: 10,
      font: helvetica,
      color: rgb(1, 1, 1)
    })
  }

  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}

