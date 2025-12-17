/**
 * Forensic Inspection Report PDF Generator
 * 
 * Generates professional PDF reports matching the Disaster Recovery QLD format
 * with exact layout, colors, and structure as specified in the design images.
 */

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFImage } from 'pdf-lib'
import { retrieveRelevantStandards, buildStandardsContextPrompt } from './standards-retrieval'

interface BusinessInfo {
  businessName?: string | null
  businessAddress?: string | null
  businessLogo?: string | null
  businessABN?: string | null
  businessPhone?: string | null
  businessEmail?: string | null
}

interface ReportData {
  report: any
  analysis: any
  tier1: any
  tier2: any
  tier3: any
  stateInfo: any
  psychrometricAssessment?: any
  scopeAreas?: any[]
  equipmentSelection?: any[]
  standardsContext?: string
  businessInfo?: BusinessInfo
}

interface ScopeItem {
  item: string
  description: string
  justification: string
  standardReference: string
}

/**
 * Generate forensic inspection report PDF
 */
export async function generateForensicReportPDF(data: ReportData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  
  // Load fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  
  // Brand colors from images
  const darkBlue = rgb(0.0, 0.2, 0.4) // #003366 - Dark blue for headers
  const lightBlue = rgb(0.2, 0.4, 0.6) // #336699 - Light blue for expertise box
  const red = rgb(0.8, 0.1, 0.1) // #CC1A1A - Red for risks/warnings
  const green = rgb(0.1, 0.6, 0.3) // #1A9933 - Green for positive indicators
  const orange = rgb(1, 0.65, 0) // #FFA500 - Orange for timeline phases
  const black = rgb(0, 0, 0)
  const white = rgb(1, 1, 1)
  const lightGray = rgb(0.95, 0.95, 0.95)
  const darkGray = rgb(0.3, 0.3, 0.3)
  
  // Extract data
  const { report, analysis, tier1, tier2, tier3, stateInfo, psychrometricAssessment, scopeAreas, equipmentSelection, standardsContext, businessInfo } = data
  
  // Extract key information - NO STATIC FALLBACKS, use actual data only
  const jobRef = report.claimReferenceNumber || report.reportNumber || (report.id ? `#${report.id.slice(-6)}` : '')
  const inspectionDate = report.technicianAttendanceDate 
    ? new Date(report.technicianAttendanceDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
    : (report.inspectionDate 
        ? new Date(report.inspectionDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
        : '')
  
  // Water category - extract from tier1 or use report data, NO static fallback
  const waterCategory = tier1?.T1_Q3_waterSource 
    ? extractWaterCategory(tier1.T1_Q3_waterSource)
    : report.waterCategory || ''
  
  // Water class - use actual data only
  const waterClass = report.waterClass || tier1?.T1_Q3_waterClass || ''
  
  // Hazards - use actual data
  const hazards = tier1?.T1_Q7_hazards || []
  
  // Meth screen - use actual data, check hazards only if report data exists
  let methScreen = report.methamphetamineScreen || ''
  if (!methScreen && hazards.length > 0) {
    methScreen = hazards.some((h: string) => h.toLowerCase().includes('meth')) ? 'POSITIVE' : ''
  }
  
  const methTestCount = report.methamphetamineTestCount || null
  const bioMouldDetected = report.biologicalMouldDetected === true || (report.microbialGrowth && report.microbialGrowth !== '')
  const bioMouldCategory = report.biologicalMouldCategory || ''
  
  // Build scope items from data
  const scopeItems = buildScopeItems(data, standardsContext || '')
  
  // Build moisture and psychrometric data
  const moistureData = buildMoistureData(data)
  const psychrometricData = buildPsychrometricData(data)
  
  // Build timeline data from phase dates
  const timelineData = buildTimelineData(
    data,
    report.phase1StartDate ? new Date(report.phase1StartDate) : null,
    report.phase1EndDate ? new Date(report.phase1EndDate) : null,
    report.phase2StartDate ? new Date(report.phase2StartDate) : null,
    report.phase2EndDate ? new Date(report.phase2EndDate) : null,
    report.phase3StartDate ? new Date(report.phase3StartDate) : null,
    report.phase3EndDate ? new Date(report.phase3EndDate) : null
  )
  
  // Load business logo if available
  let logoImage: PDFImage | null = null
  if (businessInfo?.businessLogo) {
    try {
      const logoResponse = await fetch(businessInfo.businessLogo)
      const logoBuffer = await logoResponse.arrayBuffer()
      const logoUrl = businessInfo.businessLogo.toLowerCase()
      // Try PNG first, then JPG
      if (logoUrl.includes('.png')) {
        logoImage = await pdfDoc.embedPng(logoBuffer)
      } else if (logoUrl.includes('.jpg') || logoUrl.includes('.jpeg')) {
        logoImage = await pdfDoc.embedJpg(logoBuffer)
      } else {
        // Default to PNG
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
  
  // PAGE 1: Forensic Investigation Summary & Benefits
  const page1 = pdfDoc.addPage([595.28, 841.89]) // A4
  await renderPage1(page1, {
    pdfDoc,
    helvetica,
    helveticaBold,
    colors: { darkBlue, lightBlue, red, green, black, white, lightGray, darkGray },
    jobRef,
    inspectionDate,
    businessInfo: businessInfo || {},
    logoImage,
    waterCategory,
    waterClass,
    methScreen,
    methTestCount,
    bioMouldDetected,
    bioMouldCategory,
    report,
    analysis,
    standardsContext: standardsContext || '',
    timelineData
  })
  
  // PAGE 2: Detailed Scope of Works
  const page2 = pdfDoc.addPage([595.28, 841.89])
  await renderPage2(page2, {
    pdfDoc,
    helvetica,
    helveticaBold,
    colors: { darkBlue, black, white, lightGray, darkGray },
    jobRef,
    scopeItems,
    report,
    equipmentSelection,
    pricingConfig: data.report.pricingConfig
  })
  
  // PAGE 3: Data Evidence & Project Management
  const page3 = pdfDoc.addPage([595.28, 841.89])
  await renderPage3(page3, {
    pdfDoc,
    helvetica,
    helveticaBold,
    colors: { darkBlue, green, orange, black, white, lightGray, darkGray },
    jobRef,
    timelineData,
    moistureData,
    psychrometricData,
    report,
    scopeAreas
  })
  
  // PAGE 4: Authorisation & Terms
  const page4 = pdfDoc.addPage([595.28, 841.89])
  await renderPage4(page4, {
    pdfDoc,
    helvetica,
    helveticaBold,
    colors: { darkBlue, black, white, lightGray, darkGray },
    jobRef,
    businessInfo: businessInfo || {}
  })
  
  // Add headers and footers to all pages with proper dividers
  const pages = pdfDoc.getPages()
  // Company name - use business profile data only, NO static fallback
  const companyName = (businessInfo?.businessName && businessInfo.businessName.trim()) 
    ? businessInfo.businessName.trim() 
    : ''
  const reportTitle = companyName 
    ? `${companyName} Forensic Restoration & Hygiene Report`
    : 'Forensic Restoration & Hygiene Report'
  
  pages.forEach((page, index) => {
    const isFirstPage = index === 0
    let sectionTitle = ''
    
    // Determine section title based on page number
    if (index === 0) {
      sectionTitle = '1. Forensic Investigation Summary'
    } else if (index === 1) {
      sectionTitle = '2.0 Remediation'
    } else if (index === 2) {
      sectionTitle = 'Data Evidence & Project Management'
    } else if (index === 3) {
      sectionTitle = 'Authorisation & Terms'
    }
    
    addHeaderFooter(page, {
      helvetica,
      helveticaBold,
      colors: { darkBlue, black, darkGray },
      businessInfo: businessInfo || {},
      logoImage,
      jobRef,
      inspectionDate,
      pageNumber: index + 1,
      totalPages: pages.length,
      isFirstPage,
      reportTitle: isFirstPage ? reportTitle : undefined,
      sectionTitle: sectionTitle
    })
  })
  
  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}

/**
 * Render Page 1: Forensic Investigation Summary & Benefits
 */
async function renderPage1(
  page: PDFPage,
  options: {
    pdfDoc: PDFDocument
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    jobRef: string
    inspectionDate: string
    businessInfo: BusinessInfo
    logoImage: PDFImage | null
    waterCategory: string
    waterClass: string
    methScreen: string
    methTestCount: number | null
    bioMouldDetected: boolean
    bioMouldCategory: string | null
    report: any
    analysis: any
    standardsContext?: string
    timelineData?: any
  }
) {
  const { width, height } = page.getSize()
  const { helvetica, helveticaBold, colors, jobRef, inspectionDate, waterCategory, waterClass, methScreen, methTestCount, bioMouldDetected, bioMouldCategory, businessInfo } = options
  const margin = 50
  // Start content below header (header is ~100px with section title)
  let yPosition = height - 120
  
  // Section title is now in header, so we start with content directly
  
  // Summary text
  const summaryText = buildForensicSummary(options.report, options.analysis, waterCategory, waterClass, methScreen === 'POSITIVE', bioMouldDetected)
  const summaryLines = wrapText(summaryText, width - 2 * margin, helvetica, 10)
  
  summaryLines.forEach((line: string) => {
    if (yPosition < 100) return
    page.drawText(sanitizeTextForPDF(line), {
      x: margin,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.black,
      maxWidth: width - 2 * margin
    })
    yPosition -= 12
  })
  
  yPosition -= 30
  
  // Hazard Profile Dashboard
  page.drawText('Hazard Profile Dashboard', {
    x: margin,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 25
  
  // Meth Badge
  const methBadgeX = margin
  const methBadgeY = yPosition - 20
  const methBadgeColor = methScreen === 'POSITIVE' ? colors.red : colors.green
  const methBadgeText = methScreen === 'POSITIVE' 
    ? `METH: ${methScreen}${methTestCount ? ` (${methTestCount} tests)` : ''}`
    : `METH: ${methScreen}`
  
  page.drawRectangle({
    x: methBadgeX,
    y: methBadgeY,
    width: 150,
    height: 25,
    color: methBadgeColor
  })
  
  page.drawText(sanitizeTextForPDF(methBadgeText), {
    x: methBadgeX + 5,
    y: methBadgeY + 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  
  // Bio/Mould Badge
  if (bioMouldDetected) {
    const bioBadgeX = methBadgeX + 160
    const bioBadgeText = bioMouldCategory ? `BIO/MOULD: POSITIVE - ${bioMouldCategory}` : 'BIO/MOULD: POSITIVE'
    
    page.drawRectangle({
      x: bioBadgeX,
      y: methBadgeY,
      width: 200,
      height: 25,
      color: colors.red
    })
    
    page.drawText(sanitizeTextForPDF(bioBadgeText), {
      x: bioBadgeX + 5,
      y: methBadgeY + 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
  }
  
  yPosition = methBadgeY - 40
  
  // THE VALUE OF PROFESSIONAL REMEDIATION & SCOPE JUSTIFICATION
  page.drawText('THE VALUE OF PROFESSIONAL REMEDIATION & SCOPE JUSTIFICATION', {
    x: margin,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 30
  
  // Two boxes side by side
  const boxWidth = (width - 2 * margin - 20) / 2
  const boxHeight = 120
  const boxY = yPosition - boxHeight
  
  // Left Box (Blue) - Specialised Expertise & Qualifications
  page.drawRectangle({
    x: margin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: colors.lightBlue,
    borderColor: colors.darkBlue,
    borderWidth: 1
  })
  
  page.drawText('Specialised Expertise & Qualifications', {
    x: margin + 10,
    y: boxY + boxHeight - 20,
    size: 11,
    font: helveticaBold,
    color: colors.white
  })
  
  // Generate expertise points from standards and report data
  const expertisePoints = buildExpertisePoints(options.report, options.analysis, options.standardsContext || '')
  
  let expertiseY = boxY + boxHeight - 40
  expertisePoints.forEach((point: string) => {
    if (expertiseY < boxY + 20) return // Don't overflow box
    page.drawText(sanitizeTextForPDF(point), {
      x: margin + 15,
      y: expertiseY,
      size: 10,
      font: helvetica,
      color: colors.white
    })
    expertiseY -= 20
  })
  
  // Right Box (Red) - Mitigation vs. Rebuild: Unseen Risks
  page.drawRectangle({
    x: margin + boxWidth + 20,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: colors.red,
    borderColor: colors.darkBlue,
    borderWidth: 1
  })
  
  page.drawText('Mitigation vs. Rebuild: Unseen Risks', {
    x: margin + boxWidth + 30,
    y: boxY + boxHeight - 20,
    size: 11,
    font: helveticaBold,
    color: colors.white
  })
  
  // Generate risk points from report data
  const riskPoints = buildRiskPoints(options.report, waterCategory, bioMouldDetected, methScreen)
  
  let riskY = boxY + boxHeight - 40
  riskPoints.forEach((point: string) => {
    if (riskY < boxY + 20) return // Don't overflow box
    page.drawText(sanitizeTextForPDF(point), {
      x: margin + boxWidth + 35,
      y: riskY,
      size: 10,
      font: helvetica,
      color: colors.white
    })
    riskY -= 20
  })
  
  yPosition = boxY - 30
  
  // STRATEGIC IMPACT ANALYSIS: MITIGATION VS. RECONSTRUCTION
  page.drawText('STRATEGIC IMPACT ANALYSIS: MITIGATION VS. RECONSTRUCTION', {
    x: margin,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 30
  
  // Comparison Grid
  const comparisonBoxHeight = 100
  const comparisonY = yPosition - comparisonBoxHeight
  
  // Left Box (Red X) - The Rip & Repair Approach
  page.drawRectangle({
    x: margin,
    y: comparisonY,
    width: boxWidth,
    height: comparisonBoxHeight,
    color: colors.red,
    borderColor: colors.darkBlue,
    borderWidth: 1
  })
  
  page.drawText('X The Rip & Repair Approach', {
    x: margin + 10,
    y: comparisonY + comparisonBoxHeight - 20,
    size: 11,
    font: helveticaBold,
    color: colors.white
  })
  
  // Generate rip & repair points from report data
  const ripRepairPoints = buildRipRepairPoints(options.report, options.timelineData)
  let ripY = comparisonY + comparisonBoxHeight - 40
  ripRepairPoints.forEach((point: string) => {
    if (ripY < comparisonY + 20) return
    page.drawText(sanitizeTextForPDF(point), {
      x: margin + 15,
      y: ripY,
      size: 10,
      font: helvetica,
      color: colors.white
    })
    ripY -= 20
  })
  
  // Right Box (Green Check) - The Technical Mitigation Approach
  page.drawRectangle({
    x: margin + boxWidth + 20,
    y: comparisonY,
    width: boxWidth,
    height: comparisonBoxHeight,
    color: colors.green,
    borderColor: colors.darkBlue,
    borderWidth: 1
  })
  
  page.drawText('+ The Technical Mitigation Approach', {
    x: margin + boxWidth + 30,
    y: comparisonY + comparisonBoxHeight - 20,
    size: 11,
    font: helveticaBold,
    color: colors.white
  })
  
  // Generate mitigation points from report data
  const mitigationPoints = buildMitigationPoints(options.report, options.timelineData)
  let mitY = comparisonY + comparisonBoxHeight - 40
  mitigationPoints.forEach((point: string) => {
    if (mitY < comparisonY + 20) return
    page.drawText(sanitizeTextForPDF(point), {
      x: margin + boxWidth + 35,
      y: mitY,
      size: 10,
      font: helvetica,
      color: colors.white
    })
    mitY -= 20
  })
}

/**
 * Render Page 2: Detailed Scope of Works
 */
async function renderPage2(
  page: PDFPage,
  options: {
    pdfDoc: PDFDocument
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    jobRef: string
    scopeItems: ScopeItem[]
    report: any
    equipmentSelection?: any[]
    pricingConfig?: any
  }
) {
  const { width, height } = page.getSize()
  const { helvetica, helveticaBold, colors, jobRef, scopeItems } = options
  const margin = 50
  // Title is now in header, start content below
  let yPosition = height - 80
  
  yPosition -= 20
  
  // Section 2.0 Remediation
  page.drawText('2.0 Remediation', {
    x: margin,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 25
  
  // Remediation description
  const remediationText = 'The remediation is to scope the whole structural implementation, remediation, and preservation of remediation structures, testing remediation barometers, and resource of the whole collocation rate the Investigation Chomtice:'
  const remediationLines = wrapText(remediationText, width - 2 * margin, helvetica, 10)
  
  remediationLines.forEach((line: string) => {
    if (yPosition < 100) return
    page.drawText(sanitizeTextForPDF(line), {
      x: margin,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.black,
      maxWidth: width - 2 * margin
    })
    yPosition -= 12
  })
  
  yPosition -= 20
  
  // Scope Table
  const tableStartY = yPosition
  const tableWidth = width - 2 * margin
  const colWidths = {
    item: 100,
    description: 180,
    justification: 180,
    standard: 100
  }
  
  // Table Header
  const headerY = yPosition
  page.drawRectangle({
    x: margin,
    y: headerY - 20,
    width: tableWidth,
    height: 25,
    color: colors.darkBlue
  })
  
  let colX = margin + 5
  page.drawText('Item', {
    x: colX,
    y: headerY - 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  colX += colWidths.item
  
  page.drawText('Description', {
    x: colX,
    y: headerY - 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  colX += colWidths.description
  
  page.drawText('Justification', {
    x: colX,
    y: headerY - 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  colX += colWidths.justification
  
  page.drawText('Standard Reference', {
    x: colX,
    y: headerY - 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  
  yPosition = headerY - 30
  
  // Table Rows
  scopeItems.forEach((item, index) => {
    if (yPosition < 150) return // Stop if too close to bottom
    
    const rowHeight = Math.max(
      Math.ceil(item.description.length / 30) * 12,
      Math.ceil(item.justification.length / 30) * 12,
      20
    )
    
    // Alternate row colors
    if (index % 2 === 0) {
      page.drawRectangle({
        x: margin,
        y: yPosition - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: colors.lightGray
      })
    }
    
    // Item
    let colX = margin + 5
    const itemLines = wrapText(item.item, colWidths.item - 10, helvetica, 9)
    let itemY = yPosition - 5
    itemLines.forEach((line: string) => {
      page.drawText(sanitizeTextForPDF(line), {
        x: colX,
        y: itemY,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: colWidths.item - 10
      })
      itemY -= 10
    })
    colX += colWidths.item
    
    // Description
    const descLines = wrapText(item.description, colWidths.description - 10, helvetica, 9)
    let descY = yPosition - 5
    descLines.forEach((line: string) => {
      page.drawText(sanitizeTextForPDF(line), {
        x: colX,
        y: descY,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: colWidths.description - 10
      })
      descY -= 10
    })
    colX += colWidths.description
    
    // Justification
    const justLines = wrapText(item.justification, colWidths.justification - 10, helvetica, 9)
    let justY = yPosition - 5
    justLines.forEach((line: string) => {
      page.drawText(sanitizeTextForPDF(line), {
        x: colX,
        y: justY,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: colWidths.justification - 10
      })
      justY -= 10
    })
    colX += colWidths.justification
    
    // Standard Reference
    const stdLines = wrapText(item.standardReference, colWidths.standard - 10, helvetica, 9)
    let stdY = yPosition - 5
    stdLines.forEach((line: string) => {
      page.drawText(sanitizeTextForPDF(line), {
        x: colX,
        y: stdY,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: colWidths.standard - 10
      })
      stdY -= 10
    })
    
    yPosition -= rowHeight + 2
  })
  
  yPosition -= 20
  
  // Eventual Cost Projection & Variables
  if (yPosition > 150) {
    page.drawText('Eventual Cost Projection & Variables', {
      x: margin,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: colors.darkBlue
    })
    
    yPosition -= 20
    
    const costPoints = [
      '• Project Cost Estimation',
      '• Project Clean Estimation',
      '• Project Remediation',
      '• Project Drying and Variables',
      '• Communication Plan and Dispatchers (pittattit)',
      '• Eventual Cost Projection'
    ]
    
    costPoints.forEach(point => {
      if (yPosition < 100) return
      page.drawText(point, {
        x: margin + 10,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.black
      })
      yPosition -= 15
    })
  }
}

/**
 * Render Page 3: Project Timeline & Communication
 */
async function renderPage3(
  page: PDFPage,
  options: {
    pdfDoc: PDFDocument
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    jobRef: string
    timelineData: any
    moistureData: any
    psychrometricData: any
    report: any
    scopeAreas?: any
  }
) {
  const { width, height } = page.getSize()
  const { helvetica, helveticaBold, colors, jobRef, timelineData, moistureData, psychrometricData } = options
  const margin = 50
  // Title is now in header, start content below
  let yPosition = height - 80
  
  page.drawText(jobRef, {
    x: width - margin - 100,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: colors.darkGray
  })
  
  yPosition -= 40
  
  // Section 3: Moisture & Psychrometric Data Grids
  if (moistureData?.readings && moistureData.readings.length > 0) {
    page.drawText('3. Material Moisture Readings', {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: colors.darkBlue
    })
    
    yPosition -= 25
    
    // Moisture Table
    const moistureTableWidth = width - 2 * margin
    const moistureColWidths = {
      location: 120,
      material: 120,
      reading: 80,
      dryStandard: 80,
      status: 80
    }
    
    // Table Header
    const moistureHeaderY = yPosition
    page.drawRectangle({
      x: margin,
      y: moistureHeaderY - 20,
      width: moistureTableWidth,
      height: 25,
      color: colors.darkBlue
    })
    
    let colX = margin + 5
    page.drawText('Location', {
      x: colX,
      y: moistureHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    colX += moistureColWidths.location
    
    page.drawText('Material', {
      x: colX,
      y: moistureHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    colX += moistureColWidths.material
    
    page.drawText('Reading', {
      x: colX,
      y: moistureHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    colX += moistureColWidths.reading
    
    page.drawText('Dry Standard', {
      x: colX,
      y: moistureHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    colX += moistureColWidths.dryStandard
    
    page.drawText('Status', {
      x: colX,
      y: moistureHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    
    yPosition = moistureHeaderY - 30
    
    // Moisture Rows
    moistureData.readings.slice(0, 5).forEach((reading: any, index: number) => {
      if (yPosition < 500) return
      
      const rowHeight = 25
      
      if (index % 2 === 0) {
        page.drawRectangle({
          x: margin,
          y: yPosition - rowHeight,
          width: moistureTableWidth,
          height: rowHeight,
          color: colors.lightGray
        })
      }
      
      colX = margin + 5
      page.drawText(sanitizeTextForPDF(reading.location || 'N/A'), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: moistureColWidths.location - 10
      })
      colX += moistureColWidths.location
      
      page.drawText(sanitizeTextForPDF(reading.material || 'N/A'), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: moistureColWidths.material - 10
      })
      colX += moistureColWidths.material
      
      page.drawText(sanitizeTextForPDF(String(reading.reading || 'N/A')), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: moistureColWidths.reading - 10
      })
      colX += moistureColWidths.reading
      
      page.drawText(sanitizeTextForPDF(String(reading.dryStandard || '12%')), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: moistureColWidths.dryStandard - 10
      })
      colX += moistureColWidths.dryStandard
      
      const statusColor = reading.status === 'WET' ? colors.red : colors.green
      page.drawText(sanitizeTextForPDF(reading.status || 'DRY'), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helveticaBold,
        color: statusColor,
        maxWidth: moistureColWidths.status - 10
      })
      
      yPosition -= rowHeight + 2
    })
    
    yPosition -= 20
  }
  
  // Psychrometric Data
  if (psychrometricData?.readings && psychrometricData.readings.length > 0) {
    page.drawText('4. Psychrometric Data (Atmospheric)', {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: colors.darkBlue
    })
    
    yPosition -= 25
    
    // Psychrometric Table
    const psychTableWidth = width - 2 * margin
    const psychColWidths = {
      location: 100,
      temperature: 100,
      humidity: 100,
      gpp: 100,
      dewPoint: 100
    }
    
    // Table Header
    const psychHeaderY = yPosition
    page.drawRectangle({
      x: margin,
      y: psychHeaderY - 20,
      width: psychTableWidth,
      height: 25,
      color: colors.darkBlue
    })
    
    let colX = margin + 5
    page.drawText('Location', {
      x: colX,
      y: psychHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    colX += psychColWidths.location
    
    page.drawText('Temp (°C)', {
      x: colX,
      y: psychHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    colX += psychColWidths.temperature
    
    page.drawText('RH (%)', {
      x: colX,
      y: psychHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    colX += psychColWidths.humidity
    
    page.drawText('GPP', {
      x: colX,
      y: psychHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    colX += psychColWidths.gpp
    
    page.drawText('Dew Point', {
      x: colX,
      y: psychHeaderY - 5,
      size: 10,
      font: helveticaBold,
      color: colors.white
    })
    
    yPosition = psychHeaderY - 30
    
    // Psychrometric Rows
    psychrometricData.readings.slice(0, 3).forEach((reading: any, index: number) => {
      if (yPosition < 400) return
      
      const rowHeight = 25
      
      if (index % 2 === 0) {
        page.drawRectangle({
          x: margin,
          y: yPosition - rowHeight,
          width: psychTableWidth,
          height: rowHeight,
          color: colors.lightGray
        })
      }
      
      colX = margin + 5
      page.drawText(sanitizeTextForPDF(reading.location || 'Ambient'), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: psychColWidths.location - 10
      })
      colX += psychColWidths.location
      
      page.drawText(sanitizeTextForPDF(String(reading.temperature || 'N/A')), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: psychColWidths.temperature - 10
      })
      colX += psychColWidths.temperature
      
      page.drawText(sanitizeTextForPDF(String(reading.humidity || 'N/A')), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: psychColWidths.humidity - 10
      })
      colX += psychColWidths.humidity
      
      page.drawText(sanitizeTextForPDF(String(reading.gpp || 'N/A')), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: psychColWidths.gpp - 10
      })
      colX += psychColWidths.gpp
      
      page.drawText(sanitizeTextForPDF(String(reading.dewPoint || 'N/A')), {
        x: colX,
        y: yPosition - 15,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: psychColWidths.dewPoint - 10
      })
      
      yPosition -= rowHeight + 2
    })
    
    yPosition -= 20
  }
  
  // Section 5: Project Timeline & Milestones
  page.drawText('5. Project Timeline & Milestones', {
    x: margin,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 30
  
  // Gantt Chart
  const ganttY = yPosition
  const ganttHeight = 150
  const ganttWidth = width - 2 * margin
  const weekWidth = ganttWidth / 2
  
  // Draw timeline background
  page.drawRectangle({
    x: margin,
    y: ganttY - ganttHeight,
    width: ganttWidth,
    height: ganttHeight,
    color: colors.lightGray,
    borderColor: colors.darkGray,
    borderWidth: 1
  })
  
  // Dynamic week labels based on actual timeline
  const totalDays = timelineData.totalDays || 14
  const startDate = timelineData.startDate || new Date()
  const weeks = Math.ceil(totalDays / 7)
  
  // Draw week labels dynamically
  for (let week = 1; week <= Math.min(weeks, 4); week++) {
    const weekStart = new Date(startDate)
    weekStart.setDate(weekStart.getDate() + (week - 1) * 7)
    const weekLabel = `Week ${week}`
    const weekX = margin + ((week - 1) * (ganttWidth / Math.min(weeks, 4))) + (ganttWidth / Math.min(weeks, 4)) / 2 - 25
    
    page.drawText(weekLabel, {
      x: weekX,
      y: ganttY - 15,
      size: 10,
      font: helveticaBold,
      color: colors.darkBlue
    })
    
    // Add date range below week label
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const dateRange = `${weekStart.getDate()}/${weekStart.getMonth() + 1} - ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`
    page.drawText(dateRange, {
      x: weekX - 15,
      y: ganttY - 28,
      size: 7,
      font: helvetica,
      color: colors.darkGray
    })
  }
  
  // Phase bars from actual timeline data
  const phases = timelineData.phases || []
  
  const phaseHeight = 25
  const phaseSpacing = 30
  let phaseY = ganttY - 40
  
  phases.forEach((phase: any, index: number) => {
    const barX = margin + (phase.start / 14) * ganttWidth
    const barWidth = Math.max(10, (phase.duration / 14) * ganttWidth) // Minimum width for visibility
    
    page.drawRectangle({
      x: barX,
      y: phaseY - phaseHeight,
      width: barWidth,
      height: phaseHeight,
      color: phase.color
    })
    
    // Phase name
    const phaseName = phase.name.length > 20 ? phase.name.substring(0, 17) + '...' : phase.name
    page.drawText(sanitizeTextForPDF(phaseName), {
      x: margin - 80,
      y: phaseY - 15,
      size: 9,
      font: helvetica,
      color: colors.black
    })
    
    // Add actual dates if available
    if (phase.actualStart && phase.actualEnd) {
      const startStr = `${phase.actualStart.getDate()}/${phase.actualStart.getMonth() + 1}`
      const endStr = `${phase.actualEnd.getDate()}/${phase.actualEnd.getMonth() + 1}`
      const dateStr = `${startStr} - ${endStr}`
      page.drawText(sanitizeTextForPDF(dateStr), {
        x: barX + 5,
        y: phaseY - 12,
        size: 7,
        font: helvetica,
        color: colors.white
      })
    }
    
    phaseY -= phaseSpacing
  })
  
  yPosition = ganttY - ganttHeight - 30
  
  // Section 6: Communication Plan
  page.drawText('6. Communication Plan', {
    x: margin,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 30
  
  // Communication Plan Table
  const commTableWidth = width - 2 * margin
  const commColWidths = {
    stakeholder: 120,
    frequency: 80,
    method: 100,
    content: commTableWidth - 300
  }
  
  // Table Header
  const commHeaderY = yPosition
  page.drawRectangle({
    x: margin,
    y: commHeaderY - 20,
    width: commTableWidth,
    height: 25,
    color: colors.darkBlue
  })
  
  let colX = margin + 5
  page.drawText('Stakeholder', {
    x: colX,
    y: commHeaderY - 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  colX += commColWidths.stakeholder
  
  page.drawText('Frequency', {
    x: colX,
    y: commHeaderY - 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  colX += commColWidths.frequency
  
  page.drawText('Method', {
    x: colX,
    y: commHeaderY - 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  colX += commColWidths.method
  
  page.drawText('Content', {
    x: colX,
    y: commHeaderY - 5,
    size: 10,
    font: helveticaBold,
    color: colors.white
  })
  
  yPosition = commHeaderY - 30
  
  // Generate communication plan from report data
  const commRows = buildCommunicationPlan(options.report, options.scopeAreas, timelineData)
  
  commRows.forEach((row, index) => {
    if (yPosition < 100) return
    
    const rowHeight = 30
    
    if (index % 2 === 0) {
      page.drawRectangle({
        x: margin,
        y: yPosition - rowHeight,
        width: commTableWidth,
        height: rowHeight,
        color: colors.lightGray
      })
    }
    
    colX = margin + 5
    page.drawText(row.stakeholder, {
      x: colX,
      y: yPosition - 15,
      size: 9,
      font: helvetica,
      color: colors.black,
      maxWidth: commColWidths.stakeholder - 10
    })
    colX += commColWidths.stakeholder
    
    page.drawText(row.frequency, {
      x: colX,
      y: yPosition - 15,
      size: 9,
      font: helvetica,
      color: colors.black,
      maxWidth: commColWidths.frequency - 10
    })
    colX += commColWidths.frequency
    
    page.drawText(row.method, {
      x: colX,
      y: yPosition - 15,
      size: 9,
      font: helvetica,
      color: colors.black,
      maxWidth: commColWidths.method - 10
    })
    colX += commColWidths.method
    
    const contentLines = wrapText(row.content, commColWidths.content - 10, helvetica, 9)
    let contentY = yPosition - 5
    contentLines.forEach((line: string) => {
      page.drawText(line, {
        x: colX,
        y: contentY,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: commColWidths.content - 10
      })
      contentY -= 10
    })
    
    yPosition -= rowHeight + 2
  })
}

/**
 * Render Page 4: Authorisation & Terms
 */
async function renderPage4(
  page: PDFPage,
  options: {
    pdfDoc: PDFDocument
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    jobRef: string
    businessInfo: BusinessInfo
  }
) {
  const { width, height } = page.getSize()
  const { helvetica, helveticaBold, colors, jobRef, businessInfo } = options
  const margin = 50
  let yPosition = height - 80
  
  // Title
  page.drawText('Authorisation & Terms', {
    x: margin,
    y: yPosition,
    size: 16,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  page.drawText(jobRef, {
    x: width - margin - 100,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: colors.darkGray
  })
  
  yPosition -= 40
  
  // Section 7: Authorisation & Acceptance
  page.drawText('7. Authorisation & Acceptance', {
    x: margin,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 25
  
  const authText = 'The Authorisation & Acceptance is processed for both details, allow safer and common sections, and foremostly accepted tusuler site-vaimcrintioort umiermatarove amcohstiamentes. Please are both your comehers for authertation a signature:'
  const authLines = wrapText(authText, width - 2 * margin, helvetica, 10)
  
  authLines.forEach((line: string) => {
    if (yPosition < 400) return
    page.drawText(sanitizeTextForPDF(line), {
      x: margin,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: colors.black,
      maxWidth: width - 2 * margin
    })
    yPosition -= 12
  })
  
  yPosition -= 30
  
  // Signature fields
  for (let i = 0; i < 4; i++) {
    page.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: margin + 200, y: yPosition },
      thickness: 1,
      color: colors.black
    })
    
    page.drawText('Signature', {
      x: margin,
      y: yPosition - 15,
      size: 9,
      font: helvetica,
      color: colors.darkGray
    })
    
    yPosition -= 40
  }
  
  yPosition -= 20
  
  // Section 8: Terms & Conditions
  page.drawText('8. Terms & Conditions (Summary)', {
    x: margin,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 25
  
  const terms = [
    {
      title: 'Access:',
      text: 'Remediation discert, and all others conside maintalirse heve aeeess the prevbas soprees of comonaner eskies aesess the caxninental ascess berdr hnedletierencede.'
    },
    {
      title: 'Payment:',
      text: 'Payment or paytritents or low stanlove izdict cosio ersin, dersch to or casscogret scsoare inthonahing oft onverdemerot noth access that nstions thet cen oot by vapekeh jraousis, and nakading robetual pacment.'
    },
    {
      title: 'Variations:',
      text: 'Rensdialen redcarisic in mers, dlrping, scceevihmmsication, enirluloons, comerintcahont, plieforscled to ecedatts erainnstioncions, vedatiea and scope sooteressen smetestsıw and ts snunta the troede, and vertations tollokatoses aoc renitsnes of spechinsomen.'
    },
    {
      title: 'Scope Limitations:',
      text: 'Scope nsirinare obert Rationists reduirs magnssis of ceamlcione with socooltumiete in chibidkens Is ooniseling apeterrr coounheecks aisecali tied artied ontier precesss etne precesss ementeed for cinetemceshcbble rinsesure or peyismernel scepe.'
    },
    {
      title: 'Liability:',
      text: 'The fisethig thet dine icarestarttexo eipsit be clouess edihnias in an coratstosdioas with tou soinyinao tilene, reguitef benucer prareses for includes the csinat sor soles fairdrek csrt/-raplinscr-wtth fiability or senecsneority ropnements.'
    }
  ]
  
  terms.forEach(term => {
    if (yPosition < 100) return
    
    page.drawText(term.title, {
      x: margin,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: colors.darkBlue
    })
    
    yPosition -= 15
    
    const termLines = wrapText(term.text, width - 2 * margin - 20, helvetica, 9)
    termLines.forEach((line: string) => {
      if (yPosition < 100) return
      page.drawText(sanitizeTextForPDF(line), {
        x: margin + 10,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: colors.black,
        maxWidth: width - 2 * margin - 20
      })
      yPosition -= 11
    })
    
    yPosition -= 10
  })
}

/**
 * Add header and footer to page with proper dividers and business profile information
 */
function addHeaderFooter(
  page: PDFPage,
  options: {
    helvetica: PDFFont
    helveticaBold: PDFFont
    colors: any
    businessInfo: BusinessInfo
    logoImage: PDFImage | null
    jobRef: string
    inspectionDate?: string
    pageNumber: number
    totalPages: number
    isFirstPage?: boolean
    reportTitle?: string
    sectionTitle?: string
  }
) {
  const { width, height } = page.getSize()
  const { helvetica, helveticaBold, colors, businessInfo, logoImage, jobRef, inspectionDate, pageNumber, totalPages, isFirstPage, reportTitle, sectionTitle } = options
  
  const footerHeight = 50
  
  // Only show full header on first page - Professional clean header
  if (isFirstPage) {
    // Use business name from profile only - NO static fallback
    const companyName = (businessInfo?.businessName && businessInfo.businessName.trim()) 
      ? businessInfo.businessName.trim() 
      : ''
    
    // Header starts at top
    const headerTopY = height - 30
    const leftX = 50
    const rightX = width - 200
    
    // Left side: Company name and subtitle - only show if company name exists
    if (companyName) {
      page.drawText(sanitizeTextForPDF(companyName), {
        x: leftX,
        y: headerTopY,
        size: 16,
        font: helveticaBold,
        color: colors.darkBlue
      })
      
      page.drawText('Forensic Restoration & Hygiene Consultants', {
        x: leftX,
        y: headerTopY - 18,
        size: 10,
        font: helvetica,
        color: colors.darkGray
      })
    } else {
      // If no company name, just show subtitle
      page.drawText('Forensic Restoration & Hygiene Consultants', {
        x: leftX,
        y: headerTopY,
        size: 14,
        font: helveticaBold,
        color: colors.darkBlue
      })
    }
    
    // Right side: Job Details and Date
    if (jobRef) {
      page.drawText(sanitizeTextForPDF(`Job Details ${jobRef}`), {
        x: rightX,
        y: headerTopY,
        size: 11,
        font: helveticaBold,
        color: colors.darkBlue
      })
    }
    
    if (inspectionDate) {
      page.drawText(sanitizeTextForPDF(inspectionDate), {
        x: rightX,
        y: headerTopY - 18,
        size: 10,
        font: helvetica,
        color: colors.darkGray
      })
    }
    
    // Optional: Email or Phone (only one, below company name)
    let contactY = headerTopY - 36
    if (businessInfo?.businessEmail && businessInfo.businessEmail.trim()) {
      page.drawText(sanitizeTextForPDF(businessInfo.businessEmail.trim()), {
        x: leftX,
        y: contactY,
        size: 9,
        font: helvetica,
        color: colors.darkGray
      })
    } else if (businessInfo?.businessPhone && businessInfo.businessPhone.trim()) {
      page.drawText(sanitizeTextForPDF(businessInfo.businessPhone.trim()), {
        x: leftX,
        y: contactY,
        size: 9,
        font: helvetica,
        color: colors.darkGray
      })
    }
    
    // Thin divider line below header
    const dividerY = contactY - 15
    page.drawLine({
      start: { x: 0, y: dividerY },
      end: { x: width, y: dividerY },
      thickness: 1,
      color: colors.darkBlue
    })
    
    // Section title below divider
    if (sectionTitle) {
      page.drawText(sanitizeTextForPDF(sectionTitle), {
        x: leftX,
        y: dividerY - 25,
        size: 14,
        font: helveticaBold,
        color: colors.darkBlue
      })
    }
  } else {
    // Other pages: No header, just section title at top
    if (sectionTitle) {
      page.drawText(sanitizeTextForPDF(sectionTitle), {
        x: 50,
        y: height - 40,
        size: 14,
        font: helveticaBold,
        color: colors.darkBlue
      })
      
      // Document reference on right
      if (jobRef) {
        const refWidth = helvetica.widthOfTextAtSize(sanitizeTextForPDF(jobRef), 9)
        page.drawText(sanitizeTextForPDF(jobRef), {
          x: width - refWidth - 50,
          y: height - 40,
          size: 9,
          font: helvetica,
          color: colors.darkGray
        })
      }
      
      // Thin divider line below section title
      page.drawLine({
        start: { x: 0, y: height - 55 },
        end: { x: width, y: height - 55 },
        thickness: 1,
        color: colors.darkBlue
      })
    }
  }
  
  // Footer Background with Divider
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: footerHeight,
    color: rgb(0.98, 0.98, 0.98) // Light gray background
  })
  
  // Footer Divider Line
  page.drawLine({
    start: { x: 0, y: footerHeight },
    end: { x: width, y: footerHeight },
    thickness: 2,
    color: colors.darkBlue
  })
  
  // Footer Text - use actual company name or omit if not available
  const companyName = (businessInfo?.businessName && businessInfo.businessName.trim()) 
    ? businessInfo.businessName.trim() 
    : ''
  const footerText = companyName
    ? `Page ${pageNumber} of ${totalPages} | ${companyName} | Professional Report Series`
    : `Page ${pageNumber} of ${totalPages} | Professional Report Series`
  page.drawText(sanitizeTextForPDF(footerText), {
    x: 50,
    y: 30,
    size: 8,
    font: helvetica,
    color: colors.darkGray
  })
  
  page.drawText('Compliance: IICRC S500, S520, S540', {
    x: width - 200,
    y: 30,
    size: 8,
    font: helvetica,
    color: colors.darkGray
  })
}

/**
 * Build scope items from report data with proper justification mapping
 */
function buildScopeItems(data: ReportData, standardsContext: string): ScopeItem[] {
  const { report, tier1, tier2, tier3, scopeAreas } = data
  
  const waterCategory = tier1?.T1_Q3_waterSource 
    ? extractWaterCategory(tier1.T1_Q3_waterSource)
    : (report.waterCategory || 'Category 1')
  
  const waterClass = report.waterClass || tier1?.T1_Q3_waterClass || 'Class 1'
  const bioMouldDetected = report.biologicalMouldDetected || false
  const methScreen = report.methamphetamineScreen || 'NEGATIVE'
  
  const items: ScopeItem[] = []
  
  // Hazard Control
  items.push({
    item: 'Hazard Control',
    description: 'Preparative remediation is consistent from the tasking of hazard control protocols and safety measures including containment setup and safety plan implementation.',
    justification: 'OH&S compliance requires comprehensive hazard identification and control measures prior to remediation activities. Data capture and standards adherence for encounter-process safety protocols ensure worker and occupant safety.',
    standardReference: 'OH&S Act 2011'
  })
  
  // Remediation
  const remediationDesc = scopeAreas && scopeAreas.length > 0
    ? `Remediation to ${scopeAreas.length} affected areas with comprehensive assessment and controlled removal protocols under containment.`
    : 'Remediation to affected areas with comprehensive assessment and controlled removal protocols under containment.'
  
  let remediationJustification = ''
  if (waterCategory === 'Category 3') {
    remediationJustification = 'IICRC S500 requires removal of porous materials heavily contaminated with unsanitary water (Category 3); cleaning is not verifiable. Category 3 contamination poses significant health risks and requires complete removal of affected porous materials.'
  } else if (waterCategory === 'Category 2') {
    remediationJustification = 'IICRC S500 requires assessment and appropriate remediation of materials contaminated with Category 2 water. Porous materials may require removal if contamination cannot be effectively cleaned and verified.'
  } else {
    remediationJustification = 'IICRC S500 requires appropriate remediation protocols for Category 1 water damage. Materials are assessed and treated according to contamination level and material porosity.'
  }
  
  items.push({
    item: 'Remediation',
    description: remediationDesc,
    justification: remediationJustification,
    standardReference: 'IICRC S500 Sec 13.5.6'
  })
  
  // Structural Drying
  const dryingDesc = scopeAreas && scopeAreas.length > 0
    ? `Structural drying maintenance necessary for ${scopeAreas.length} affected areas with comprehensive monitoring and verification protocols to achieve dry standard goals.`
    : 'Structural drying maintenance necessary for affected areas with comprehensive monitoring and verification protocols to achieve dry standard goals.'
  
  let dryingJustification = ''
  if (waterClass === 'Class 4') {
    dryingJustification = 'IICRC S500 Class 4 drying requires specialized techniques due to deep saturation and low evaporation potential. Extended drying time and specialized equipment are necessary.'
  } else if (waterClass === 'Class 3') {
    dryingJustification = 'IICRC S500 Class 3 drying requires comprehensive equipment deployment due to high evaporation load. Multiple air movers and dehumidification systems are required.'
  } else {
    dryingJustification = 'IICRC S500 requires structural drying to achieve dry standard goals. Monitoring and verification ensure complete moisture removal and prevent secondary damage.'
  }
  
  items.push({
    item: 'Structural Drying',
    description: dryingDesc,
    justification: dryingJustification,
    standardReference: 'IICRC S500 Sec 14'
  })
  
  // Add scope area specific items with dynamic justification
  if (scopeAreas && scopeAreas.length > 0) {
    scopeAreas.forEach((area: any, index: number) => {
      const materials = Array.isArray(area.materials) 
        ? area.materials.join(', ')
        : (area.materials || 'Various materials')
      
      const areaName = area.name || `Area ${index + 1}`
      const moistureLevel = area.moisture || area.moistureReading || null
      
      let areaJustification = ''
      if (waterCategory === 'Category 3') {
        areaJustification = `IICRC S500 requires removal of porous materials (${materials}) contaminated with Category 3 unsanitary water; cleaning is not verifiable. Category 3 contamination poses significant health risks.`
      } else if (moistureLevel && moistureLevel > 20) {
        areaJustification = `IICRC S500 requires removal of saturated porous materials (${materials}) where moisture content exceeds dry standard goals. Moisture reading of ${moistureLevel}% indicates saturation requiring removal.`
      } else {
        areaJustification = `IICRC S500 requires appropriate remediation of affected materials (${materials}) based on contamination level and material porosity. Controlled removal and disposal under containment protocols.`
      }
      
      items.push({
        item: areaName,
        description: `Controlled removal and disposal of affected materials (${materials}) under containment protocols.${moistureLevel ? ` Moisture reading: ${moistureLevel}%.` : ''}`,
        justification: areaJustification,
        standardReference: 'IICRC S500 Sec 13.5.6'
      })
    })
  }
  
  // Add specialized protocol boxes if applicable
  if (report.hvacAffected) {
    items.push({
      item: 'HVAC Hygiene Protocol',
      description: 'Comprehensive HVAC system cleaning, disinfection, and verification to prevent cross-contamination and ensure indoor air quality.',
      justification: 'IICRC S500 requires HVAC system assessment and remediation when affected by water damage. HVAC systems can spread contamination throughout the structure if not properly addressed.',
      standardReference: 'IICRC S500 Sec 15'
    })
  }
  
  if (bioMouldDetected) {
    items.push({
      item: 'Biological/Mould Remediation',
      description: 'Specialized mould remediation protocols including containment, removal of affected materials, and antimicrobial treatment.',
      justification: 'IICRC S520 requires specialized protocols for mould remediation. Visible mould growth requires containment, removal of affected materials, and antimicrobial treatment to prevent regrowth.',
      standardReference: 'IICRC S520'
    })
  }
  
  if (methScreen === 'POSITIVE') {
    items.push({
      item: 'Methamphetamine Decontamination',
      description: 'Specialized decontamination protocols for methamphetamine contamination including testing, removal of affected materials, and verification.',
      justification: 'Methamphetamine contamination requires specialized decontamination protocols. Affected porous materials must be removed and disposed of according to hazardous materials protocols.',
      standardReference: 'AS/NZS 3580'
    })
  }
  
  return items
}

/**
 * Build moisture data from report
 */
function buildMoistureData(data: ReportData): any {
  const { report, tier2, scopeAreas } = data
  
  let moistureReadings: any[] = []
  
  // Parse moisture readings from report
  if (report.moistureReadings) {
    try {
      const parsed = typeof report.moistureReadings === 'string' 
        ? JSON.parse(report.moistureReadings)
        : report.moistureReadings
      if (Array.isArray(parsed)) {
        moistureReadings = parsed
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // Extract from tier2 if available
  if (tier2?.T2_Q1_moistureReadings && Array.isArray(tier2.T2_Q1_moistureReadings)) {
    moistureReadings = tier2.T2_Q1_moistureReadings.map((reading: any) => ({
      location: reading.location || reading.room || 'Location',
      material: reading.material || 'Various',
      reading: reading.reading || reading.moistureContent || reading.wme || 'N/A',
      dryStandard: reading.dryStandard || reading.benchmark || '12%',
      status: reading.status || (parseFloat(reading.reading || reading.moistureContent || '0') > 20 ? 'WET' : 'DRY')
    }))
  }
  
  // Extract from scopeAreas if available
  if (scopeAreas && scopeAreas.length > 0 && moistureReadings.length === 0) {
    scopeAreas.forEach((area: any) => {
      if (area.moisture || area.moistureReading) {
        moistureReadings.push({
          location: area.name || 'Area',
          material: Array.isArray(area.materials) ? area.materials.join(', ') : (area.materials || 'Various'),
          reading: `${area.moisture || area.moistureReading}%`,
          dryStandard: '12%',
          status: (area.moisture || area.moistureReading || 0) > 20 ? 'WET' : 'DRY'
        })
      }
    })
  }
  
  // Default if no data
  if (moistureReadings.length === 0) {
    moistureReadings = [
      { location: 'Sample Location', material: 'Various', reading: 'N/A', dryStandard: '12%', status: 'DRY' }
    ]
  }
  
  return { readings: moistureReadings }
}

/**
 * Build psychrometric data from report
 */
function buildPsychrometricData(data: ReportData): any {
  const { report, psychrometricAssessment, tier2 } = data
  
  let psychrometricReadings: any[] = []
  
  // Parse psychrometric readings from report
  if (report.psychrometricReadings) {
    try {
      const parsed = typeof report.psychrometricReadings === 'string'
        ? JSON.parse(report.psychrometricReadings)
        : report.psychrometricReadings
      if (Array.isArray(parsed)) {
        psychrometricReadings = parsed
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // Extract from psychrometricAssessment if available
  if (psychrometricAssessment) {
    psychrometricReadings.push({
      location: 'Ambient',
      temperature: psychrometricAssessment.temperature || 'N/A',
      humidity: psychrometricAssessment.humidity || 'N/A',
      gpp: psychrometricAssessment.gpp || 'N/A',
      dewPoint: psychrometricAssessment.dewPoint || 'N/A'
    })
  }
  
  // Default if no data
  if (psychrometricReadings.length === 0) {
    psychrometricReadings = [
      { location: 'Ambient', temperature: 'N/A', humidity: 'N/A', gpp: 'N/A', dewPoint: 'N/A' }
    ]
  }
  
  return { readings: psychrometricReadings }
}

/**
 * Build timeline data from actual phase dates or estimate from report data
 */
function buildTimelineData(data: ReportData, phase1Start?: Date | null, phase1End?: Date | null, phase2Start?: Date | null, phase2End?: Date | null, phase3Start?: Date | null, phase3End?: Date | null): any {
  const { report } = data
  
  // Use actual phase dates if available, otherwise estimate
  const startDate = report.technicianAttendanceDate ? new Date(report.technicianAttendanceDate) : new Date()
  const phases: any[] = []
  
  // Calculate total timeline span
  let earliestDate = startDate
  let latestDate = startDate
  
  // Phase 1: Make-safe
  if (phase1Start && phase1End) {
    const p1Start = new Date(phase1Start)
    const p1End = new Date(phase1End)
    const duration = Math.ceil((p1End.getTime() - p1Start.getTime()) / (1000 * 60 * 60 * 24))
    phases.push({
      name: 'Phase 1: Make-safe',
      startDate: p1Start,
      endDate: p1End,
      duration: duration,
      color: rgb(0.1, 0.6, 0.3) // Green
    })
    if (p1Start < earliestDate) earliestDate = p1Start
    if (p1End > latestDate) latestDate = p1End
  }
  
  // Phase 2: Remediation/Drying
  if (phase2Start && phase2End) {
    const p2Start = new Date(phase2Start)
    const p2End = new Date(phase2End)
    const duration = Math.ceil((p2End.getTime() - p2Start.getTime()) / (1000 * 60 * 60 * 24))
    phases.push({
      name: 'Phase 2: Remediation/Drying',
      startDate: p2Start,
      endDate: p2End,
      duration: duration,
      color: rgb(1, 0.65, 0) // Orange
    })
    if (p2Start < earliestDate) earliestDate = p2Start
    if (p2End > latestDate) latestDate = p2End
  }
  
  // Phase 3: Verification/Handover
  if (phase3Start && phase3End) {
    const p3Start = new Date(phase3Start)
    const p3End = new Date(phase3End)
    const duration = Math.ceil((p3End.getTime() - p3Start.getTime()) / (1000 * 60 * 60 * 24))
    phases.push({
      name: 'Phase 3: Verification/Handover',
      startDate: p3Start,
      endDate: p3End,
      duration: duration,
      color: rgb(0.1, 0.6, 0.3) // Green
    })
    if (p3Start < earliestDate) earliestDate = p3Start
    if (p3End > latestDate) latestDate = p3End
  }
  
  // If no phase dates, estimate from report data - use actual data only, NO static fallback
  if (phases.length === 0) {
    // Use actual estimated drying time from report, or calculate from affected area/scope
    let estimatedDays = report.estimatedDryingTime || report.estimatedDryingDuration || null
    
    // If no estimated time, calculate from affected area or scope areas
    if (!estimatedDays) {
      const affectedArea = report.affectedArea || 0
      const scopeAreas = data.scopeAreas || []
      
      if (scopeAreas.length > 0) {
        // Calculate from scope areas volume
        const totalVolume = scopeAreas.reduce((sum: number, area: any) => {
          return sum + (area.volume || 0)
        }, 0)
        // Rough estimate: 1 day per 50 cubic metres
        estimatedDays = Math.max(3, Math.ceil(totalVolume / 50))
      } else if (affectedArea > 0) {
        // Rough estimate: 1 day per 10 square metres
        estimatedDays = Math.max(3, Math.ceil(affectedArea / 10))
      }
      // If still no estimate, use technician attendance date to calculate from incident date
      if (!estimatedDays && report.incidentDate && report.technicianAttendanceDate) {
        const incident = new Date(report.incidentDate)
        const attendance = new Date(report.technicianAttendanceDate)
        const daysSince = Math.ceil((attendance.getTime() - incident.getTime()) / (1000 * 60 * 60 * 24))
        // Estimate based on time since incident
        estimatedDays = Math.max(7, daysSince * 2)
      }
    }
    
    // Only create phases if we have an estimate from actual data
    if (estimatedDays) {
      const p1Duration = Math.ceil(estimatedDays * 0.2) // 20% for make-safe
      const p2Duration = Math.ceil(estimatedDays * 0.6) // 60% for remediation
      const p3Duration = Math.ceil(estimatedDays * 0.2) // 20% for verification
      
      phases.push({
        name: 'Phase 1: Make-safe',
        startDate: startDate,
        endDate: new Date(startDate.getTime() + p1Duration * 24 * 60 * 60 * 1000),
        duration: p1Duration,
        color: rgb(0.1, 0.6, 0.3)
      })
      
      const p2Start = new Date(startDate.getTime() + p1Duration * 24 * 60 * 60 * 1000)
      phases.push({
        name: 'Phase 2: Remediation/Drying',
        startDate: p2Start,
        endDate: new Date(p2Start.getTime() + p2Duration * 24 * 60 * 60 * 1000),
        duration: p2Duration,
        color: rgb(1, 0.65, 0)
      })
      
      const p3Start = new Date(p2Start.getTime() + p2Duration * 24 * 60 * 60 * 1000)
      phases.push({
        name: 'Phase 3: Verification/Handover',
        startDate: p3Start,
        endDate: new Date(p3Start.getTime() + p3Duration * 24 * 60 * 60 * 1000),
        duration: p3Duration,
        color: rgb(0.1, 0.6, 0.3)
      })
      
      latestDate = new Date(p3Start.getTime() + p3Duration * 24 * 60 * 60 * 1000)
    } else {
      // No data available - return empty timeline
      return { 
        phases: [], 
        totalDays: 0, 
        startDate: startDate,
        endDate: startDate,
        actualPhases: []
      }
    }
  }
  
  // Calculate total timeline in days
  const totalDays = Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24))
  
  // Normalize phases to relative positions (0-14 day scale for display)
  const normalizedPhases = phases.map(phase => {
    const daysFromStart = Math.ceil((phase.startDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24))
    const normalizedStart = Math.round((daysFromStart / totalDays) * 14)
    const normalizedDuration = Math.max(1, Math.round((phase.duration / totalDays) * 14))
    
    return {
      name: phase.name,
      start: normalizedStart,
      duration: normalizedDuration,
      color: phase.color,
      actualStart: phase.startDate,
      actualEnd: phase.endDate,
      actualDuration: phase.duration
    }
  })
  
  return { 
    phases: normalizedPhases, 
    totalDays, 
    startDate: earliestDate,
    endDate: latestDate,
    actualPhases: phases
  }
}

/**
 * Build expertise points from standards and report data
 */
function buildExpertisePoints(report: any, analysis: any, standardsContext: string): string[] {
  const points: string[] = []
  
  // Check for certifications in standards context
  if (standardsContext.toLowerCase().includes('iicrc') || standardsContext.toLowerCase().includes('certified')) {
    points.push('+ IICRC Certified Technicians')
  } else {
    points.push('+ Certified Technicians')
  }
  
  // Check for OH&S protocols
  if (standardsContext.toLowerCase().includes('oh&s') || standardsContext.toLowerCase().includes('safety')) {
    points.push('+ OH&S Compliance Protocols')
  } else {
    points.push('+ OH&S Protocols')
  }
  
  // Check for scientific assessment methods
  if (report.psychrometricAssessment || report.moistureReadings) {
    points.push('+ Scientific Assessment & Data Analysis')
  } else {
    points.push('+ Scientific Assessment')
  }
  
  // Add equipment-based expertise if available
  if (report.equipmentUsed || report.equipmentSelection) {
    points.push('+ Advanced Equipment Deployment')
  }
  
  return points.slice(0, 4) // Max 4 points
}

/**
 * Build risk points from report data
 */
function buildRiskPoints(report: any, waterCategory: string, hasMould: boolean, methScreen: string): string[] {
  const points: string[] = []
  
  // Category 3 water risks
  if (waterCategory === 'Category 3') {
    points.push('+ Unsanitary Contamination Risk')
  }
  
  // Mould risks
  if (hasMould) {
    points.push('+ Microbial Growth & Health Risk')
  }
  
  // Meth risks
  if (methScreen === 'POSITIVE') {
    points.push('+ Chemical Contamination Hazard')
  }
  
  // Hidden moisture risks
  if (report.structureType && (report.structureType.toLowerCase().includes('cavity') || report.structureType.toLowerCase().includes('void'))) {
    points.push('+ Hidden Cavity Moisture')
  }
  
  // Default risks if none specific
  if (points.length === 0) {
    points.push('+ Invisible Moisture Migration')
    points.push('+ Secondary Damage Risk')
    points.push('+ Preventing Future Loss')
  } else {
    // Always include preventing future loss
    if (!points.some(p => p.toLowerCase().includes('future'))) {
      points.push('+ Preventing Future Loss')
    }
  }
  
  return points.slice(0, 4) // Max 4 points
}

/**
 * Build rip & repair approach drawbacks
 */
function buildRipRepairPoints(report: any, timelineData: any): string[] {
  const points: string[] = []
  
  // Calculate disruption based on affected area
  const affectedArea = report.affectedArea || 0
  if (affectedArea > 50) {
    points.push('X Significant Displacement')
  } else {
    points.push('X Displacement')
  }
  
  // Logistics based on property type
  if (report.propertyAddress) {
    points.push('X Complex Logistics')
  } else {
    points.push('X Logistics')
  }
  
  // Delays based on timeline
  const totalDays = timelineData?.totalDays || 14
  if (totalDays > 21) {
    points.push('X Extended Delays')
  } else {
    points.push('X Delays')
  }
  
  // Add cost implications if available
  if (report.totalCost && report.totalCost > 50000) {
    points.push('X Higher Costs')
  }
  
  return points.slice(0, 4) // Max 4 points
}

/**
 * Build mitigation approach benefits
 */
function buildMitigationPoints(report: any, timelineData: any): string[] {
  const points: string[] = []
  
  // Minimal disruption
  points.push('+ Minimal Disruption')
  
  // Rapid turnaround based on timeline
  const totalDays = timelineData?.totalDays || 14
  if (totalDays <= 14) {
    points.push('+ Rapid Turnaround')
  } else if (totalDays <= 21) {
    points.push('+ Efficient Turnaround')
  } else {
    points.push('+ Controlled Timeline')
  }
  
  // Expedited claims
  points.push('+ Expedited Claims Processing')
  
  // Add cost benefits if available
  if (report.totalCost) {
    points.push('+ Cost-Effective Solution')
  }
  
  return points.slice(0, 4) // Max 4 points
}

/**
 * Build communication plan from report data
 */
function buildCommunicationPlan(report: any, scopeAreas: any, timelineData: any): Array<{stakeholder: string, frequency: string, method: string, content: string}> {
  const rows: Array<{stakeholder: string, frequency: string, method: string, content: string}> = []
  
  // Client/Insurer communication
  const clientName = report.clientName || 'Client'
  const insurerName = report.insurerName || 'Insurer'
  
  // Determine frequency based on timeline
  const totalDays = timelineData?.totalDays || 14
  let frequency = 'Daily'
  if (totalDays > 21) {
    frequency = 'Weekly'
  } else if (totalDays > 14) {
    frequency = 'Every 3 days'
  }
  
  // Client communication
  rows.push({
    stakeholder: clientName,
    frequency: frequency,
    method: 'Email & Phone',
    content: `Progress updates, milestone notifications, and access coordination for ${clientName}`
  })
  
  // Insurer communication
  if (insurerName && insurerName !== 'Insurer') {
    rows.push({
      stakeholder: insurerName,
      frequency: totalDays > 14 ? 'Weekly' : 'Every 3 days',
      method: 'Email & Portal',
      content: `Detailed reports, documentation, and claim updates for ${insurerName}`
    })
  } else {
    rows.push({
      stakeholder: 'Insurance Company',
      frequency: totalDays > 14 ? 'Weekly' : 'Every 3 days',
      method: 'Email & Portal',
      content: 'Detailed reports, documentation, and claim updates'
    })
  }
  
  // Contractor/Subcontractor communication if applicable
  if (scopeAreas && scopeAreas.length > 3) {
    rows.push({
      stakeholder: 'Subcontractors',
      frequency: 'As required',
      method: 'Phone & SMS',
      content: 'Site access, scheduling, and coordination updates'
    })
  }
  
  // Project manager/internal communication
  rows.push({
    stakeholder: 'Project Manager',
    frequency: 'Daily',
    method: 'Internal System',
    content: 'Daily monitoring data, equipment status, and progress tracking'
  })
  
  // Add property manager if commercial
  if (report.propertyAddress && (report.propertyAddress.toLowerCase().includes('unit') || report.propertyAddress.toLowerCase().includes('commercial'))) {
    rows.push({
      stakeholder: 'Property Manager',
      frequency: 'Weekly',
      method: 'Email',
      content: 'Tenant notifications, access arrangements, and completion updates'
    })
  }
  
  return rows.slice(0, 6) // Max 6 rows
}

/**
 * Build forensic summary text
 */
function buildForensicSummary(report: any, analysis: any, waterCategory: string, waterClass: string, hasMeth: boolean, hasMould: boolean): string {
  let summary = 'The Forensic Investigation Summary provides a comprehensive assessment of the water damage incident and outlines the professional remediation approach required. '
  summary += 'This assessment includes detailed analysis of the affected areas, contamination levels, and specialized remediation protocols necessary to restore the property to a safe and habitable condition. '
  summary += 'The investigation incorporates IICRC standards and best practices to ensure complete remediation and prevent future issues.'
  
  if (waterCategory) {
    summary += ` Water category identified: ${waterCategory}.`
  }
  
  if (waterClass) {
    summary += ` Water class: ${waterClass}.`
  }
  
  if (hasMeth) {
    summary += ' Methamphetamine screening: POSITIVE - specialized remediation protocols required.'
  } else {
    summary += ' Methamphetamine screening: NEGATIVE.'
  }
  
  if (hasMould) {
    summary += ' Biological/mould contamination: POSITIVE - Category 3 protocols required.'
  }
  
  // Add property intelligence if available
  if (report.buildingAge) {
    summary += ` Building age: ${report.buildingAge} (${report.buildingAge < 1990 ? 'Pre-1990 - Asbestos/Lead assessment required' : 'Post-1990'}).`
  }
  
  if (report.structureType) {
    summary += ` Structure type: ${report.structureType}.`
  }
  
  if (report.accessNotes) {
    summary += ` Access notes: ${report.accessNotes}.`
  }
  
  return summary
}

/**
 * Extract water category from source
 */
function extractWaterCategory(source: string): string {
  if (!source) return 'Category 1'
  const lower = source.toLowerCase()
  if (lower.includes('category 3') || lower.includes('cat 3') || lower.includes('sewage') || lower.includes('contaminated')) {
    return 'Category 3'
  }
  if (lower.includes('category 2') || lower.includes('cat 2') || lower.includes('grey water')) {
    return 'Category 2'
  }
  return 'Category 1'
}

/**
 * Sanitize text to remove Unicode characters that can't be encoded in WinAnsi
 */
function sanitizeTextForPDF(text: string): string {
  if (!text) return ''
  
  // Replace common Unicode characters with ASCII equivalents
  return text
    .replace(/[ıİ]/g, 'i') // Turkish dotless i
    .replace(/[şŞ]/g, 's') // Turkish s with cedilla
    .replace(/[ğĞ]/g, 'g') // Turkish g with breve
    .replace(/[üÜ]/g, 'u') // u with umlaut
    .replace(/[öÖ]/g, 'o') // o with umlaut
    .replace(/[çÇ]/g, 'c') // c with cedilla
    .replace(/[àáâãäå]/gi, 'a') // a with various accents
    .replace(/[èéêë]/gi, 'e') // e with various accents
    .replace(/[ìíîï]/gi, 'i') // i with various accents
    .replace(/[òóôõö]/gi, 'o') // o with various accents
    .replace(/[ùúûü]/gi, 'u') // u with various accents
    .replace(/[ýÿ]/gi, 'y') // y with various accents
    .replace(/[ñ]/gi, 'n') // n with tilde
    .replace(/[æ]/gi, 'ae') // ae ligature
    .replace(/[œ]/gi, 'oe') // oe ligature
    .replace(/[–—]/g, '-') // em/en dashes
    .replace(/[""]/g, '"') // smart quotes
    .replace(/['']/g, "'") // smart apostrophes
    .replace(/[…]/g, '...') // ellipsis
    .replace(/[€]/g, 'EUR') // euro symbol
    .replace(/[£]/g, 'GBP') // pound symbol
    .replace(/[©]/g, '(c)') // copyright
    .replace(/[®]/g, '(R)') // registered
    .replace(/[™]/g, '(TM)') // trademark
    // Remove any remaining non-ASCII characters
    .replace(/[^\x00-\x7F]/g, '')
}

/**
 * Wrap text to fit within width
 */
function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  // Sanitize text first to remove Unicode characters
  const sanitized = sanitizeTextForPDF(text)
  const words = sanitized.split(' ')
  const lines: string[] = []
  let currentLine = ''
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    try {
      const width = font.widthOfTextAtSize(testLine, fontSize)
      
      if (width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    } catch (error) {
      // If encoding fails, try sanitizing the word again
      const sanitizedWord = sanitizeTextForPDF(word)
      const testLineSanitized = currentLine ? `${currentLine} ${sanitizedWord}` : sanitizedWord
      try {
        const width = font.widthOfTextAtSize(testLineSanitized, fontSize)
        if (width > maxWidth && currentLine) {
          lines.push(currentLine)
          currentLine = sanitizedWord
        } else {
          currentLine = testLineSanitized
        }
      } catch (e) {
        // Skip problematic words
        continue
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines
}

