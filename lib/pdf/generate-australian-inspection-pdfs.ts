/**
 * Australian Inspection Report - Multi-Stakeholder PDF Generator
 *
 * Generates three separate PDF variants optimized for different stakeholders:
 * 1. Insurance/Adjuster PDF - Full technical details, all data
 * 2. Client/Property Owner PDF - Simplified, non-technical language
 * 3. Internal/Technician PDF - Operational details, scope of works, profit margins
 *
 * All PDFs include:
 * - IICRC S500 water damage classification
 * - GST breakdown (Australian 10% tax)
 * - State-specific compliance requirements
 * - Regulatory citations (if enabled)
 * - Professional formatting with business branding
 */

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'

/**
 * Form submission data structure
 */
export interface FormSubmissionData {
  id?: string
  formTemplateId?: string
  submissionData: Record<string, any>
  userId?: string
  createdAt?: string
}

/**
 * PDF generation options
 */
export interface InspectionPDFOptions {
  /** Business information for branding */
  businessName?: string
  businessAddress?: string
  businessPhone?: string
  businessEmail?: string
  businessABN?: string
  businessLogo?: string

  /** State/territory for compliance requirements */
  state?: string
  postcode?: string

  /** Include regulatory citations section */
  includeRegulatoryCitations?: boolean

  /** Custom header text */
  customHeader?: string

  /** Report reference/job number */
  reportReference?: string
  reportDate?: Date
}

/**
 * Multi-PDF result containing URLs for all stakeholder variants
 */
export interface AustralianInspectionPDFs {
  insurerPdfUrl?: string
  insurerPdfBuffer?: Uint8Array

  clientPdfUrl?: string
  clientPdfBuffer?: Uint8Array

  internalPdfUrl?: string
  internalPdfBuffer?: Uint8Array

  status: 'success' | 'partial' | 'error'
  message?: string
  generatedAt: Date
}

/**
 * Extract specific field from form submission data
 */
function getFieldValue(data: Record<string, any>, fieldId: string): any {
  return data[fieldId] ?? null
}

/**
 * Format AUD currency
 */
function formatAUD(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(value)
}

/**
 * Calculate GST breakdown
 */
function calculateGST(subtotal: number, gstRate: number = 0.10) {
  const gstAmount = subtotal * gstRate
  const total = subtotal + gstAmount
  return { subtotal, gstAmount, total, gstRate }
}

/**
 * Generate Insurance/Adjuster PDF (Full Technical Details)
 */
async function generateInsurerPDF(
  formData: Record<string, any>,
  options: InspectionPDFOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Color scheme
  const darkBlue = rgb(0.0, 0.2, 0.4)
  const lightBlue = rgb(0.2, 0.4, 0.6)
  const red = rgb(0.8, 0.1, 0.1)
  const green = rgb(0.1, 0.6, 0.3)
  const black = rgb(0, 0, 0)
  const white = rgb(1, 1, 1)
  const lightGray = rgb(0.95, 0.95, 0.95)

  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()

  let yPosition = height - 40

  // Header
  page.drawRectangle({
    x: 0,
    y: yPosition - 40,
    width: width,
    height: 40,
    color: darkBlue,
  })

  page.drawText('Insurance/Adjuster Report', {
    x: 40,
    y: yPosition - 30,
    size: 20,
    font: helveticaBold,
    color: white,
  })

  yPosition -= 60

  // Report Details
  page.drawText('Report Reference:', { x: 40, y: yPosition, size: 10, font: helveticaBold, color: darkBlue })
  page.drawText(options.reportReference || 'N/A', { x: 150, y: yPosition, size: 10, font: helvetica })
  yPosition -= 20

  page.drawText('Generated:', { x: 40, y: yPosition, size: 10, font: helveticaBold, color: darkBlue })
  page.drawText((options.reportDate || new Date()).toLocaleDateString('en-AU'), {
    x: 150,
    y: yPosition,
    size: 10,
    font: helvetica,
  })
  yPosition -= 30

  // Property Details
  const propertyType = getFieldValue(formData, 'property_type')
  const address = getFieldValue(formData, 'property_address')
  const postcode = getFieldValue(formData, 'postcode')
  const state = getFieldValue(formData, 'state_territory') || options.state

  page.drawText('Property Details', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  if (address) {
    page.drawText(`Address: ${address}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }
  if (propertyType) {
    page.drawText(`Type: ${propertyType}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }
  if (postcode) {
    page.drawText(`Postcode: ${postcode}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }
  if (state) {
    page.drawText(`State: ${state}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  yPosition -= 15

  // Water Classification (Insurance needs full technical details)
  const waterSource = getFieldValue(formData, 'water_source')
  const waterCategory = getFieldValue(formData, 'water_category')
  const waterClass = getFieldValue(formData, 'water_class')
  const affectedArea = getFieldValue(formData, 'affected_area_square_footage')
  const ceilingHeight = getFieldValue(formData, 'ceiling_height_meters')

  page.drawText('Water Damage Classification (IICRC S500)', {
    x: 40,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  })
  yPosition -= 15

  if (waterSource)
    page.drawText(`Water Source: ${waterSource}`, { x: 40, y: yPosition, size: 10 })
  yPosition -= 12
  if (waterCategory)
    page.drawText(`Category: ${waterCategory}`, { x: 40, y: yPosition, size: 10 })
  yPosition -= 12
  if (waterClass)
    page.drawText(`Class: ${waterClass}`, { x: 40, y: yPosition, size: 10 })
  yPosition -= 12
  if (affectedArea)
    page.drawText(`Affected Area: ${affectedArea} m²`, { x: 40, y: yPosition, size: 10 })
  yPosition -= 12
  if (ceilingHeight)
    page.drawText(`Ceiling Height: ${ceilingHeight} m`, { x: 40, y: yPosition, size: 10 })
  yPosition -= 20

  // Cost Breakdown (Insurance needs full details)
  const subtotalExGST =
    (getFieldValue(formData, 'labour_cost') ?? 0) +
    (getFieldValue(formData, 'equipment_rental_cost') ?? 0) +
    (getFieldValue(formData, 'materials_cost') ?? 0) +
    (getFieldValue(formData, 'subcontractor_cost') ?? 0) +
    (getFieldValue(formData, 'travel_logistics_cost') ?? 0) +
    (getFieldValue(formData, 'waste_removal_cost') ?? 0)

  const gst = calculateGST(subtotalExGST)

  page.drawText('Cost Breakdown', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  page.drawRectangle({ x: 40, y: yPosition - 100, width: 515, height: 100, borderColor: lightGray, borderWidth: 1 })

  page.drawText(`Labour:           ${formatAUD(getFieldValue(formData, 'labour_cost') ?? 0)}`, {
    x: 50,
    y: yPosition - 15,
    size: 9,
  })
  page.drawText(
    `Equipment:        ${formatAUD(getFieldValue(formData, 'equipment_rental_cost') ?? 0)}`,
    { x: 50, y: yPosition - 30, size: 9 }
  )
  page.drawText(
    `Materials:        ${formatAUD(getFieldValue(formData, 'materials_cost') ?? 0)}`,
    { x: 50, y: yPosition - 45, size: 9 }
  )
  page.drawText(`Subtotal (Ex GST): ${formatAUD(gst.subtotal)}`, {
    x: 50,
    y: yPosition - 60,
    size: 9,
    font: helveticaBold,
  })
  page.drawText(`GST (10%):        ${formatAUD(gst.gstAmount)}`, {
    x: 50,
    y: yPosition - 75,
    size: 9,
    font: helveticaBold,
  })
  page.drawText(`Total (Inc GST):  ${formatAUD(gst.total)}`, {
    x: 50,
    y: yPosition - 90,
    size: 9,
    font: helveticaBold,
    color: green,
  })

  yPosition -= 120

  // Compliance & Standards (Insurance needs this)
  const iicrcCompliance = getFieldValue(formData, 'iicrc_s500_compliance')
  const bca = getFieldValue(formData, 'bca_compliance_required')

  page.drawText('Compliance Requirements', {
    x: 40,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  })
  yPosition -= 15

  if (iicrcCompliance) {
    page.drawText(`IICRC S500: ${iicrcCompliance}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }
  if (bca) {
    page.drawText(`BCA Compliance: ${bca}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  // Footer
  page.drawText(options.businessName || 'Restoration Services', {
    x: 40,
    y: 20,
    size: 9,
    color: darkGray,
  })

  return pdfDoc.save()
}

/**
 * Generate Client/Property Owner PDF (Simplified, Non-Technical)
 */
async function generateClientPDF(
  formData: Record<string, any>,
  options: InspectionPDFOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const darkBlue = rgb(0.0, 0.2, 0.4)
  const green = rgb(0.1, 0.6, 0.3)
  const black = rgb(0, 0, 0)
  const white = rgb(1, 1, 1)
  const lightGray = rgb(0.95, 0.95, 0.95)
  const darkGray = rgb(0.3, 0.3, 0.3)

  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()

  let yPosition = height - 40

  // Header
  page.drawRectangle({
    x: 0,
    y: yPosition - 40,
    width: width,
    height: 40,
    color: darkBlue,
  })

  page.drawText('Your Inspection Report', {
    x: 40,
    y: yPosition - 30,
    size: 20,
    font: helveticaBold,
    color: white,
  })

  yPosition -= 60

  // Simple message to client
  page.drawText('Thank you for choosing our services.', {
    x: 40,
    y: yPosition,
    size: 11,
    font: helvetica,
  })
  yPosition -= 18

  page.drawText('Below is a summary of the inspection completed at your property.', {
    x: 40,
    y: yPosition,
    size: 11,
    font: helvetica,
  })

  yPosition -= 30

  // Property Details (simplified for client)
  const address = getFieldValue(formData, 'property_address')
  const inspectionDate = options.reportDate || new Date()

  page.drawText('Inspection Summary', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  if (address) {
    page.drawText(`Property: ${address}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  page.drawText(`Date: ${inspectionDate.toLocaleDateString('en-AU', { day: 'long', month: 'long', year: 'numeric' })}`, {
    x: 40,
    y: yPosition,
    size: 10,
  })
  yPosition -= 20

  // What we found (simplified)
  const waterSource = getFieldValue(formData, 'water_source')

  page.drawText('What We Found', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  if (waterSource) {
    page.drawText(`Water source identified: ${waterSource}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  const affectedArea = getFieldValue(formData, 'affected_area_square_footage')
  if (affectedArea) {
    page.drawText(`Affected area: approximately ${affectedArea} m²`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  yPosition -= 15

  // Next Steps
  page.drawText('Next Steps', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  page.drawText('Our team will contact you within 24 hours to discuss the recommended restoration plan', {
    x: 40,
    y: yPosition,
    size: 10,
  })
  yPosition -= 18

  page.drawText('and cost estimate.', { x: 40, y: yPosition, size: 10 })
  yPosition -= 18

  // Cost Info (Simplified - just total)
  const subtotalExGST =
    (getFieldValue(formData, 'labour_cost') ?? 0) +
    (getFieldValue(formData, 'equipment_rental_cost') ?? 0) +
    (getFieldValue(formData, 'materials_cost') ?? 0) +
    (getFieldValue(formData, 'subcontractor_cost') ?? 0) +
    (getFieldValue(formData, 'travel_logistics_cost') ?? 0) +
    (getFieldValue(formData, 'waste_removal_cost') ?? 0)

  const gst = calculateGST(subtotalExGST)

  page.drawRectangle({
    x: 40,
    y: yPosition - 50,
    width: 515,
    height: 50,
    color: lightGray,
    borderColor: darkBlue,
    borderWidth: 1,
  })

  page.drawText('Estimated Cost:', { x: 50, y: yPosition - 20, size: 11, font: helveticaBold })
  page.drawText(formatAUD(gst.total), { x: 50, y: yPosition - 35, size: 14, font: helveticaBold, color: green })

  yPosition -= 70

  // Contact
  page.drawText('Contact Us', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  if (options.businessPhone) {
    page.drawText(`Phone: ${options.businessPhone}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }
  if (options.businessEmail) {
    page.drawText(`Email: ${options.businessEmail}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  // Footer
  page.drawText('We appreciate your business and look forward to restoring your property to its original condition.', {
    x: 40,
    y: 30,
    size: 9,
    color: darkGray,
  })

  return pdfDoc.save()
}

/**
 * Generate Internal/Technician PDF (Operational, Scope of Works, Profit Margins)
 */
async function generateInternalPDF(
  formData: Record<string, any>,
  options: InspectionPDFOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const darkBlue = rgb(0.0, 0.2, 0.4)
  const orange = rgb(1, 0.65, 0)
  const green = rgb(0.1, 0.6, 0.3)
  const black = rgb(0, 0, 0)
  const white = rgb(1, 1, 1)
  const lightGray = rgb(0.95, 0.95, 0.95)
  const darkGray = rgb(0.3, 0.3, 0.3)

  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()

  let yPosition = height - 40

  // Header
  page.drawRectangle({
    x: 0,
    y: yPosition - 40,
    width: width,
    height: 40,
    color: darkBlue,
  })

  page.drawText('Internal Job Sheet - Scope of Works', {
    x: 40,
    y: yPosition - 30,
    size: 20,
    font: helveticaBold,
    color: white,
  })

  yPosition -= 60

  // Job Reference
  page.drawText('Job Reference:', { x: 40, y: yPosition, size: 10, font: helveticaBold, color: darkBlue })
  page.drawText(options.reportReference || 'N/A', { x: 150, y: yPosition, size: 10 })
  yPosition -= 20

  // Property Address
  const address = getFieldValue(formData, 'property_address')
  if (address) {
    page.drawText('Site Address:', { x: 40, y: yPosition, size: 10, font: helveticaBold, color: darkBlue })
    page.drawText(address, { x: 150, y: yPosition, size: 10 })
    yPosition -= 20
  }

  // IICRC Classification (Technical for internal team)
  const waterClass = getFieldValue(formData, 'water_class')
  const affectedArea = getFieldValue(formData, 'affected_area_square_footage')

  page.drawText('Damage Assessment', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  if (waterClass) {
    page.drawText(`Water Class: ${waterClass}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }
  if (affectedArea) {
    page.drawText(`Affected Area: ${affectedArea} m²`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  yPosition -= 15

  // Equipment Deployment
  const equipment = getFieldValue(formData, 'equipment_recommendations')

  page.drawText('Equipment Required', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  if (equipment) {
    page.drawText(`${equipment}`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  yPosition -= 15

  // Cost & Profitability (Internal only - includes margins)
  const labourCost = getFieldValue(formData, 'labour_cost') ?? 0
  const equipmentCost = getFieldValue(formData, 'equipment_rental_cost') ?? 0
  const materialsCost = getFieldValue(formData, 'materials_cost') ?? 0
  const subcontractorCost = getFieldValue(formData, 'subcontractor_cost') ?? 0
  const travelCost = getFieldValue(formData, 'travel_logistics_cost') ?? 0
  const wasteCost = getFieldValue(formData, 'waste_removal_cost') ?? 0

  const totalCosts = labourCost + equipmentCost + materialsCost + subcontractorCost + travelCost + wasteCost
  const targetMargin = 0.35 // 35% profit margin target
  const suggestedPrice = totalCosts / (1 - targetMargin)
  const projectedProfit = suggestedPrice - totalCosts

  page.drawText('Cost & Profitability Analysis', {
    x: 40,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: orange,
  })
  yPosition -= 15

  page.drawRectangle({ x: 40, y: yPosition - 100, width: 515, height: 100, borderColor: lightGray, borderWidth: 1 })

  page.drawText(`Labour:             ${formatAUD(labourCost)}`, { x: 50, y: yPosition - 15, size: 9 })
  page.drawText(`Equipment:          ${formatAUD(equipmentCost)}`, { x: 50, y: yPosition - 30, size: 9 })
  page.drawText(`Materials:          ${formatAUD(materialsCost)}`, { x: 50, y: yPosition - 45, size: 9 })
  page.drawText(`Total Direct Costs: ${formatAUD(totalCosts)}`, { x: 50, y: yPosition - 60, size: 9, font: helveticaBold })
  page.drawText(`Suggested Price:    ${formatAUD(suggestedPrice)}`, { x: 50, y: yPosition - 75, size: 9, font: helveticaBold })
  page.drawText(`Projected Profit:   ${formatAUD(projectedProfit)}`, {
    x: 50,
    y: yPosition - 90,
    size: 9,
    font: helveticaBold,
    color: green,
  })

  yPosition -= 120

  // Timeline (Internal)
  const dryingTimeline = getFieldValue(formData, 'drying_timeline_days')

  page.drawText('Drying Timeline', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  if (dryingTimeline) {
    page.drawText(`Estimated Duration: ${dryingTimeline} days`, { x: 40, y: yPosition, size: 10 })
    yPosition -= 12
  }

  yPosition -= 15

  // Notes Section
  page.drawText('Team Notes', { x: 40, y: yPosition, size: 12, font: helveticaBold, color: darkBlue })
  yPosition -= 15

  page.drawRectangle({ x: 40, y: 100, width: 515, height: yPosition - 100, borderColor: lightGray, borderWidth: 1 })

  page.drawText('[Space for site-specific notes and instructions]', {
    x: 50,
    y: yPosition - 15,
    size: 9,
    color: darkGray,
  })

  // Footer
  page.drawText('CONFIDENTIAL - FOR INTERNAL USE ONLY', {
    x: 40,
    y: 20,
    size: 9,
    color: darkGray,
    font: helveticaBold,
  })

  return pdfDoc.save()
}

/**
 * Main function: Generate all three PDF variants
 */
export async function generateAustralianInspectionPDFs(
  formSubmission: FormSubmissionData,
  options: InspectionPDFOptions = {}
): Promise<AustralianInspectionPDFs> {
  const result: AustralianInspectionPDFs = {
    status: 'error',
    generatedAt: new Date(),
  }

  try {
    const formData = formSubmission.submissionData

    // Generate all three PDFs in parallel
    const [insurerBuffer, clientBuffer, internalBuffer] = await Promise.all([
      generateInsurerPDF(formData, options),
      generateClientPDF(formData, options),
      generateInternalPDF(formData, options),
    ])

    result.insurerPdfBuffer = insurerBuffer
    result.clientPdfBuffer = clientBuffer
    result.internalPdfBuffer = internalBuffer

    // TODO: Upload to Cloudinary and get URLs
    // For now, return buffers that caller can upload
    result.status = 'success'
    result.message = 'All three PDF variants generated successfully'

    return result
  } catch (error) {
    result.status = 'error'
    result.message = error instanceof Error ? error.message : 'Unknown error generating PDFs'
    console.error('Error generating inspection PDFs:', error)
    return result
  }
}

/**
 * Generate single PDF variant
 */
export async function generateSingleInspectionPDF(
  formSubmission: FormSubmissionData,
  variant: 'insurer' | 'client' | 'internal',
  options: InspectionPDFOptions = {}
): Promise<Uint8Array | null> {
  try {
    const formData = formSubmission.submissionData

    switch (variant) {
      case 'insurer':
        return await generateInsurerPDF(formData, options)
      case 'client':
        return await generateClientPDF(formData, options)
      case 'internal':
        return await generateInternalPDF(formData, options)
      default:
        return null
    }
  } catch (error) {
    console.error(`Error generating ${variant} PDF:`, error)
    return null
  }
}

export default generateAustralianInspectionPDFs

// Additional export for type safety
export type { AustralianInspectionPDFs, InspectionPDFOptions, FormSubmissionData }
