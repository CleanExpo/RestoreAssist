/**
 * PDF Export System for RestoreAssist
 *
 * Generates professional PDF documents for:
 * - Inspection Reports (IICRC S500 Compliant)
 * - Scope of Works
 * - Cost Estimations
 * - Complete Package (all three combined)
 *
 * Uses PDFKit for server-side PDF generation with professional formatting
 */

import PDFDocument from 'pdfkit'
import type {
  InspectionReport,
  ScopeOfWorks,
  CostEstimation,
  ReportDepth,
  WaterCategory,
  ReportDocumentStatus,
} from '@prisma/client'

// Type definitions for the JSON data structures
interface AreaAffected {
  room: string
  sqm: number
  moistureReadings?: {
    walls?: number
    floor?: number
    ceiling?: number
  }
  affectedMaterials?: string[]
}

interface Hazard {
  type: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  description: string
  stopWork?: boolean
}

interface ComplianceItem {
  standard: string
  requirement: string
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE'
  notes?: string
}

interface DryingProtocol {
  equipmentPlacement?: EquipmentPlacement[]
  targetHumidity?: number
  targetTemperature?: number
  estimatedDuration?: number
  monitoringSchedule?: string
}

interface EquipmentPlacement {
  equipment: string
  quantity: number
  location: string
}

interface SafetyConsideration {
  category: string
  hazard: string
  mitigation: string
}

interface AuthorityNotification {
  authority: string
  required: boolean
  reason?: string
  contacted?: boolean
  contactDate?: string
}

interface WorkPhase {
  phase: string
  description: string
  duration: number
  dependencies?: string[]
  workItems?: WorkItem[]
}

interface WorkItem {
  category: string
  description: string
  qty: number
  unit: string
  rate?: number
  subtotal?: number
  notes?: string
}

interface LicensedTrade {
  trade: string
  reason: string
  contact?: string
  estimatedCost?: number
}

interface InsuranceBreakdown {
  totalRestoration: number
  totalLicensedTrades: number
  totalContingency: number
  subtotalExGST: number
  gst: number
  totalIncGST: number
}

interface LabourCost {
  category: string
  role: string
  hours: number
  rate: number
  subtotal: number
}

interface EquipmentCost {
  equipment: string
  days: number
  dailyRate: number
  subtotal: number
}

interface ChemicalCost {
  chemical: string
  area: number
  rate: number
  subtotal: number
}

interface CostComparison {
  industryAverage?: number
  variance?: number
  explanation?: string
}

interface ExclusionItem {
  item: string
  reason: string
}

interface AssumptionItem {
  assumption: string
  impact: string
}

interface AdjustmentTrigger {
  condition: string
  impact: string
}

// Extended types with parsed JSON fields
interface InspectionReportData extends InspectionReport {
  areasAffected?: AreaAffected[]
  hazardsIdentified?: Hazard[]
  standardsCompliance?: ComplianceItem[]
  dryingProtocol?: DryingProtocol
  safetyConsiderations?: SafetyConsideration[]
  authorityNotifications?: AuthorityNotification[]
}

interface ScopeOfWorksData extends ScopeOfWorks {
  phases?: WorkPhase[]
  restorationWorkItems?: WorkItem[]
  licensedTradesRequired?: LicensedTrade[]
  insuranceClaimBreakdown?: InsuranceBreakdown
}

interface CostEstimationData extends Omit<CostEstimation, 'calloutFees' | 'adminFees' | 'subtotalExGST' | 'gstAmount' | 'totalIncGST'> {
  labourCosts?: LabourCost[]
  equipmentCosts?: EquipmentCost[]
  chemicalCosts?: ChemicalCost[]
  costComparison?: CostComparison
  exclusions?: ExclusionItem[]
  assumptions?: AssumptionItem[]
  adjustmentTriggers?: AdjustmentTrigger[]
  calloutFees?: number
  adminFees?: number
  subtotalExGST?: number
  gstAmount?: number
  totalIncGST?: number
}

/**
 * Export Inspection Report to PDF
 */
export async function exportInspectionReportToPDF(
  report: InspectionReportData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Cover Page with Watermark
      doc.fontSize(24).fillColor('red').text('PRELIMINARY ASSESSMENT REPORT', { align: 'center' })
      doc.fontSize(14).fillColor('red').text('NOT A FINAL ESTIMATE', { align: 'center' })
      doc.fontSize(12).fillColor('black').text('FOR INSURANCE AND PLANNING PURPOSES ONLY', { align: 'center' })
      doc.moveDown(2)

      // Header Information
      doc.fontSize(12)
      addField(doc, 'Claim Reference', report.claimReference)
      addField(doc, 'Property Address', report.propertyAddress)
      addField(doc, 'Client Name', report.clientName)
      addField(doc, 'Technician', report.technicianName)
      addField(doc, 'Incident Date', new Date(report.incidentDate).toLocaleDateString('en-AU'))
      addField(doc, 'Attendance Date', new Date(report.attendanceDate).toLocaleDateString('en-AU'))
      addField(doc, 'Report Generated', new Date(report.generatedDate).toLocaleDateString('en-AU'))
      addField(doc, 'Report Depth', report.reportDepth)
      addField(doc, 'Version', report.version.toString())

      doc.addPage()

      // Table of Contents
      doc.fontSize(18).text('TABLE OF CONTENTS', { underline: true })
      doc.moveDown()
      doc.fontSize(11)
      doc.text('1. Executive Summary')
      doc.text('2. Loss Details')
      doc.text('3. Areas Affected')
      doc.text('4. Standards Compliance Framework')
      doc.text('5. Hazard Assessment')
      doc.text('6. Drying Protocol and Methodology')
      doc.text('7. Safety Considerations')
      doc.text('8. Authority Notifications')
      doc.text('9. Recommendations')

      doc.addPage()

      // 1. Executive Summary
      doc.fontSize(18).text('1. EXECUTIVE SUMMARY', { underline: true })
      doc.moveDown()
      doc.fontSize(11).text(report.executiveSummary || 'No executive summary available.', { align: 'justify' })

      doc.addPage()

      // 2. Loss Details
      doc.fontSize(18).text('2. LOSS DETAILS', { underline: true })
      doc.moveDown()
      doc.fontSize(14).text('Property Information', { underline: true })
      doc.fontSize(11)
      addField(doc, 'Property Type', report.propertyType || 'Not specified')
      addField(doc, 'Construction Year', report.constructionYear?.toString() || 'Not specified')
      addField(doc, 'Occupancy Status', report.occupancyStatus || 'Not specified')
      doc.moveDown()

      doc.fontSize(14).text('Water Damage Classification', { underline: true })
      doc.fontSize(11)
      if (report.waterCategory) {
        addField(doc, 'Water Category', report.waterCategory.replace('_', ' '))

        const categoryDescriptions: Record<string, string> = {
          'CATEGORY_1': 'Category 1: Clean water from a sanitary source (e.g., broken water supply line)',
          'CATEGORY_2': 'Category 2: Grey water with potential contamination (e.g., washing machine overflow)',
          'CATEGORY_3': 'Category 3: Black water with pathogenic contamination (e.g., sewage backup)'
        }
        doc.text(categoryDescriptions[report.waterCategory] || '', { align: 'justify' })
        doc.moveDown()
      }

      if (report.technicianReport) {
        doc.fontSize(14).text('Technician Notes', { underline: true })
        doc.fontSize(11).text(report.technicianReport, { align: 'justify' })
      }

      doc.addPage()

      // 3. Areas Affected
      doc.fontSize(18).text('3. AREAS AFFECTED', { underline: true })
      doc.moveDown()

      if (report.areasAffected && report.areasAffected.length > 0) {
        report.areasAffected.forEach((area, index) => {
          doc.fontSize(14).text(`${index + 1}. ${area.room}`, { underline: true })
          doc.fontSize(11)
          addField(doc, 'Area', `${area.sqm} sqm`)

          if (area.moistureReadings) {
            doc.text('Moisture Readings:')
            if (area.moistureReadings.walls !== undefined) {
              doc.text(`  • Walls: ${area.moistureReadings.walls}%`)
            }
            if (area.moistureReadings.floor !== undefined) {
              doc.text(`  • Floor: ${area.moistureReadings.floor}%`)
            }
            if (area.moistureReadings.ceiling !== undefined) {
              doc.text(`  • Ceiling: ${area.moistureReadings.ceiling}%`)
            }
          }

          if (area.affectedMaterials && area.affectedMaterials.length > 0) {
            doc.text('Affected Materials:')
            area.affectedMaterials.forEach(material => {
              doc.text(`  • ${material}`)
            })
          }
          doc.moveDown()
        })
      } else {
        doc.fontSize(11).text('No area data available.')
      }

      doc.addPage()

      // 4. Standards Compliance Framework
      doc.fontSize(18).text('4. STANDARDS COMPLIANCE FRAMEWORK', { underline: true })
      doc.moveDown()
      doc.fontSize(11).text('This assessment follows industry best practices and standards:')
      doc.text('• IICRC S500 - Standard and Reference Guide for Professional Water Damage Restoration')
      doc.text('• Queensland National Construction Code (NCC) - Building Code of Australia')
      doc.text('• AS/NZS 3733:2018 - Occupational clothing — High-visibility clothing')
      doc.text('• Work Health and Safety Act 2011 (Queensland)')
      doc.moveDown()

      if (report.standardsCompliance && report.standardsCompliance.length > 0) {
        doc.fontSize(14).text('Compliance Checklist', { underline: true })
        doc.moveDown()

        // Create table
        const tableTop = doc.y
        const rowHeight = 20
        let y = tableTop

        report.standardsCompliance.forEach((item, index) => {
          if (y > 700) {
            doc.addPage()
            y = 50
          }

          doc.fontSize(10)
          doc.text(`${item.standard}`, 50, y, { width: 100 })
          doc.text(item.requirement.substring(0, 50), 160, y, { width: 150 })
          doc.text(item.status, 320, y, { width: 80 })
          doc.text(item.notes?.substring(0, 30) || '-', 410, y, { width: 130 })

          y += rowHeight
        })
      }

      doc.addPage()

      // 5. Hazard Assessment
      doc.fontSize(18).text('5. HAZARD ASSESSMENT', { underline: true })
      doc.moveDown()

      if (report.hazardsIdentified && report.hazardsIdentified.length > 0) {
        const stopWorkHazards = report.hazardsIdentified.filter(h => h.stopWork)
        const criticalHazards = report.hazardsIdentified.filter(h => h.severity === 'CRITICAL' && !h.stopWork)
        const otherHazards = report.hazardsIdentified.filter(h => h.severity !== 'CRITICAL' && !h.stopWork)

        if (stopWorkHazards.length > 0) {
          doc.fontSize(14).fillColor('red').text('STOP WORK CONDITIONS', { underline: true })
          doc.fillColor('black')
          stopWorkHazards.forEach(hazard => {
            doc.rect(50, doc.y, 500, 60).fillAndStroke('red', 'darkred')
            doc.fillColor('white').fontSize(12)
            doc.text(`STOP WORK: ${hazard.type}`, 60, doc.y - 50, { width: 480 })
            doc.text(hazard.description, 60, doc.y - 30, { width: 480 })
            doc.text('DO NOT PROCEED WITHOUT ADDRESSING THIS HAZARD', 60, doc.y - 10, { width: 480 })
            doc.fillColor('black')
            doc.moveDown(4)
          })
        }

        if (criticalHazards.length > 0) {
          doc.fontSize(14).fillColor('orange').text('CRITICAL HAZARDS', { underline: true })
          doc.fillColor('black')
          criticalHazards.forEach(hazard => {
            doc.rect(50, doc.y, 500, 40).fillAndStroke('orange', 'darkorange')
            doc.fillColor('white').fontSize(11)
            doc.text(`WARNING: ${hazard.type} - ${hazard.description}`, 60, doc.y - 30, { width: 480 })
            doc.fillColor('black')
            doc.moveDown(3)
          })
        }

        if (otherHazards.length > 0) {
          doc.fontSize(14).text('Additional Hazards', { underline: true })
          doc.moveDown()
          otherHazards.forEach(hazard => {
            doc.fontSize(11).text(`• ${hazard.type} [${hazard.severity}]: ${hazard.description}`)
          })
        }
      } else {
        doc.fontSize(11).text('No hazards identified.')
      }

      doc.addPage()

      // 6. Drying Protocol
      doc.fontSize(18).text('6. DRYING PROTOCOL AND METHODOLOGY', { underline: true })
      doc.moveDown()

      if (report.dryingProtocol) {
        const protocol = report.dryingProtocol

        doc.fontSize(14).text('Target Parameters', { underline: true })
        doc.fontSize(11)
        if (protocol.targetHumidity) addField(doc, 'Target Humidity', `${protocol.targetHumidity}% RH`)
        if (protocol.targetTemperature) addField(doc, 'Target Temperature', `${protocol.targetTemperature}°C`)
        if (protocol.estimatedDuration) addField(doc, 'Estimated Drying Duration', `${protocol.estimatedDuration} days`)
        doc.moveDown()

        if (protocol.equipmentPlacement && protocol.equipmentPlacement.length > 0) {
          doc.fontSize(14).text('Equipment Placement Schedule', { underline: true })
          doc.moveDown()
          protocol.equipmentPlacement.forEach(eq => {
            doc.fontSize(11).text(`• ${eq.equipment} (Qty: ${eq.quantity}) - ${eq.location}`)
          })
          doc.moveDown()
        }

        if (protocol.monitoringSchedule) {
          doc.fontSize(14).text('Monitoring Schedule', { underline: true })
          doc.fontSize(11).text(protocol.monitoringSchedule, { align: 'justify' })
        }
      } else {
        doc.fontSize(11).text('No drying protocol data available.')
      }

      doc.addPage()

      // 7. Safety Considerations
      doc.fontSize(18).text('7. OCCUPANCY AND SAFETY CONSIDERATIONS', { underline: true })
      doc.moveDown()

      if (report.safetyConsiderations && report.safetyConsiderations.length > 0) {
        report.safetyConsiderations.forEach(safety => {
          doc.fontSize(14).text(safety.category, { underline: true })
          doc.fontSize(11)
          addField(doc, 'Hazard', safety.hazard)
          addField(doc, 'Mitigation', safety.mitigation)
          doc.moveDown()
        })
      } else {
        doc.fontSize(11).text('No specific safety considerations documented.')
      }

      doc.addPage()

      // 8. Authority Notifications
      doc.fontSize(18).text('8. AUTHORITY NOTIFICATION CHECKLIST', { underline: true })
      doc.moveDown()

      if (report.authorityNotifications && report.authorityNotifications.length > 0) {
        report.authorityNotifications.forEach(notif => {
          doc.fontSize(11)
          doc.text(`• ${notif.authority} - ${notif.required ? 'REQUIRED' : 'Not Required'}`)
          if (notif.reason) doc.text(`  Reason: ${notif.reason}`)
          if (notif.contacted) doc.text(`  Contacted: ${notif.contactDate || 'Yes'}`)
          doc.moveDown()
        })
      } else {
        doc.fontSize(11).text('No authority notifications required.')
      }

      doc.addPage()

      // 9. Recommendations
      doc.fontSize(18).text('9. RECOMMENDATIONS', { underline: true })
      doc.moveDown()
      doc.fontSize(11).text(report.recommendations || 'No recommendations available.', { align: 'justify' })

      doc.moveDown(2)
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      doc.moveDown()
      doc.fontSize(10).fillColor('gray')
      doc.text('This is a preliminary assessment and not a final estimate.', { align: 'center' })
      doc.text('Actual costs may vary based on hidden damage discovered during restoration work.', { align: 'center' })
      doc.text('All work will be performed in accordance with IICRC S500 standards.', { align: 'center' })

      // Add page numbers
      const pageCount = doc.bufferedPageRange().count
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i)
        doc.fontSize(8).fillColor('gray').text(
          `Page ${i + 1} of ${pageCount} | Generated by RestoreAssist on ${new Date().toLocaleString('en-AU')}`,
          50,
          doc.page.height - 30,
          { align: 'center' }
        )
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Export Scope of Works to PDF
 */
export async function exportScopeOfWorksToPDF(
  scope: ScopeOfWorksData,
  claimReference: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Header
      doc.fontSize(20).text('SCOPE OF WORKS', { align: 'center' })
      doc.moveDown()
      doc.fontSize(12)
      addField(doc, 'Claim Reference', claimReference)
      addField(doc, 'Status', scope.status)
      addField(doc, 'Version', scope.version.toString())
      addField(doc, 'Generated', new Date().toLocaleDateString('en-AU'))
      doc.moveDown(2)

      // Phases
      if (scope.phases && scope.phases.length > 0) {
        doc.fontSize(18).text('REMEDIATION PHASES', { underline: true })
        doc.moveDown()

        scope.phases.forEach((phase, index) => {
          doc.fontSize(14).text(`Phase ${index + 1}: ${phase.phase}`, { underline: true })
          doc.fontSize(11)
          addField(doc, 'Description', phase.description)
          addField(doc, 'Duration', `${phase.duration} days`)

          if (phase.dependencies && phase.dependencies.length > 0) {
            doc.text('Dependencies:')
            phase.dependencies.forEach(dep => {
              doc.text(`  • ${dep}`)
            })
          }

          if (phase.workItems && phase.workItems.length > 0) {
            doc.moveDown()
            doc.text('Work Items:')
            doc.moveDown(0.5)

            phase.workItems.forEach(item => {
              const rateStr = item.rate ? `$${item.rate.toFixed(2)}` : '-'
              const subtotalStr = item.subtotal ? `$${item.subtotal.toFixed(2)}` : '-'
              doc.text(`  ${item.description} - ${item.qty} ${item.unit} @ ${rateStr} = ${subtotalStr}`)
            })
          }

          doc.moveDown()
          doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
          doc.moveDown()
        })
      }

      // Restoration Work Items
      if (scope.restorationWorkItems && scope.restorationWorkItems.length > 0) {
        doc.addPage()
        doc.fontSize(18).text('RESTORATION WORK ITEMS', { underline: true })
        doc.moveDown()

        // Group by category
        const categories = new Map<string, WorkItem[]>()
        scope.restorationWorkItems.forEach(item => {
          if (!categories.has(item.category)) {
            categories.set(item.category, [])
          }
          categories.get(item.category)!.push(item)
        })

        categories.forEach((items, category) => {
          doc.fontSize(14).text(category, { underline: true })
          doc.moveDown(0.5)

          items.forEach(item => {
            const rateStr = item.rate ? `$${item.rate.toFixed(2)}` : '-'
            const subtotalStr = item.subtotal ? `$${item.subtotal.toFixed(2)}` : '-'
            doc.fontSize(10).text(`${item.description}`, 50, doc.y, { continued: true, width: 250 })
            doc.text(`${item.qty} ${item.unit}`, 310, doc.y, { continued: true, width: 80 })
            doc.text(`${rateStr}`, 400, doc.y, { continued: true, width: 70 })
            doc.text(`${subtotalStr}`, 480, doc.y, { width: 70 })
          })

          // Category total
          const categoryTotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0)
          if (categoryTotal > 0) {
            doc.fontSize(11).fillColor('blue')
            doc.text(`${category} Subtotal: $${categoryTotal.toFixed(2)}`, { align: 'right' })
            doc.fillColor('black')
          }

          doc.moveDown()
          doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
          doc.moveDown()
        })
      }

      // Licensed Trades
      if (scope.licensedTradesRequired && scope.licensedTradesRequired.length > 0) {
        doc.addPage()
        doc.fontSize(18).text('LICENSED TRADES REQUIRED', { underline: true })
        doc.moveDown()

        doc.rect(50, doc.y, 500, 30).fillAndStroke('orange', 'darkorange')
        doc.fillColor('white').fontSize(12)
        doc.text('The following specialist trades require licensed professionals', 60, doc.y - 20, { width: 480 })
        doc.fillColor('black')
        doc.moveDown(2)

        scope.licensedTradesRequired.forEach(trade => {
          doc.fontSize(12).text(trade.trade, { underline: true })
          doc.fontSize(10)
          addField(doc, 'Reason', trade.reason)
          addField(doc, 'Contact', trade.contact || 'TBA')
          if (trade.estimatedCost) addField(doc, 'Estimated Cost', `$${trade.estimatedCost.toFixed(2)}`)
          doc.moveDown()
        })
      }

      // Insurance Claim Breakdown
      if (scope.insuranceClaimBreakdown) {
        doc.addPage()
        doc.fontSize(18).text('INSURANCE CLAIM BREAKDOWN', { underline: true })
        doc.moveDown()

        const breakdown = scope.insuranceClaimBreakdown
        doc.fontSize(12)
        addField(doc, 'Restoration Works', `$${breakdown.totalRestoration.toFixed(2)}`)
        addField(doc, 'Licensed Trades', `$${breakdown.totalLicensedTrades.toFixed(2)}`)
        addField(doc, 'Contingency', `$${breakdown.totalContingency.toFixed(2)}`)
        doc.moveDown()
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
        doc.moveDown()
        addField(doc, 'Subtotal (ex-GST)', `$${breakdown.subtotalExGST.toFixed(2)}`)
        addField(doc, 'GST (10%)', `$${breakdown.gst.toFixed(2)}`)
        doc.moveDown()
        doc.fontSize(16).fillColor('blue')
        addField(doc, 'TOTAL (inc-GST)', `$${breakdown.totalIncGST.toFixed(2)}`)
        doc.fillColor('black')
      }

      // Coordination Notes
      if (scope.coordinationNotes) {
        doc.addPage()
        doc.fontSize(18).text('PROJECT COORDINATION NOTES', { underline: true })
        doc.moveDown()
        doc.fontSize(11).text(scope.coordinationNotes, { align: 'justify' })
      }

      // Add page numbers
      const pageCount = doc.bufferedPageRange().count
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i)
        doc.fontSize(8).fillColor('gray').text(
          `Page ${i + 1} of ${pageCount} | Generated by RestoreAssist on ${new Date().toLocaleString('en-AU')}`,
          50,
          doc.page.height - 30,
          { align: 'center' }
        )
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Export Cost Estimation to PDF
 */
export async function exportCostEstimationToPDF(
  estimation: CostEstimationData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Header
      doc.fontSize(20).text('RestoreAssist Cost Estimation', { align: 'center' })
      doc.moveDown()
      doc.fontSize(12).text(`Report #${report.reportNumber}`, { align: 'center' })
      doc.fontSize(10).text(`Version ${estimate.version} - ${estimate.status}`, { align: 'center' })
      doc.moveDown(2)

      // Line Items Table
      doc.fontSize(16).text('Line Items', { underline: true })
      doc.moveDown()

      // Table header
      doc.fontSize(9)
      const tableTop = doc.y
      const colWidths = { desc: 200, qty: 50, unit: 50, rate: 60, total: 80 }
      let xPos = 50

      doc.text('Description', xPos, tableTop, { width: colWidths.desc })
      xPos += colWidths.desc
      doc.text('Qty', xPos, tableTop, { width: colWidths.qty })
      xPos += colWidths.qty
      doc.text('Unit', xPos, tableTop, { width: colWidths.unit })
      xPos += colWidths.unit
      doc.text('Rate', xPos, tableTop, { width: colWidths.rate })
      xPos += colWidths.rate
      doc.text('Total', xPos, tableTop, { width: colWidths.total })

      doc.moveDown()
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      doc.moveDown(0.5)

      // Table rows
      estimate.lineItems.forEach((item) => {
        xPos = 50
        const yPos = doc.y

        doc.text(item.description, xPos, yPos, { width: colWidths.desc })
        xPos += colWidths.desc
        doc.text(item.quantity.toString(), xPos, yPos, { width: colWidths.qty })
        xPos += colWidths.qty
        doc.text(item.unit, xPos, yPos, { width: colWidths.unit })
        xPos += colWidths.unit
        doc.text(formatCurrency(item.unitRate), xPos, yPos, { width: colWidths.rate })
        xPos += colWidths.rate
        doc.text(formatCurrency(item.totalCost), xPos, yPos, { width: colWidths.total })

        doc.moveDown()
      })

      doc.moveDown()

      // Cost Breakdown
      doc.fontSize(16).text('Cost Breakdown', { underline: true })
      doc.moveDown()
      doc.fontSize(11)
      addField(doc, 'Labour Subtotal', formatCurrency(estimate.labourSubtotal))
      addField(doc, 'Equipment Subtotal', formatCurrency(estimate.equipmentSubtotal))
      addField(doc, 'Chemicals Subtotal', formatCurrency(estimate.chemicalsSubtotal))
      addField(doc, 'Subcontractor Subtotal', formatCurrency(estimate.subcontractorSubtotal))
      addField(doc, 'Travel Subtotal', formatCurrency(estimate.travelSubtotal))
      addField(doc, 'Waste Subtotal', formatCurrency(estimate.wasteSubtotal))
      doc.moveDown()
      addField(doc, 'Overheads', formatCurrency(estimate.overheads))
      addField(doc, 'Profit', formatCurrency(estimate.profit))
      addField(doc, 'Contingency', formatCurrency(estimate.contingency))
      addField(doc, 'Escalation', formatCurrency(estimate.escalation))
      doc.moveDown()
      doc.fontSize(13).fillColor('blue')
      addField(doc, 'Subtotal (Ex GST)', formatCurrency(estimate.subtotalExGST))
      addField(doc, 'GST', formatCurrency(estimate.gst))
      doc.fontSize(15).fillColor('darkblue')
      addField(doc, 'TOTAL (Inc GST)', formatCurrency(estimate.totalIncGST))
      doc.fillColor('black').fontSize(11)
      doc.moveDown()

      // Assumptions
      if (estimate.assumptions) {
        doc.fontSize(14).text('Assumptions', { underline: true })
        doc.moveDown()
        doc.fontSize(10).text(estimate.assumptions, { align: 'justify' })
        doc.moveDown()
      }

      // Inclusions
      if (estimate.inclusions) {
        doc.fontSize(14).text('Inclusions', { underline: true })
        doc.moveDown()
        doc.fontSize(10).text(estimate.inclusions, { align: 'justify' })
        doc.moveDown()
      }

      // Exclusions
      if (estimate.exclusions) {
        doc.fontSize(14).text('Exclusions', { underline: true })
        doc.moveDown()
        doc.fontSize(10).text(estimate.exclusions, { align: 'justify' })
        doc.moveDown()
      }

      // Footer
      doc.fontSize(8).text(
        `Generated by RestoreAssist on ${new Date().toLocaleString()}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      )

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Export complete package (inspection + scope + estimation) to PDF
 */
export async function exportCompletePackageToPDF(
  report: ReportWithRelations,
  scope: Scope,
  estimate: Estimate & { lineItems: EstimateLineItem[] }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Cover Page
      doc.fontSize(24).text('RestoreAssist', { align: 'center' })
      doc.moveDown()
      doc.fontSize(20).text('Complete Restoration Package', { align: 'center' })
      doc.moveDown(2)
      doc.fontSize(14).text(`Report #${report.reportNumber}`, { align: 'center' })
      doc.fontSize(12).text(report.title, { align: 'center' })
      doc.moveDown(2)
      doc.fontSize(10).text(`Prepared for: ${report.clientName || 'Client'}`, { align: 'center' })
      doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' })

      // Page 2: Report Details
      doc.addPage()
      doc.fontSize(18).text('1. Inspection Report', { underline: true })
      doc.moveDown()

      doc.fontSize(14).text('Report Details')
      doc.moveDown()
      doc.fontSize(11)
      addField(doc, 'Title', report.title)
      addField(doc, 'Status', report.status)
      addField(doc, 'Inspection Date', report.inspectionDate ? new Date(report.inspectionDate).toLocaleDateString() : 'N/A')
      addField(doc, 'Property Address', report.propertyAddress || 'N/A')
      addField(doc, 'Hazard Type', report.hazardType || 'N/A')
      addField(doc, 'Insurance Type', report.insuranceType || 'N/A')
      doc.moveDown()

      if (report.client) {
        doc.fontSize(14).text('Client Information')
        doc.moveDown()
        doc.fontSize(11)
        addField(doc, 'Name', report.client.name)
        if (report.client.company) addField(doc, 'Company', report.client.company)
        if (report.client.email) addField(doc, 'Email', report.client.email)
        if (report.client.phone) addField(doc, 'Phone', report.client.phone)
        doc.moveDown()
      }

      doc.fontSize(14).text('Assessment Details')
      doc.moveDown()
      doc.fontSize(11)
      if (report.waterCategory) addField(doc, 'Water Category', report.waterCategory)
      if (report.waterClass) addField(doc, 'Water Class', report.waterClass)
      if (report.sourceOfWater) addField(doc, 'Source of Water', report.sourceOfWater)
      if (report.affectedArea) addField(doc, 'Affected Area', report.affectedArea)
      doc.moveDown()

      if (report.description) {
        doc.fontSize(14).text('Description')
        doc.moveDown()
        doc.fontSize(11).text(report.description, { align: 'justify' })
        doc.moveDown()
      }

      if (report.detailedReport) {
        doc.fontSize(14).text('Detailed Report')
        doc.moveDown()
        doc.fontSize(11).text(report.detailedReport, { align: 'justify' })
      }

      // Page 3: Scope of Work
      doc.addPage()
      doc.fontSize(18).text('2. Scope of Work', { underline: true })
      doc.moveDown()

      doc.fontSize(11)
      addField(doc, 'Scope Type', scope.scopeType)
      addField(doc, 'Total Duration', scope.totalDuration ? `${scope.totalDuration} hours` : 'N/A')
      doc.moveDown()

      doc.fontSize(14).text('Cost Summary')
      doc.moveDown()
      doc.fontSize(11)
      addField(doc, 'Labour Cost Total', formatCurrency(scope.labourCostTotal))
      addField(doc, 'Equipment Cost Total', formatCurrency(scope.equipmentCostTotal))
      addField(doc, 'Chemical Cost Total', formatCurrency(scope.chemicalCostTotal))
      doc.moveDown()

      if (scope.complianceNotes) {
        doc.fontSize(14).text('Compliance Notes')
        doc.moveDown()
        doc.fontSize(11).text(scope.complianceNotes, { align: 'justify' })
        doc.moveDown()
      }

      if (scope.assumptions) {
        doc.fontSize(14).text('Assumptions')
        doc.moveDown()
        doc.fontSize(11).text(scope.assumptions, { align: 'justify' })
        doc.moveDown()
      }

      // Page 4+: Estimation
      doc.addPage()
      doc.fontSize(18).text('3. Cost Estimation', { underline: true })
      doc.moveDown()
      doc.fontSize(12).text(`Version ${estimate.version} - ${estimate.status}`)
      doc.moveDown(2)

      // Line Items Table
      doc.fontSize(14).text('Line Items')
      doc.moveDown()

      doc.fontSize(9)
      const tableTop = doc.y
      const colWidths = { desc: 200, qty: 50, unit: 50, rate: 60, total: 80 }
      let xPos = 50

      doc.text('Description', xPos, tableTop, { width: colWidths.desc })
      xPos += colWidths.desc
      doc.text('Qty', xPos, tableTop, { width: colWidths.qty })
      xPos += colWidths.qty
      doc.text('Unit', xPos, tableTop, { width: colWidths.unit })
      xPos += colWidths.unit
      doc.text('Rate', xPos, tableTop, { width: colWidths.rate })
      xPos += colWidths.rate
      doc.text('Total', xPos, tableTop, { width: colWidths.total })

      doc.moveDown()
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      doc.moveDown(0.5)

      estimate.lineItems.forEach((item) => {
        xPos = 50
        const yPos = doc.y

        doc.text(item.description, xPos, yPos, { width: colWidths.desc })
        xPos += colWidths.desc
        doc.text(item.quantity.toString(), xPos, yPos, { width: colWidths.qty })
        xPos += colWidths.qty
        doc.text(item.unit, xPos, yPos, { width: colWidths.unit })
        xPos += colWidths.unit
        doc.text(formatCurrency(item.unitRate), xPos, yPos, { width: colWidths.rate })
        xPos += colWidths.rate
        doc.text(formatCurrency(item.totalCost), xPos, yPos, { width: colWidths.total })

        doc.moveDown()
      })

      doc.moveDown(2)

      // Cost Breakdown
      doc.fontSize(14).text('Cost Breakdown')
      doc.moveDown()
      doc.fontSize(11)
      addField(doc, 'Labour Subtotal', formatCurrency(estimate.labourSubtotal))
      addField(doc, 'Equipment Subtotal', formatCurrency(estimate.equipmentSubtotal))
      addField(doc, 'Chemicals Subtotal', formatCurrency(estimate.chemicalsSubtotal))
      addField(doc, 'Subcontractor Subtotal', formatCurrency(estimate.subcontractorSubtotal))
      addField(doc, 'Travel Subtotal', formatCurrency(estimate.travelSubtotal))
      addField(doc, 'Waste Subtotal', formatCurrency(estimate.wasteSubtotal))
      doc.moveDown()
      addField(doc, 'Overheads', formatCurrency(estimate.overheads))
      addField(doc, 'Profit', formatCurrency(estimate.profit))
      addField(doc, 'Contingency', formatCurrency(estimate.contingency))
      addField(doc, 'Escalation', formatCurrency(estimate.escalation))
      doc.moveDown()
      doc.fontSize(13).fillColor('blue')
      addField(doc, 'Subtotal (Ex GST)', formatCurrency(estimate.subtotalExGST))
      addField(doc, 'GST', formatCurrency(estimate.gst))
      doc.fontSize(15).fillColor('darkblue')
      addField(doc, 'TOTAL (Inc GST)', formatCurrency(estimate.totalIncGST))
      doc.fillColor('black').fontSize(11)

      // Footer on all pages
      const pageCount = doc.bufferedPageRange().count
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i)
        doc.fontSize(8).text(
          `Page ${i + 1} of ${pageCount} | Generated by RestoreAssist on ${new Date().toLocaleString()}`,
          50,
          doc.page.height - 50,
          { align: 'center' }
        )
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

// Helper functions
function addField(doc: PDFKit.PDFDocument, label: string, value: string | number) {
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
  doc.font('Helvetica').text(String(value))
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '$0.00'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(value)
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}
