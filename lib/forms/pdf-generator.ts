/**
 * Form PDF Generator
 * Generates professional PDF documents from form submissions
 */

import { PDFDocument, PDFPage, rgb, PDFFont } from 'pdf-lib'
import { FormSchema, FormField, FormSection } from './form-types'

export interface PDFGeneratorOptions {
  title?: string
  includeWatermark?: boolean
  watermarkText?: string
  includeSignatures?: boolean
  includeSubmissionDate?: boolean
  brandColor?: { r: number; g: number; b: number }
  pageSize?: 'LETTER' | 'A4'
  includePageNumbers?: boolean
}

interface PageContext {
  page: PDFPage
  yPosition: number
  leftMargin: number
  rightMargin: number
  maxWidth: number
  font: PDFFont
  boldFont: PDFFont
}

const DEFAULT_OPTIONS: PDFGeneratorOptions = {
  title: 'Form Submission',
  includeWatermark: false,
  includeSignatures: true,
  includeSubmissionDate: true,
  brandColor: { r: 59, g: 130, b: 246 }, // Blue-600
  pageSize: 'LETTER',
  includePageNumbers: true,
}

const MARGINS = {
  top: 40,
  bottom: 40,
  left: 40,
  right: 40,
}

const PAGE_SIZES = {
  LETTER: { width: 612, height: 792 },
  A4: { width: 595, height: 842 },
}

/**
 * Generate PDF from form schema and data
 */
export async function generateFormPDF(
  formSchema: FormSchema,
  formData: Record<string, any>,
  options: PDFGeneratorOptions = {},
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const pageSize = PAGE_SIZES[opts.pageSize || 'LETTER']

  // Create PDF document
  const pdfDoc = await PDFDocument.create()

  // Embed fonts
  const font = await pdfDoc.embedFont(PDFDocument.Fonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(PDFDocument.Fonts.HelveticaBold)

  // Create first page
  let currentPage = pdfDoc.addPage([pageSize.width, pageSize.height])
  let pageCount = 1
  let yPosition = pageSize.height - MARGINS.top

  const context: PageContext = {
    page: currentPage,
    yPosition,
    leftMargin: MARGINS.left,
    rightMargin: pageSize.width - MARGINS.right,
    maxWidth: pageSize.width - MARGINS.left - MARGINS.right,
    font,
    boldFont,
  }

  // Draw header
  yPosition = drawHeader(currentPage, context, opts, formSchema.formType)
  context.yPosition = yPosition

  // Draw sections
  for (const section of formSchema.sections) {
    const sectionHeight = calculateSectionHeight(section, formData, context)
    const availableHeight = pageSize.height - MARGINS.top - MARGINS.bottom

    // Check if section fits on current page
    if (context.yPosition - sectionHeight < MARGINS.bottom) {
      // Add new page
      currentPage = pdfDoc.addPage([pageSize.width, pageSize.height])
      pageCount++
      context.page = currentPage
      context.yPosition = pageSize.height - MARGINS.top

      if (opts.includePageNumbers) {
        drawPageNumber(context, pageCount)
      }
    }

    // Draw section
    drawSection(context, section, formData, opts)
  }

  // Add watermark if requested
  if (opts.includeWatermark) {
    addWatermark(pdfDoc, opts.watermarkText || 'DRAFT')
  }

  // Add page numbers to all pages if not already added
  if (opts.includePageNumbers && pageCount > 1) {
    const pages = pdfDoc.getPages()
    for (let i = 0; i < pages.length; i++) {
      if (i === pages.length - 1) continue // Skip last page (already numbered)
      drawPageNumber(
        { ...context, page: pages[i], yPosition: pageSize.height - MARGINS.bottom + 10 },
        i + 1,
      )
    }
  }

  // Generate PDF buffer
  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}

/**
 * Draw header with title and date
 */
function drawHeader(
  page: PDFPage,
  context: PageContext,
  options: PDFGeneratorOptions,
  formType: string,
): number {
  let yPos = context.yPosition

  // Title
  page.drawText(options.title || 'Form Submission', {
    x: context.leftMargin,
    y: yPos,
    size: 24,
    font: context.boldFont,
    color: options.brandColor ? rgb(options.brandColor.r / 255, options.brandColor.g / 255, options.brandColor.b / 255) : rgb(0, 0, 0),
  })

  yPos -= 30

  // Form type and date
  const dateStr = options.includeSubmissionDate ? new Date().toLocaleDateString() : ''
  const subheader = `${formType}${dateStr ? ` • ${dateStr}` : ''}`

  page.drawText(subheader, {
    x: context.leftMargin,
    y: yPos,
    size: 10,
    font: context.font,
    color: rgb(0.4, 0.4, 0.4),
  })

  yPos -= 20
  return yPos
}

/**
 * Draw a form section with fields
 */
function drawSection(
  context: PageContext,
  section: FormSection,
  formData: Record<string, any>,
  options: PDFGeneratorOptions,
): void {
  // Section title
  context.page.drawText(section.title, {
    x: context.leftMargin,
    y: context.yPosition,
    size: 14,
    font: context.boldFont,
    color: options.brandColor ? rgb(options.brandColor.r / 255, options.brandColor.g / 255, options.brandColor.b / 255) : rgb(0, 0, 0),
  })

  context.yPosition -= 20

  // Section description
  if (section.description) {
    drawWrappedText(context, section.description, 10, rgb(0.5, 0.5, 0.5))
    context.yPosition -= 10
  }

  // Draw fields
  for (const field of section.fields) {
    drawField(context, field, formData[field.id])
    context.yPosition -= 10
  }

  context.yPosition -= 10 // Extra spacing after section
}

/**
 * Draw a single form field
 */
function drawField(context: PageContext, field: FormField, value: any): void {
  const valueStr = formatFieldValue(value, field.type)

  // Field label
  context.page.drawText(field.label, {
    x: context.leftMargin,
    y: context.yPosition,
    size: 11,
    font: context.boldFont,
    color: rgb(0, 0, 0),
  })

  context.yPosition -= 14

  // Field value
  if (valueStr) {
    if (valueStr.length > 80) {
      // Wrap long values
      drawWrappedText(context, valueStr, 10, rgb(0.2, 0.2, 0.2), 3)
    } else {
      context.page.drawText(valueStr, {
        x: context.leftMargin + 10,
        y: context.yPosition,
        size: 10,
        font: context.font,
        color: rgb(0.2, 0.2, 0.2),
      })
      context.yPosition -= 12
    }
  } else {
    // Empty field indicator
    context.page.drawText('[Not provided]', {
      x: context.leftMargin + 10,
      y: context.yPosition,
      size: 9,
      font: context.font,
      color: rgb(0.7, 0.7, 0.7),
    })
    context.yPosition -= 12
  }
}

/**
 * Draw text with word wrapping
 */
function drawWrappedText(
  context: PageContext,
  text: string,
  fontSize: number,
  color: any,
  maxLines?: number,
): number {
  const lines = wrapText(text, context.maxWidth, fontSize, context.font)
  const limitedLines = maxLines ? lines.slice(0, maxLines) : lines

  let lineCount = 0
  for (const line of limitedLines) {
    context.page.drawText(line, {
      x: context.leftMargin + 10,
      y: context.yPosition,
      size: fontSize,
      font: context.font,
      color,
    })
    context.yPosition -= fontSize + 4
    lineCount++
  }

  return lineCount
}

/**
 * Wrap text to fit within max width
 */
function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    // Approximate character width (varies by font, using average)
    const charWidth = (fontSize * 0.5)
    const lineWidth = testLine.length * charWidth

    if (lineWidth < maxWidth) {
      currentLine = testLine
    } else {
      if (currentLine) {
        lines.push(currentLine)
      }
      currentLine = word
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

/**
 * Format field value for display
 */
function formatFieldValue(value: any, fieldType: string): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  if (fieldType === 'date' && value instanceof Date) {
    return value.toLocaleDateString()
  }

  if (fieldType === 'datetime' && value instanceof Date) {
    return value.toLocaleString()
  }

  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Calculate section height for pagination
 */
function calculateSectionHeight(section: FormSection, formData: Record<string, any>, context: PageContext): number {
  let height = 30 // Title

  if (section.description) {
    height += 20
  }

  for (const field of section.fields) {
    const valueStr = formatFieldValue(formData[field.id], field.type)
    height += 14 // Label
    height += valueStr ? 12 : 12 // Value
    height += 10 // Spacing
  }

  height += 10 // Extra spacing

  return height
}

/**
 * Add watermark to PDF
 */
function addWatermark(pdfDoc: PDFDocument, text: string): void {
  const pages = pdfDoc.getPages()
  const fontSize = 60
  const color = rgb(0.9, 0.9, 0.9)

  for (const page of pages) {
    const { width, height } = page.getSize()

    // Draw diagonal watermark text
    page.drawText(text, {
      x: width / 2 - 100,
      y: height / 2,
      size: fontSize,
      font: PDFDocument.Fonts.HelveticaBold,
      color,
      opacity: 0.3,
    })
  }
}

/**
 * Draw page number
 */
function drawPageNumber(context: PageContext, pageNumber: number): void {
  context.page.drawText(`Page ${pageNumber}`, {
    x: context.rightMargin - 50,
    y: context.yPosition,
    size: 9,
    font: context.font,
    color: rgb(0.6, 0.6, 0.6),
  })
}

/**
 * Embed signature image into PDF
 */
export async function embedSignatureImage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  x: number,
  y: number,
  signatureData: string, // Base64-encoded PNG
): Promise<void> {
  try {
    // signatureData is already a data URL or Base64
    // We need to convert it to bytes
    let base64Data = signatureData
    if (signatureData.includes('data:')) {
      // Extract base64 from data URL
      base64Data = signatureData.split(',')[1]
    }

    const imageBytes = Buffer.from(base64Data, 'base64')
    const image = await pdfDoc.embedPng(imageBytes)

    page.drawImage(image, {
      x,
      y,
      width: 150,
      height: 75,
    })
  } catch (error) {
    console.error('Error embedding signature:', error)
  }
}
