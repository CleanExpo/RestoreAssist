/**
 * Professional Invoice PDF Generator
 *
 * Generates premium PDF invoices with company branding, line items,
 * GST breakdown, and payment information.
 */

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFImage } from 'pdf-lib'

interface BusinessInfo {
  businessName?: string | null
  businessAddress?: string | null
  businessLogo?: string | null
  businessABN?: string | null
  businessPhone?: string | null
  businessEmail?: string | null
}

interface InvoiceLineItem {
  description: string
  category?: string | null
  quantity: number
  unitPrice: number
  subtotal: number
  gstRate: number
  gstAmount: number
  total: number
}

interface InvoicePayment {
  paymentDate: Date
  amount: number
  paymentMethod: string
  reference?: string | null
}

interface InvoiceData {
  invoice: {
    id: string
    invoiceNumber: string
    status: string
    invoiceDate: Date
    dueDate: Date
    paidDate?: Date | null

    // Customer details
    customerName: string
    customerEmail: string
    customerPhone?: string | null
    customerAddress?: string | null
    customerABN?: string | null

    // Financial
    subtotalExGST: number
    gstAmount: number
    totalIncGST: number
    amountPaid: number
    amountDue: number

    // Optional
    notes?: string | null
    terms?: string | null
    footer?: string | null

    // Discounts
    discountAmount?: number | null
    discountPercentage?: number | null
    shippingAmount?: number | null
  }
  lineItems: InvoiceLineItem[]
  payments?: InvoicePayment[]
  businessInfo?: BusinessInfo
}

/**
 * Generate professional invoice PDF
 */
export async function generateInvoicePDF(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()

  // Load fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Brand colors
  const primaryBlue = rgb(0.05, 0.65, 0.91) // #0EA5E9 - Cyan 500
  const darkBlue = rgb(0.0, 0.2, 0.4) // #003366
  const lightBlue = rgb(0.93, 0.97, 1.0) // #EFF6FF - Blue 50
  const green = rgb(0.13, 0.77, 0.47) // #22C55E - Green 500
  const red = rgb(0.94, 0.27, 0.27) // #EF4444 - Red 500
  const amber = rgb(0.98, 0.73, 0.15) // #F59E0B - Amber 500
  const black = rgb(0, 0, 0)
  const white = rgb(1, 1, 1)
  const lightGray = rgb(0.96, 0.96, 0.97) // #F5F5F7
  const darkGray = rgb(0.4, 0.4, 0.46) // #66666B
  const dividerGray = rgb(0.83, 0.83, 0.86) // #D4D4D8

  const colors = { primaryBlue, darkBlue, lightBlue, green, red, amber, black, white, lightGray, darkGray, dividerGray }

  // Load business logo if available
  let logoImage: PDFImage | null = null
  if (data.businessInfo?.businessLogo) {
    try {
      const logoResponse = await fetch(data.businessInfo.businessLogo)
      const logoBuffer = await logoResponse.arrayBuffer()
      const logoUrl = data.businessInfo.businessLogo.toLowerCase()
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
      console.warn('Failed to load business logo:', error)
    }
  }

  // Create invoice page
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  await renderInvoicePage(page, {
    pdfDoc,
    helvetica,
    helveticaBold,
    colors,
    data,
    logoImage
  })

  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}

/**
 * Render the main invoice page
 */
async function renderInvoicePage(
  page: PDFPage,
  options: {
    pdfDoc: PDFDocument
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    data: InvoiceData
    logoImage: PDFImage | null
  }
) {
  const { helvetica, helveticaBold, colors, data, logoImage } = options
  const { width, height } = page.getSize()
  const margin = 50
  let yPosition = height - 50

  // Header Section
  yPosition = await renderHeader(page, {
    helvetica,
    helveticaBold,
    colors,
    logoImage,
    businessInfo: data.businessInfo,
    yPosition,
    width,
    margin
  })

  yPosition -= 40

  // Invoice Title & Number
  page.drawText('INVOICE', {
    x: margin,
    y: yPosition,
    size: 28,
    font: helveticaBold,
    color: colors.primaryBlue
  })

  page.drawText(data.invoice.invoiceNumber, {
    x: width - margin - helvetica.widthOfTextAtSize(data.invoice.invoiceNumber, 16),
    y: yPosition + 5,
    size: 16,
    font: helveticaBold,
    color: colors.darkGray
  })

  yPosition -= 35

  // Divider
  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: width - margin, y: yPosition },
    thickness: 1,
    color: colors.dividerGray
  })

  yPosition -= 25

  // Two-column layout: Business Info & Customer Info
  yPosition = await renderInfoSection(page, {
    helvetica,
    helveticaBold,
    colors,
    businessInfo: data.businessInfo,
    invoice: data.invoice,
    yPosition,
    width,
    margin
  })

  yPosition -= 30

  // Invoice Details (Date, Due Date, Status)
  yPosition = await renderInvoiceDetails(page, {
    helvetica,
    helveticaBold,
    colors,
    invoice: data.invoice,
    yPosition,
    width,
    margin
  })

  yPosition -= 35

  // Line Items Table
  yPosition = await renderLineItemsTable(page, {
    helvetica,
    helveticaBold,
    colors,
    lineItems: data.lineItems,
    yPosition,
    width,
    margin
  })

  yPosition -= 30

  // Totals Section
  yPosition = await renderTotalsSection(page, {
    helvetica,
    helveticaBold,
    colors,
    invoice: data.invoice,
    yPosition,
    width,
    margin
  })

  yPosition -= 30

  // Payments Section (if any)
  if (data.payments && data.payments.length > 0) {
    yPosition = await renderPaymentsSection(page, {
      helvetica,
      helveticaBold,
      colors,
      payments: data.payments,
      yPosition,
      width,
      margin
    })
    yPosition -= 20
  }

  // Notes & Terms
  if (data.invoice.notes || data.invoice.terms) {
    yPosition = await renderNotesAndTerms(page, {
      helvetica,
      helveticaBold,
      colors,
      invoice: data.invoice,
      yPosition,
      width,
      margin
    })
  }

  // Footer
  await renderFooter(page, {
    helvetica,
    helveticaBold,
    colors,
    businessInfo: data.businessInfo,
    invoice: data.invoice,
    width,
    margin
  })
}

/**
 * Render header with logo and business info
 */
async function renderHeader(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    logoImage: PDFImage | null
    businessInfo?: BusinessInfo
    yPosition: number
    width: number
    margin: number
  }
): Promise<number> {
  const { helvetica, helveticaBold, colors, logoImage, businessInfo, width, margin } = options
  let yPosition = options.yPosition

  // Draw logo if available
  if (logoImage) {
    const logoHeight = 60
    const logoScale = logoHeight / logoImage.height
    const logoWidth = logoImage.width * logoScale

    page.drawImage(logoImage, {
      x: margin,
      y: yPosition - logoHeight,
      width: logoWidth,
      height: logoHeight
    })
  } else if (businessInfo?.businessName) {
    // Draw business name as text if no logo
    page.drawText(sanitizeTextForPDF(businessInfo.businessName), {
      x: margin,
      y: yPosition - 10,
      size: 18,
      font: helveticaBold,
      color: colors.primaryBlue
    })
  }

  // Business contact info (right-aligned)
  const rightX = width - margin
  let rightY = yPosition

  if (businessInfo?.businessName) {
    const nameWidth = helveticaBold.widthOfTextAtSize(businessInfo.businessName, 12)
    page.drawText(sanitizeTextForPDF(businessInfo.businessName), {
      x: rightX - nameWidth,
      y: rightY,
      size: 12,
      font: helveticaBold,
      color: colors.darkGray
    })
    rightY -= 15
  }

  if (businessInfo?.businessABN) {
    const abnText = `ABN: ${businessInfo.businessABN}`
    const abnWidth = helvetica.widthOfTextAtSize(abnText, 9)
    page.drawText(sanitizeTextForPDF(abnText), {
      x: rightX - abnWidth,
      y: rightY,
      size: 9,
      font: helvetica,
      color: colors.darkGray
    })
    rightY -= 12
  }

  if (businessInfo?.businessEmail) {
    const emailWidth = helvetica.widthOfTextAtSize(businessInfo.businessEmail, 9)
    page.drawText(sanitizeTextForPDF(businessInfo.businessEmail), {
      x: rightX - emailWidth,
      y: rightY,
      size: 9,
      font: helvetica,
      color: colors.darkGray
    })
    rightY -= 12
  }

  if (businessInfo?.businessPhone) {
    const phoneWidth = helvetica.widthOfTextAtSize(businessInfo.businessPhone, 9)
    page.drawText(sanitizeTextForPDF(businessInfo.businessPhone), {
      x: rightX - phoneWidth,
      y: rightY,
      size: 9,
      font: helvetica,
      color: colors.darkGray
    })
    rightY -= 12
  }

  if (businessInfo?.businessAddress) {
    const addressLines = wrapText(businessInfo.businessAddress, 200, helvetica, 9)
    addressLines.forEach(line => {
      const lineWidth = helvetica.widthOfTextAtSize(line, 9)
      page.drawText(sanitizeTextForPDF(line), {
        x: rightX - lineWidth,
        y: rightY,
        size: 9,
        font: helvetica,
        color: colors.darkGray
      })
      rightY -= 12
    })
  }

  return Math.min(yPosition - 70, rightY - 10)
}

/**
 * Render info section with business and customer details
 */
async function renderInfoSection(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    businessInfo?: BusinessInfo
    invoice: InvoiceData['invoice']
    yPosition: number
    width: number
    margin: number
  }
): Promise<number> {
  const { helvetica, helveticaBold, colors, invoice, width, margin } = options
  let yPosition = options.yPosition

  const columnWidth = (width - 2 * margin - 30) / 2

  // Left column: Bill To
  page.drawText('BILL TO', {
    x: margin,
    y: yPosition,
    size: 10,
    font: helveticaBold,
    color: colors.darkGray
  })

  let leftY = yPosition - 15

  page.drawText(sanitizeTextForPDF(invoice.customerName), {
    x: margin,
    y: leftY,
    size: 11,
    font: helveticaBold,
    color: colors.black
  })
  leftY -= 15

  if (invoice.customerEmail) {
    page.drawText(sanitizeTextForPDF(invoice.customerEmail), {
      x: margin,
      y: leftY,
      size: 9,
      font: helvetica,
      color: colors.darkGray
    })
    leftY -= 12
  }

  if (invoice.customerPhone) {
    page.drawText(sanitizeTextForPDF(invoice.customerPhone), {
      x: margin,
      y: leftY,
      size: 9,
      font: helvetica,
      color: colors.darkGray
    })
    leftY -= 12
  }

  if (invoice.customerAddress) {
    const addressLines = wrapText(invoice.customerAddress, columnWidth, helvetica, 9)
    addressLines.forEach(line => {
      page.drawText(sanitizeTextForPDF(line), {
        x: margin,
        y: leftY,
        size: 9,
        font: helvetica,
        color: colors.darkGray
      })
      leftY -= 12
    })
  }

  if (invoice.customerABN) {
    page.drawText(sanitizeTextForPDF(`ABN: ${invoice.customerABN}`), {
      x: margin,
      y: leftY,
      size: 9,
      font: helvetica,
      color: colors.darkGray
    })
    leftY -= 12
  }

  return Math.min(leftY, yPosition - 80)
}

/**
 * Render invoice details (dates, status)
 */
async function renderInvoiceDetails(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    invoice: InvoiceData['invoice']
    yPosition: number
    width: number
    margin: number
  }
): Promise<number> {
  const { helvetica, helveticaBold, colors, invoice, width, margin } = options
  let yPosition = options.yPosition

  // Background box
  const boxHeight = 80
  page.drawRectangle({
    x: margin,
    y: yPosition - boxHeight,
    width: width - 2 * margin,
    height: boxHeight,
    color: colors.lightBlue
  })

  const detailsX = margin + 15
  let detailsY = yPosition - 20

  // Invoice Date
  page.drawText('Invoice Date:', {
    x: detailsX,
    y: detailsY,
    size: 9,
    font: helveticaBold,
    color: colors.darkGray
  })

  page.drawText(formatDate(invoice.invoiceDate), {
    x: detailsX + 80,
    y: detailsY,
    size: 9,
    font: helvetica,
    color: colors.black
  })

  detailsY -= 18

  // Due Date
  page.drawText('Due Date:', {
    x: detailsX,
    y: detailsY,
    size: 9,
    font: helveticaBold,
    color: colors.darkGray
  })

  const dueDateColor = isOverdue(invoice) ? colors.red : colors.black
  page.drawText(formatDate(invoice.dueDate), {
    x: detailsX + 80,
    y: detailsY,
    size: 9,
    font: helvetica,
    color: dueDateColor
  })

  detailsY -= 18

  // Status Badge
  page.drawText('Status:', {
    x: detailsX,
    y: detailsY,
    size: 9,
    font: helveticaBold,
    color: colors.darkGray
  })

  const statusBadge = getStatusBadge(invoice.status)
  page.drawRectangle({
    x: detailsX + 80,
    y: detailsY - 3,
    width: statusBadge.width,
    height: 16,
    color: statusBadge.bgColor
  })

  page.drawText(statusBadge.text, {
    x: detailsX + 85,
    y: detailsY,
    size: 9,
    font: helveticaBold,
    color: statusBadge.textColor
  })

  return yPosition - boxHeight
}

/**
 * Render line items table
 */
async function renderLineItemsTable(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    lineItems: InvoiceLineItem[]
    yPosition: number
    width: number
    margin: number
  }
): Promise<number> {
  const { helvetica, helveticaBold, colors, lineItems, width, margin } = options
  let yPosition = options.yPosition

  // Table header
  const tableWidth = width - 2 * margin
  const rowHeight = 25

  // Header background
  page.drawRectangle({
    x: margin,
    y: yPosition - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: colors.darkBlue
  })

  // Header text
  const headerY = yPosition - 17
  page.drawText('DESCRIPTION', {
    x: margin + 10,
    y: headerY,
    size: 9,
    font: helveticaBold,
    color: colors.white
  })

  page.drawText('QTY', {
    x: width - margin - 240,
    y: headerY,
    size: 9,
    font: helveticaBold,
    color: colors.white
  })

  page.drawText('RATE', {
    x: width - margin - 180,
    y: headerY,
    size: 9,
    font: helveticaBold,
    color: colors.white
  })

  page.drawText('GST', {
    x: width - margin - 120,
    y: headerY,
    size: 9,
    font: helveticaBold,
    color: colors.white
  })

  page.drawText('AMOUNT', {
    x: width - margin - 70,
    y: headerY,
    size: 9,
    font: helveticaBold,
    color: colors.white
  })

  yPosition -= rowHeight + 5

  // Line items
  lineItems.forEach((item, index) => {
    const isEven = index % 2 === 0
    const itemRowHeight = 30

    // Alternating row background
    if (isEven) {
      page.drawRectangle({
        x: margin,
        y: yPosition - itemRowHeight,
        width: tableWidth,
        height: itemRowHeight,
        color: colors.lightGray
      })
    }

    const itemY = yPosition - 12

    // Description
    const descLines = wrapText(item.description, 280, helvetica, 9)
    descLines.slice(0, 2).forEach((line, i) => {
      page.drawText(sanitizeTextForPDF(line), {
        x: margin + 10,
        y: itemY - (i * 11),
        size: 9,
        font: helvetica,
        color: colors.black
      })
    })

    // Quantity
    page.drawText(item.quantity.toString(), {
      x: width - margin - 240,
      y: itemY,
      size: 9,
      font: helvetica,
      color: colors.black
    })

    // Unit Price
    page.drawText(formatCurrency(item.unitPrice), {
      x: width - margin - 180,
      y: itemY,
      size: 9,
      font: helvetica,
      color: colors.black
    })

    // GST
    page.drawText(formatCurrency(item.gstAmount), {
      x: width - margin - 120,
      y: itemY,
      size: 9,
      font: helvetica,
      color: colors.black
    })

    // Total
    page.drawText(formatCurrency(item.total), {
      x: width - margin - 70,
      y: itemY,
      size: 9,
      font: helveticaBold,
      color: colors.black
    })

    yPosition -= itemRowHeight

    // Divider line
    page.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: width - margin, y: yPosition },
      thickness: 0.5,
      color: colors.dividerGray
    })
  })

  return yPosition
}

/**
 * Render totals section
 */
async function renderTotalsSection(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    invoice: InvoiceData['invoice']
    yPosition: number
    width: number
    margin: number
  }
): Promise<number> {
  const { helvetica, helveticaBold, colors, invoice, width, margin } = options
  let yPosition = options.yPosition

  const totalsX = width - margin - 200

  // Subtotal
  page.drawText('Subtotal (Ex GST):', {
    x: totalsX,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: colors.darkGray
  })

  page.drawText(formatCurrency(invoice.subtotalExGST), {
    x: width - margin - 70,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: colors.black
  })

  yPosition -= 18

  // GST
  page.drawText('GST (10%):', {
    x: totalsX,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: colors.darkGray
  })

  page.drawText(formatCurrency(invoice.gstAmount), {
    x: width - margin - 70,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: colors.black
  })

  yPosition -= 18

  // Discount (if any)
  if (invoice.discountAmount && invoice.discountAmount > 0) {
    page.drawText('Discount:', {
      x: totalsX,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.darkGray
    })

    page.drawText(`-${formatCurrency(invoice.discountAmount)}`, {
      x: width - margin - 70,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.red
    })

    yPosition -= 18
  }

  // Shipping (if any)
  if (invoice.shippingAmount && invoice.shippingAmount > 0) {
    page.drawText('Shipping:', {
      x: totalsX,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.darkGray
    })

    page.drawText(formatCurrency(invoice.shippingAmount), {
      x: width - margin - 70,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.black
    })

    yPosition -= 18
  }

  yPosition -= 5

  // Divider line
  page.drawLine({
    start: { x: totalsX, y: yPosition },
    end: { x: width - margin, y: yPosition },
    thickness: 1,
    color: colors.dividerGray
  })

  yPosition -= 20

  // Total
  page.drawRectangle({
    x: totalsX - 10,
    y: yPosition - 5,
    width: 210,
    height: 30,
    color: colors.primaryBlue
  })

  page.drawText('TOTAL (Inc GST):', {
    x: totalsX,
    y: yPosition + 5,
    size: 12,
    font: helveticaBold,
    color: colors.white
  })

  page.drawText(formatCurrency(invoice.totalIncGST), {
    x: width - margin - 70,
    y: yPosition + 5,
    size: 12,
    font: helveticaBold,
    color: colors.white
  })

  yPosition -= 35

  // Amount Paid (if any)
  if (invoice.amountPaid > 0) {
    page.drawText('Amount Paid:', {
      x: totalsX,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.darkGray
    })

    page.drawText(formatCurrency(invoice.amountPaid), {
      x: width - margin - 70,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.green
    })

    yPosition -= 18
  }

  // Amount Due
  page.drawText('Amount Due:', {
    x: totalsX,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: colors.darkGray
  })

  const dueColor = invoice.amountDue > 0 ? colors.red : colors.green
  page.drawText(formatCurrency(invoice.amountDue), {
    x: width - margin - 70,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: dueColor
  })

  return yPosition - 10
}

/**
 * Render payments section
 */
async function renderPaymentsSection(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    payments: InvoicePayment[]
    yPosition: number
    width: number
    margin: number
  }
): Promise<number> {
  const { helvetica, helveticaBold, colors, payments, width, margin } = options
  let yPosition = options.yPosition

  page.drawText('PAYMENTS RECEIVED', {
    x: margin,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: colors.darkGray
  })

  yPosition -= 20

  payments.forEach(payment => {
    page.drawText(formatDate(payment.paymentDate), {
      x: margin + 10,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: colors.black
    })

    page.drawText(payment.paymentMethod, {
      x: margin + 120,
      y: yPosition,
      size: 9,
      font: helvetica,
      color: colors.darkGray
    })

    if (payment.reference) {
      page.drawText(sanitizeTextForPDF(payment.reference), {
        x: margin + 220,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: colors.darkGray
      })
    }

    page.drawText(formatCurrency(payment.amount), {
      x: width - margin - 70,
      y: yPosition,
      size: 9,
      font: helveticaBold,
      color: colors.green
    })

    yPosition -= 15
  })

  return yPosition
}

/**
 * Render notes and terms
 */
async function renderNotesAndTerms(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    invoice: InvoiceData['invoice']
    yPosition: number
    width: number
    margin: number
  }
): Promise<number> {
  const { helvetica, helveticaBold, colors, invoice, width, margin } = options
  let yPosition = options.yPosition

  if (invoice.notes) {
    page.drawText('NOTES', {
      x: margin,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: colors.darkGray
    })

    yPosition -= 15

    const notesLines = wrapText(invoice.notes, width - 2 * margin, helvetica, 9)
    notesLines.forEach(line => {
      if (yPosition < 100) return
      page.drawText(sanitizeTextForPDF(line), {
        x: margin,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: colors.black
      })
      yPosition -= 12
    })

    yPosition -= 10
  }

  if (invoice.terms) {
    page.drawText('PAYMENT TERMS', {
      x: margin,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: colors.darkGray
    })

    yPosition -= 15

    const termsLines = wrapText(invoice.terms, width - 2 * margin, helvetica, 9)
    termsLines.forEach(line => {
      if (yPosition < 100) return
      page.drawText(sanitizeTextForPDF(line), {
        x: margin,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: colors.black
      })
      yPosition -= 12
    })
  }

  return yPosition
}

/**
 * Render footer
 */
async function renderFooter(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    businessInfo?: BusinessInfo
    invoice: InvoiceData['invoice']
    width: number
    margin: number
  }
) {
  const { helvetica, colors, invoice, width, margin } = options
  const { height } = page.getSize()

  // Footer divider
  page.drawLine({
    start: { x: margin, y: 60 },
    end: { x: width - margin, y: 60 },
    thickness: 0.5,
    color: colors.dividerGray
  })

  // Footer text
  let footerText = 'Thank you for your business!'
  if (invoice.footer) {
    footerText = invoice.footer
  }

  const footerLines = wrapText(footerText, width - 2 * margin, helvetica, 8)
  let footerY = 50

  footerLines.forEach(line => {
    const lineWidth = helvetica.widthOfTextAtSize(line, 8)
    page.drawText(sanitizeTextForPDF(line), {
      x: (width - lineWidth) / 2,
      y: footerY,
      size: 8,
      font: helvetica,
      color: colors.darkGray
    })
    footerY -= 10
  })

  // Page number
  page.drawText('Page 1 of 1', {
    x: width - margin - 60,
    y: 30,
    size: 8,
    font: helvetica,
    color: colors.darkGray
  })
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format cents to currency string
 */
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Format date to Australian format
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

/**
 * Check if invoice is overdue
 */
function isOverdue(invoice: InvoiceData['invoice']): boolean {
  if (invoice.status === 'PAID') return false
  return new Date(invoice.dueDate) < new Date()
}

/**
 * Get status badge styling
 */
function getStatusBadge(status: string): {
  text: string
  bgColor: any
  textColor: any
  width: number
} {
  const statusMap: Record<string, any> = {
    DRAFT: { text: 'DRAFT', bgColor: rgb(0.83, 0.83, 0.86), textColor: rgb(0.4, 0.4, 0.46), width: 60 },
    SENT: { text: 'SENT', bgColor: rgb(0.59, 0.77, 0.95), textColor: rgb(0.05, 0.32, 0.66), width: 50 },
    VIEWED: { text: 'VIEWED', bgColor: rgb(0.75, 0.65, 0.96), textColor: rgb(0.42, 0.24, 0.7), width: 60 },
    PARTIALLY_PAID: { text: 'PART PAID', bgColor: rgb(0.98, 0.73, 0.15), textColor: rgb(0.45, 0.26, 0.0), width: 80 },
    PAID: { text: 'PAID', bgColor: rgb(0.13, 0.77, 0.47), textColor: rgb(1, 1, 1), width: 50 },
    OVERDUE: { text: 'OVERDUE', bgColor: rgb(0.94, 0.27, 0.27), textColor: rgb(1, 1, 1), width: 70 },
    CANCELLED: { text: 'CANCELLED', bgColor: rgb(0.83, 0.83, 0.86), textColor: rgb(0.4, 0.4, 0.46), width: 80 }
  }

  return statusMap[status] || statusMap.DRAFT
}

/**
 * Wrap text to fit within width
 */
function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const testWidth = font.widthOfTextAtSize(testLine, fontSize)

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

/**
 * Sanitize text for PDF (remove special characters)
 */
function sanitizeTextForPDF(text: string): string {
  // Replace smart quotes and other problematic characters
  return text
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/[\u2013\u2014]/g, '-') // En/Em dashes
    .replace(/[\u2026]/g, '...') // Ellipsis
    .replace(/[\u00A0]/g, ' ') // Non-breaking space
    .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII
}
