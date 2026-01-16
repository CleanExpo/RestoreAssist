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
  }>
}

/**
 * Generate PDF for authority form with auto-populated data
 */
export async function generateAuthorityFormPDF(data: AuthorityFormData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  
  // Load fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  
  // Colors
  const black = rgb(0, 0, 0)
  const darkGray = rgb(0.3, 0.3, 0.3)
  const lightGray = rgb(0.9, 0.9, 0.9)
  
  // Create page (A4: 595.28 x 841.89 points)
  const page = pdfDoc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  
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
  
  let yPosition = height - 50 // Start from top
  
  // Header Section - Company Information
  if (logoImage) {
    const logoDims = logoImage.scale(0.15)
    page.drawImage(logoImage, {
      x: 50,
      y: yPosition - logoDims.height,
      width: logoDims.width,
      height: logoDims.height
    })
  }
  
  const headerX = logoImage ? 120 : 50
  page.drawText(data.companyName, {
    x: headerX,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 20
  
  if (data.companyABN) {
    page.drawText(`ABN: ${data.companyABN}`, {
      x: headerX,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 15
  }
  
  if (data.companyPhone) {
    page.drawText(`Phone: ${data.companyPhone}`, {
      x: headerX,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 15
  }
  
  if (data.companyEmail) {
    page.drawText(`Email: ${data.companyEmail}`, {
      x: headerX,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 15
  }
  
  if (data.companyWebsite) {
    page.drawText(`Website: ${data.companyWebsite}`, {
      x: headerX,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 15
  }
  
  if (data.companyAddress) {
    page.drawText(`Address: ${data.companyAddress}`, {
      x: headerX,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 15
  }
  
  yPosition -= 30
  
  // Draw line separator
  page.drawLine({
    start: { x: 50, y: yPosition },
    end: { x: width - 50, y: yPosition },
    thickness: 1,
    color: darkGray
  })
  
  yPosition -= 30
  
  // Form Title
  page.drawText(data.formName.toUpperCase(), {
    x: 50,
    y: yPosition,
    size: 18,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 30
  
  // Date
  const dateStr = data.date.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
  page.drawText(`Date: ${dateStr}`, {
    x: 50,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black
  })
  
  yPosition -= 40
  
  // Client Information Section
  page.drawText('CLIENT INFORMATION:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 20
  
  page.drawText(`Name: ${data.clientName}`, {
    x: 50,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black
  })
  
  yPosition -= 18
  
  page.drawText(`Address: ${data.clientAddress}`, {
    x: 50,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black
  })
  
  yPosition -= 18
  
  if (data.incidentDate) {
    const incidentDateStr = new Date(data.incidentDate).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
    page.drawText(`Incident Date: ${incidentDateStr}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: black
    })
    yPosition -= 18
  }
  
  if (data.claimReferenceNumber) {
    page.drawText(`Claim Reference: ${data.claimReferenceNumber}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: black
    })
    yPosition -= 18
  }
  
  yPosition -= 20
  
  // Incident Brief Section
  if (data.incidentBrief) {
    page.drawText('INCIDENT BRIEF:', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: black
    })
    
    yPosition -= 20
    
    // Wrap text for incident brief
    const briefLines = wrapText(data.incidentBrief, width - 100, 11, helvetica)
    briefLines.forEach((line: string) => {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: black
      })
      yPosition -= 15
    })
    
    yPosition -= 20
  }
  
  // Authority Description Section
  page.drawText('AUTHORITY:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 20
  
  // Wrap text for authority description
  const authorityLines = wrapText(data.authorityDescription, width - 100, 11, helvetica)
  authorityLines.forEach((line: string) => {
    page.drawText(line, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: black
    })
    yPosition -= 15
  })
  
  yPosition -= 30
  
  // Terms and Conditions (Standard)
  page.drawText('TERMS AND CONDITIONS:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: black
  })
  
  yPosition -= 20
  
  const termsText = `By signing this authority form, the signatory acknowledges that they have read and understood the scope of works and authorizes ${data.companyName} to proceed with the restoration work as described. The signatory agrees to the terms and conditions outlined in the inspection report and scope of works document.`
  
  const termsLines = wrapText(termsText, width - 100, 10, helvetica)
  termsLines.forEach((line: string) => {
    page.drawText(line, {
      x: 50,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: darkGray
    })
    yPosition -= 14
  })
  
  yPosition -= 30
  
  // Signature Blocks
  const signatureBlockHeight = 100
  const signatureBlockWidth = (width - 100) / Math.min(data.signatures.length, 2)
  const signaturesPerRow = 2
  
  for (let index = 0; index < data.signatures.length; index++) {
    const sig = data.signatures[index]
    const row = Math.floor(index / signaturesPerRow)
    const col = index % signaturesPerRow
    const sigX = 50 + (col * signatureBlockWidth)
    const sigY = yPosition - (row * (signatureBlockHeight + 20))
    
    // Draw signature box
    page.drawRectangle({
      x: sigX,
      y: sigY - signatureBlockHeight,
      width: signatureBlockWidth - 20,
      height: signatureBlockHeight,
      borderColor: darkGray,
      borderWidth: 1
    })
    
    // Draw signature if available
    if (sig.signatureData) {
      try {
        // Handle base64 data (with or without data:image/png;base64, prefix)
        const base64Data = sig.signatureData.includes(',') 
          ? sig.signatureData.split(',')[1] 
          : sig.signatureData
        
        // Convert base64 to Uint8Array
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        const sigImage = await pdfDoc.embedPng(bytes)
        const sigDims = sigImage.scale(0.3)
        page.drawImage(sigImage, {
          x: sigX + 10,
          y: sigY - 40,
          width: Math.min(sigDims.width, signatureBlockWidth - 40),
          height: Math.min(sigDims.height, 50)
        })
      } catch (error) {
        console.warn('Failed to embed signature image:', error)
      }
    }
    
    // Signatory name and role
    page.drawText(sig.signatoryName, {
      x: sigX + 10,
      y: sigY - signatureBlockHeight + 10,
      size: 10,
      font: helvetica,
      color: black
    })
    
    page.drawText(sig.signatoryRole, {
      x: sigX + 10,
      y: sigY - signatureBlockHeight - 10,
      size: 9,
      font: helvetica,
      color: darkGray
    })
    
    if (sig.signedAt) {
      const signedDateStr = new Date(sig.signedAt).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
      page.drawText(`Date: ${signedDateStr}`, {
        x: sigX + 10,
        y: sigY - signatureBlockHeight - 25,
        size: 9,
        font: helvetica,
        color: darkGray
      })
    }
  }
  
  return pdfDoc.save()
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
