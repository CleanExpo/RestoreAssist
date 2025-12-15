/**
 * Professional Assessment Report PDF Generator
 * 
 * Generates premium PDF reports matching the Disaster Recovery QLD format
 * with exact layout, colors, and structure as specified in the design images.
 * 
 * This is an ASSESSMENT REPORT (not just forensic) with comprehensive data mapping.
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
 * Generate professional assessment report PDF
 */
export async function generateAssessmentReportPDF(data: ReportData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  
  // Load fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  
  // Brand colors matching images exactly
  const darkBlue = rgb(0.0, 0.2, 0.4) // #003366 - Dark blue for headers
  const lightBlue = rgb(0.2, 0.4, 0.6) // #336699 - Light blue for expertise box
  const red = rgb(0.8, 0.1, 0.1) // #CC1A1A - Red for risks/warnings
  const green = rgb(0.1, 0.6, 0.3) // #1A9933 - Green for positive indicators
  const orange = rgb(1.0, 0.65, 0.0) // #FFA500 - Orange for Gantt chart
  const black = rgb(0, 0, 0)
  const white = rgb(1, 1, 1)
  const lightGray = rgb(0.95, 0.95, 0.95)
  const darkGray = rgb(0.3, 0.3, 0.3)
  const dividerGray = rgb(0.8, 0.8, 0.8)
  
  // Extract data
  const { report, analysis, tier1, tier2, tier3, stateInfo, psychrometricAssessment, scopeAreas, equipmentSelection, standardsContext, businessInfo } = data
  
  // Extract key information from data architecture
  const jobRef = report.claimReferenceNumber || report.reportNumber || `#${report.id.slice(-6)}`
  const inspectionDate = report.technicianAttendanceDate || report.inspectionDate
    ? new Date(report.technicianAttendanceDate || report.inspectionDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
  
  const insurerName = report.insurerName || report.clientName || 'Not specified'
  const propertyAddress = report.propertyAddress || 'Not specified'
  const technicianName = report.technicianName || 'Not specified'
  
  // Property Intelligence
  const buildingAge = report.buildingAge || null
  const structureType = report.structureType || 'Not specified'
  const accessNotes = report.accessNotes || null
  
  // Hazard Profile
  const waterCategory = tier1?.T1_Q3_waterSource 
    ? extractWaterCategory(tier1.T1_Q3_waterSource)
    : (report.waterCategory || 'Category 1')
  
  const waterClass = report.waterClass || tier1?.T1_Q3_waterClass || 'Class 1'
  const methScreen = report.methamphetamineScreen || (tier1?.T1_Q7_hazards?.some((h: string) => h.toLowerCase().includes('meth')) ? 'POSITIVE' : 'NEGATIVE')
  const methTestCount = report.methamphetamineTestCount || null
  const bioMouldDetected = report.biologicalMouldDetected || report.microbialGrowth ? true : false
  const bioMouldCategory = report.biologicalMouldCategory || (waterCategory === 'Category 3' ? 'CAT 3' : null)
  
  // Timeline Data
  const phase1Start = report.phase1StartDate ? new Date(report.phase1StartDate) : null
  const phase1End = report.phase1EndDate ? new Date(report.phase1EndDate) : null
  const phase2Start = report.phase2StartDate ? new Date(report.phase2StartDate) : null
  const phase2End = report.phase2EndDate ? new Date(report.phase2EndDate) : null
  const phase3Start = report.phase3StartDate ? new Date(report.phase3StartDate) : null
  const phase3End = report.phase3EndDate ? new Date(report.phase3EndDate) : null
  
  // Build scope items from data
  const scopeItems = buildScopeItems(data, standardsContext || '')
  
  // Build timeline data
  const timelineData = buildTimelineData(data, phase1Start, phase1End, phase2Start, phase2End, phase3Start, phase3End)
  
  // Build moisture and psychrometric data
  const moistureData = buildMoistureData(data)
  const psychrometricData = buildPsychrometricData(data)
  
  // Load business logo if available
  let logoImage: PDFImage | null = null
  if (businessInfo?.businessLogo) {
    try {
      const logoResponse = await fetch(businessInfo.businessLogo)
      const logoBuffer = await logoResponse.arrayBuffer()
      const logoUrl = businessInfo.businessLogo.toLowerCase()
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
  
  const colors = { darkBlue, lightBlue, red, green, orange, black, white, lightGray, darkGray, dividerGray }
  
  // PAGE 1: Executive Summary & Strategic Value
  const page1 = pdfDoc.addPage([595.28, 841.89]) // A4
  await renderPage1(page1, {
    pdfDoc,
    helvetica,
    helveticaBold,
    colors,
    jobRef,
    inspectionDate,
    insurerName,
    propertyAddress,
    technicianName,
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
    buildingAge,
    structureType,
    accessNotes
  })
  
  // PAGE 2: Detailed Scope of Works
  const page2 = pdfDoc.addPage([595.28, 841.89])
  await renderPage2(page2, {
    pdfDoc,
    helvetica,
    helveticaBold,
    colors,
    jobRef,
    scopeItems,
    report,
    equipmentSelection,
    hvacAffected: report.hvacAffected || false
  })
  
  // PAGE 3: Data Evidence & Project Management
  const page3 = pdfDoc.addPage([595.28, 841.89])
  await renderPage3(page3, {
    pdfDoc,
    helvetica,
    helveticaBold,
    colors,
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
    colors,
    jobRef,
    businessInfo: businessInfo || {}
  })
  
  // Add headers and footers to all pages with proper dividers
  const pages = pdfDoc.getPages()
  pages.forEach((page, index) => {
    addHeaderFooter(page, {
      helvetica,
      helveticaBold,
      colors,
      businessInfo: businessInfo || {},
      logoImage,
      jobRef,
      inspectionDate,
      pageNumber: index + 1,
      totalPages: pages.length
    })
  })
  
  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}

/**
 * Render Page 1: Executive Summary & Strategic Value
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
    insurerName: string
    propertyAddress: string
    technicianName: string
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
    buildingAge: number | null
    structureType: string
    accessNotes: string | null
  }
) {
  const { width, height } = page.getSize()
  const { helvetica, helveticaBold, colors, jobRef, inspectionDate, insurerName, propertyAddress, technicianName, waterCategory, waterClass, methScreen, methTestCount, bioMouldDetected, bioMouldCategory, report, analysis, buildingAge, structureType, accessNotes } = options
  const margin = 50
  let yPosition = height - 100 // Start below header
  
  // Section 1: Forensic Investigation Summary
  page.drawText('1. Forensic Investigation Summary', {
    x: margin,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: colors.darkBlue
  })
  
  yPosition -= 25
  
  // Summary text with all data
  const summaryText = buildForensicSummary(report, analysis, waterCategory, waterClass, methScreen, bioMouldDetected, buildingAge, structureType, accessNotes, insurerName, propertyAddress, technicianName)
  const summaryLines = wrapText(summaryText, width - 2 * margin, helvetica, 10)
  
  summaryLines.forEach((line: string) => {
    if (yPosition < 200) return
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
  
  const expertisePoints = [
    '+ Certified Technicians (IICRC WRT/AMRT)',
    '+ OH&S Protocols',
    '+ Scientific Assessment Methods'
  ]
  
  let expertiseY = boxY + boxHeight - 40
  expertisePoints.forEach(point => {
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
  
  const riskPoints = [
    '+ Invisible Threat',
    '+ Avoiding Drying to Rebuild',
    '+ Preventing Future Loss'
  ]
  
  let riskY = boxY + boxHeight - 40
  riskPoints.forEach(point => {
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
  
  page.drawText('X The Rip & Repair Approach (Traditional)', {
    x: margin + 10,
    y: comparisonY + comparisonBoxHeight - 20,
    size: 11,
    font: helveticaBold,
    color: colors.white
  })
  
  const ripRepairPoints = ['X Displacement', 'X Logistics burden', 'X Trade delays']
  let ripY = comparisonY + comparisonBoxHeight - 40
  ripRepairPoints.forEach(point => {
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
  
  page.drawText('+ The Technical Mitigation Approach (Proposed)', {
    x: margin + boxWidth + 30,
    y: comparisonY + comparisonBoxHeight - 20,
    size: 11,
    font: helveticaBold,
    color: colors.white
  })
  
  const mitigationPoints = ['+ Minimal disruption', '+ Rapid turnaround', '+ Expedited claims']
  let mitY = comparisonY + comparisonBoxHeight - 40
  mitigationPoints.forEach(point => {
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

// Continue with other page renderers...
// (I'll continue in the next part due to length)

