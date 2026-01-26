import { PDFDocument, rgb, StandardFonts, PDFImage } from "pdf-lib"

interface AuthorityFormData {
  // Company Information
  companyName: string
  companyLogo?: string | null
  companyABN?: string | null
  companyPhone?: string | null
  companyEmail?: string | null
  companyWebsite?: string | null
  companyAddress?: string | null

  // Client Information
  clientName: string
  clientAddress: string
  incidentDate?: Date | null
  incidentBrief?: string | null
  claimReferenceNumber?: string | null

  // Form Details
  formName: string // e.g., "Authority to Commence Work"
  authorityDescription: string
  date: Date

  // Signatures
  signatures: Array<{
    signatoryName: string
    signatoryRole: string
    signatureData?: string | null // Base64 image
    signedAt?: Date | null
    signatoryEmail?: string | null
  }>
}

/**
 * Generate PDF for authority form with styled layout matching the display
 */
export async function generateAuthorityFormPDF(data: AuthorityFormData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  
  // Load fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  
  // Colors - matching the display
  const black = rgb(0, 0, 0)
  const darkGray = rgb(0.4, 0.4, 0.4)
  const lightGray = rgb(0.95, 0.95, 0.95) // Light grey background for boxes
  const mediumGray = rgb(0.85, 0.85, 0.85) // Border color
  const green = rgb(0.2, 0.7, 0.3) // For signature status
  
  // Create page (A4: 595.28 x 841.89 points)
  const page = pdfDoc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const margin = 50
  const contentWidth = width - (margin * 2)
  
  // Load logo if available
  let logoImage: PDFImage | null = null
  if (data.companyLogo) {
    try {
      const logoResponse = await fetch(data.companyLogo)
      const logoBuffer = await logoResponse.arrayBuffer()
      const logoUrl = data.companyLogo.toLowerCase()
      if (logoUrl.includes('.png')) {
        logoImage = await pdfDoc.embedPng(logoBuffer)
      } else if (logoUrl.includes('.jpg') || logoUrl.includes('.jpeg')) {
        logoImage = await pdfDoc.embedJpg(logoBuffer)
      } else {
        try {
          logoImage = await pdfDoc.embedPng(logoBuffer)
        } catch {
          logoImage = await pdfDoc.embedJpg(logoBuffer)
        }
      }
    } catch (error) {
      console.warn('Failed to load company logo:', error)
    }
  }
  
  let yPosition = height - margin
  
  // Header Section - Company Information (Left side)
  const headerStartY = yPosition
  if (logoImage) {
    const logoDims = logoImage.scale(0.12)
    page.drawImage(logoImage, {
      x: margin,
      y: yPosition - logoDims.height,
      width: logoDims.width,
      height: logoDims.height
    })
    yPosition -= logoDims.height + 10
  }
  
  page.drawText(data.companyName, {
    x: margin,
    y: yPosition,
    size: 20,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 18
  
  if (data.companyABN) {
    page.drawText(`ABN: ${data.companyABN}`, {
      x: margin,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 12
  }
  
  if (data.companyAddress) {
    page.drawText(data.companyAddress, {
      x: margin,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 12
  }
  
  const contactInfo: string[] = []
  if (data.companyPhone) contactInfo.push(`Phone: ${data.companyPhone}`)
  if (data.companyEmail) contactInfo.push(`Email: ${data.companyEmail}`)
  if (data.companyWebsite) contactInfo.push(`Website: ${data.companyWebsite}`)
  
  if (contactInfo.length > 0) {
    page.drawText(contactInfo.join(' | '), {
      x: margin,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 12
  }
  
  // Form ID and Date (Right side of header)
  const formId = data.formName.toLowerCase().replace(/\s+/g, '').slice(0, 8)
  const dateStr = data.date.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
  
  const formIdWidth = helvetica.widthOfTextAtSize(`Form ID: ${formId}`, 9)
  const dateWidth = helvetica.widthOfTextAtSize(`Date: ${dateStr}`, 9)
  const rightX = width - margin - Math.max(formIdWidth, dateWidth)
  
  page.drawText(`Form ID: ${formId}`, {
    x: rightX,
    y: headerStartY - 10,
    size: 9,
    font: helvetica,
    color: darkGray
  })
  
  page.drawText(`Date: ${dateStr}`, {
    x: rightX,
    y: headerStartY - 22,
    size: 9,
    font: helvetica,
    color: darkGray
  })
  
  yPosition -= 30
  
  // Draw line separator
  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: width - margin, y: yPosition },
    thickness: 1.5,
    color: darkGray
  })
  
  yPosition -= 25
  
  // Form Title
  page.drawText(data.formName, {
    x: margin,
    y: yPosition,
    size: 24,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 25
  
  // Subtitle/Description
  page.drawText("Authorization for restoration company to commence work on the property", {
    x: margin,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: darkGray
  })
  
  yPosition -= 40
  
  // Client Details Section - Grey Box
  const clientBoxHeight = 180
  const clientBoxY = yPosition - clientBoxHeight
  
  // Draw rounded rectangle background (simulated with rounded corners)
  drawRoundedRectangle(page, {
    x: margin,
    y: clientBoxY,
    width: contentWidth,
    height: clientBoxHeight,
    radius: 8,
    backgroundColor: lightGray,
    borderColor: mediumGray,
    borderWidth: 1
  })
  
  yPosition -= 20
  
  page.drawText("Client Details", {
    x: margin + 15,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 25
  
  // Client information in grid layout
  const gridX1 = margin + 15
  const gridX2 = margin + contentWidth / 2
  let gridY = yPosition
  
  page.drawText("Client Name", {
    x: gridX1,
    y: gridY,
    size: 9,
    font: helvetica,
    color: darkGray
  })
  page.drawText(data.clientName, {
    x: gridX1,
    y: gridY - 14,
    size: 11,
    font: helveticaBold,
    color: black
  })
  
  page.drawText("Property Address", {
    x: gridX2,
    y: gridY,
    size: 9,
    font: helvetica,
    color: darkGray
  })
  page.drawText(data.clientAddress, {
    x: gridX2,
    y: gridY - 14,
    size: 11,
    font: helveticaBold,
    color: black
  })
  
  gridY -= 35
  
  if (data.incidentDate) {
    const incidentDateStr = new Date(data.incidentDate).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
    page.drawText("Incident Date", {
      x: gridX1,
      y: gridY,
      size: 9,
      font: helvetica,
      color: darkGray
    })
    page.drawText(incidentDateStr, {
      x: gridX1,
      y: gridY - 14,
      size: 11,
      font: helveticaBold,
      color: black
    })
  }
  
  if (data.claimReferenceNumber) {
    page.drawText("Claim Reference", {
      x: gridX2,
      y: gridY,
      size: 9,
      font: helvetica,
      color: darkGray
    })
    page.drawText(data.claimReferenceNumber, {
      x: gridX2,
      y: gridY - 14,
      size: 11,
      font: helveticaBold,
      color: black
    })
  }
  
  gridY -= 35
  
  // Incident Brief
  if (data.incidentBrief) {
    page.drawText("Incident Brief", {
      x: gridX1,
      y: gridY,
      size: 9,
      font: helvetica,
      color: darkGray
    })
    const briefLines = wrapText(data.incidentBrief, contentWidth - 30, 10, helvetica)
    let briefY = gridY - 14
    briefLines.forEach((line: string) => {
      page.drawText(line, {
        x: gridX1,
        y: briefY,
        size: 10,
        font: helvetica,
        color: black
      })
      briefY -= 12
    })
  }
  
  yPosition = clientBoxY - 30
  
  // Authority Granted Section - Grey Box
  const authorityText = data.authorityDescription
  const authorityLines = wrapText(authorityText, contentWidth - 30, 11, helvetica)
  const authorityBoxHeight = Math.max(100, authorityLines.length * 15 + 50)
  const authorityBoxY = yPosition - authorityBoxHeight
  
  drawRoundedRectangle(page, {
    x: margin,
    y: authorityBoxY,
    width: contentWidth,
    height: authorityBoxHeight,
    radius: 8,
    backgroundColor: lightGray,
    borderColor: mediumGray,
    borderWidth: 1
  })
  
  yPosition -= 20
  
  page.drawText("Authority Granted", {
    x: margin + 15,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 25
  
  authorityLines.forEach((line: string) => {
    page.drawText(line, {
      x: margin + 15,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: black
    })
    yPosition -= 15
  })
  
  yPosition = authorityBoxY - 40
  
  // Signatures Section
  page.drawText("Signatures", {
    x: margin,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 30
  
  // Signature blocks in grid (2 per row)
  const signaturesPerRow = 2
  const signatureBlockWidth = (contentWidth - 20) / signaturesPerRow
  const signatureBlockHeight = 140
  const signedCount = data.signatures.filter(s => s.signedAt).length
  const totalSignatures = data.signatures.length
  
  for (let index = 0; index < data.signatures.length; index++) {
    const sig = data.signatures[index]
    const row = Math.floor(index / signaturesPerRow)
    const col = index % signaturesPerRow
    const sigX = margin + (col * (signatureBlockWidth + 20))
    const sigY = yPosition - (row * (signatureBlockHeight + 20))
    
    // Draw white rounded rectangle for signature box
    drawRoundedRectangle(page, {
      x: sigX,
      y: sigY - signatureBlockHeight,
      width: signatureBlockWidth,
      height: signatureBlockHeight,
      radius: 8,
      backgroundColor: rgb(1, 1, 1),
      borderColor: mediumGray,
      borderWidth: 2
    })
    
    const sigContentY = sigY - 20
    
    // Draw signature if available
    if (sig.signatureData) {
      try {
        const base64Data = sig.signatureData.includes(',') 
          ? sig.signatureData.split(',')[1] 
          : sig.signatureData
        
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        const sigImage = await pdfDoc.embedPng(bytes)
        const sigDims = sigImage.scale(0.25)
        const sigImgX = sigX + (signatureBlockWidth - sigDims.width) / 2
        page.drawImage(sigImage, {
          x: sigImgX,
          y: sigContentY - 30,
          width: Math.min(sigDims.width, signatureBlockWidth - 20),
          height: Math.min(sigDims.height, 60)
        })
      } catch (error) {
        console.warn('Failed to embed signature image:', error)
      }
    } else {
      // Draw "Signature pending" text
      page.drawText("Signature pending", {
        x: sigX + 10,
        y: sigContentY - 20,
        size: 9,
        font: helvetica,
        color: darkGray
      })
    }
    
    // Draw line separator
    page.drawLine({
      start: { x: sigX + 10, y: sigContentY - 60 },
      end: { x: sigX + signatureBlockWidth - 10, y: sigContentY - 60 },
      thickness: 0.5,
      color: mediumGray
    })
    
    // Signatory name
    page.drawText(sig.signatoryName, {
      x: sigX + 10,
      y: sigContentY - 75,
      size: 11,
      font: helveticaBold,
      color: black
    })
    
    // Signatory role (in a pill shape - simulated with background)
    const roleText = sig.signatoryRole
    const roleWidth = helvetica.widthOfTextAtSize(roleText, 9)
    page.drawRectangle({
      x: sigX + 10,
      y: sigContentY - 95,
      width: roleWidth + 8,
      height: 14,
      color: mediumGray
    })
    page.drawText(roleText, {
      x: sigX + 14,
      y: sigContentY - 93,
      size: 9,
      font: helvetica,
      color: black
    })
    
    // Signed date
    if (sig.signedAt) {
      const signedDateStr = new Date(sig.signedAt).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      page.drawText(`Signed ${signedDateStr}`, {
        x: sigX + 10,
        y: sigContentY - 115,
        size: 8,
        font: helvetica,
        color: darkGray
      })
    }
  }
  
  // Signature status bar
  const lastSigY = yPosition - (Math.ceil(data.signatures.length / signaturesPerRow) - 1) * (signatureBlockHeight + 20) - signatureBlockHeight
  const statusBarY = lastSigY - 30
  
  // Green status bar background
  page.drawRectangle({
    x: margin,
    y: statusBarY - 15,
    width: contentWidth,
    height: 15,
    color: green
  })
  
  // Status text
  const statusText = `Signatures: ${signedCount} of ${totalSignatures}`
  const allSignedText = signedCount === totalSignatures ? "All signed" : ""
  
  page.drawText(statusText, {
    x: margin + 10,
    y: statusBarY - 11,
    size: 9,
    font: helveticaBold,
    color: rgb(1, 1, 1)
  })
  
  if (allSignedText) {
    const allSignedWidth = helveticaBold.widthOfTextAtSize(allSignedText, 9)
    page.drawText(allSignedText, {
      x: width - margin - allSignedWidth - 10,
      y: statusBarY - 11,
      size: 9,
      font: helveticaBold,
      color: rgb(1, 1, 1)
    })
  }
  
  // Digital signature confirmation boxes for signed signatures
  let confirmationY = statusBarY - 35
  for (const sig of data.signatures.filter(s => s.signedAt)) {
    if (confirmationY < 100) break // Don't go off page
    
    // Green border box
    drawRoundedRectangle(page, {
      x: margin,
      y: confirmationY - 30,
      width: contentWidth,
      height: 30,
      radius: 4,
      backgroundColor: lightGray,
      borderColor: green,
      borderWidth: 1.5
    })
    
    // Checkmark circle (simulated with filled circle)
    page.drawCircle({
      x: margin + 15,
      y: confirmationY - 15,
      size: 6,
      color: green
    })
    // Draw checkmark (simplified as a small line)
    page.drawLine({
      start: { x: margin + 12, y: confirmationY - 15 },
      end: { x: margin + 15, y: confirmationY - 18 },
      thickness: 1.5,
      color: rgb(1, 1, 1)
    })
    page.drawLine({
      start: { x: margin + 15, y: confirmationY - 18 },
      end: { x: margin + 20, y: confirmationY - 12 },
      thickness: 1.5,
      color: rgb(1, 1, 1)
    })
    
    // Name and role
    page.drawText(sig.signatoryName, {
      x: margin + 30,
      y: confirmationY - 12,
      size: 10,
      font: helveticaBold,
      color: black
    })
    
    const roleWidth = helvetica.widthOfTextAtSize(sig.signatoryRole, 8)
    page.drawRectangle({
      x: margin + 30,
      y: confirmationY - 25,
      width: roleWidth + 6,
      height: 12,
      color: mediumGray
    })
    page.drawText(sig.signatoryRole, {
      x: margin + 33,
      y: confirmationY - 23,
      size: 8,
      font: helvetica,
      color: black
    })
    
    // Email if available
    if (sig.signatoryEmail) {
      page.drawText(sig.signatoryEmail, {
        x: margin + 150,
        y: confirmationY - 12,
        size: 9,
        font: helvetica,
        color: darkGray
      })
    }
    
    // Signed date
    const signedDateStr = new Date(sig.signedAt).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    const dateText = `Signed ${signedDateStr}`
    const dateTextWidth = helvetica.widthOfTextAtSize(dateText, 9)
    page.drawText(dateText, {
      x: width - margin - dateTextWidth - 10,
      y: confirmationY - 12,
      size: 9,
      font: helvetica,
      color: darkGray
    })
    
    confirmationY -= 40
  }
  
  // Footer
  const footerY = 50
  page.drawText("Generated by Restore Assist", {
    x: margin,
    y: footerY,
    size: 9,
    font: helvetica,
    color: darkGray
  })
  
  if (data.companyWebsite) {
    const websiteWidth = helvetica.widthOfTextAtSize(data.companyWebsite, 9)
    page.drawText(data.companyWebsite, {
      x: width - margin - websiteWidth,
      y: footerY,
      size: 9,
      font: helvetica,
      color: darkGray
    })
  }
  
  return pdfDoc.save()
}

/**
 * Draw a rounded rectangle (simulated with rectangle and border)
 * Note: pdf-lib doesn't support true rounded rectangles, so we use regular rectangles
 */
function drawRoundedRectangle(
  page: any,
  options: {
    x: number
    y: number
    width: number
    height: number
    radius: number
    backgroundColor?: any
    borderColor?: any
    borderWidth?: number
  }
) {
  const { x, y, width, height, backgroundColor, borderColor, borderWidth } = options
  
  // Draw background
  if (backgroundColor) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: backgroundColor
    })
  }
  
  // Draw border (regular rectangle border, rounded corners are visual only)
  if (borderColor && borderWidth) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: borderColor,
      borderWidth: borderWidth
    })
  }
}

/**
 * Helper function to wrap text to fit within width
 */
function wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const testWidth = font.widthOfTextAtSize(testLine, fontSize)
    
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
