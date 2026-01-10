import ExcelJS from 'exceljs'
import { format } from 'date-fns'

/**
 * Professional Excel export utilities for RestoreAssist reports
 * Includes ALL data from the database (except images)
 */

export interface ExcelExportOptions {
  includeScope?: boolean
  includeEstimate?: boolean
  includePhotos?: boolean
}

/**
 * Helper to safely parse JSON
 */
function safeParse(value: any): any {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

/**
 * Helper to format date
 */
function formatDate(date: any): string {
  if (!date) return 'N/A'
  try {
    return format(new Date(date), 'dd/MM/yyyy HH:mm')
  } catch {
    return String(date)
  }
}

/**
 * Helper to format date only
 */
function formatDateOnly(date: any): string {
  if (!date) return 'N/A'
  try {
    return format(new Date(date), 'dd/MM/yyyy')
  } catch {
    return String(date)
  }
}

/**
 * Generate a professional Excel workbook for a single report with ALL data
 */
export async function generateSingleReportExcel(
  report: any,
  options: ExcelExportOptions = {}
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'RestoreAssist'
  workbook.created = new Date()
  workbook.modified = new Date()

  // Parse all JSON fields
  const structuredData = safeParse(report.detailedReport)
  const scopeData = safeParse(report.scopeOfWorksData)
  const costData = safeParse(report.costEstimationData)
  const technicianAnalysis = safeParse(report.technicianReportAnalysis)
  const tier1Responses = safeParse(report.tier1Responses)
  const tier2Responses = safeParse(report.tier2Responses)
  const tier3Responses = safeParse(report.tier3Responses)
  const psychrometricReadings = safeParse(report.psychrometricReadings)
  const moistureReadings = safeParse(report.moistureReadings)
  const psychrometricAssessment = safeParse(report.psychrometricAssessment)
  const scopeAreas = safeParse(report.scopeAreas)
  const equipmentSelection = safeParse(report.equipmentSelection)
  const geographicIntelligence = safeParse(report.geographicIntelligence)
  const versionHistory = safeParse(report.versionHistory)
  const validationWarnings = safeParse(report.validationWarnings)
  const validationErrors = safeParse(report.validationErrors)
  const propertyCover = safeParse(report.propertyCover)
  const contentsCover = safeParse(report.contentsCover)
  const liabilityCover = safeParse(report.liabilityCover)
  const businessInterruption = safeParse(report.businessInterruption)
  const additionalCover = safeParse(report.additionalCover)

  // ============================================
  // SHEET 1: EXECUTIVE SUMMARY
  // ============================================
  const summarySheet = workbook.addWorksheet('Executive Summary')
  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const summaryRows = [
    { field: 'Report ID', value: report.id || 'N/A' },
    { field: 'Report Number', value: report.reportNumber || 'N/A' },
    { field: 'Report Title', value: report.title || 'N/A' },
    { field: 'Description', value: report.description || 'N/A' },
    { field: 'Status', value: report.status || 'N/A' },
    { field: 'Report Depth Level', value: report.reportDepthLevel || 'N/A' },
    { field: 'Report Version', value: report.reportVersion?.toString() || '1' },
    { field: 'Completeness Score', value: report.completenessScore ? `${report.completenessScore}%` : 'N/A' },
    { field: 'Client Name', value: report.clientName || 'N/A' },
    { field: 'Property Address', value: report.propertyAddress || 'N/A' },
    { field: 'Property Postcode', value: report.propertyPostcode || 'N/A' },
    { field: 'Property ID', value: report.propertyId || 'N/A' },
    { field: 'Job Number', value: report.jobNumber || 'N/A' },
    { field: 'Hazard Type', value: report.hazardType || 'N/A' },
    { field: 'Insurance Type', value: report.insuranceType || 'N/A' },
    { field: 'Inspection Date', value: formatDateOnly(report.inspectionDate) },
    { field: 'Incident Date', value: formatDateOnly(report.incidentDate) },
    { field: 'Technician Attendance Date', value: formatDateOnly(report.technicianAttendanceDate) },
    { field: 'Technician Name', value: report.technicianName || 'N/A' },
    { field: 'Water Category', value: report.waterCategory || 'N/A' },
    { field: 'Water Class', value: report.waterClass || 'N/A' },
    { field: 'Source of Water', value: report.sourceOfWater || 'N/A' },
    { field: 'Affected Area (sqm)', value: report.affectedArea?.toString() || 'N/A' },
    { field: 'Total Cost', value: report.totalCost ? `$${Number(report.totalCost).toFixed(2)}` : 'N/A' },
    { field: 'Equipment Cost Total', value: report.equipmentCostTotal ? `$${Number(report.equipmentCostTotal).toFixed(2)}` : 'N/A' },
    { field: 'Estimated Drying Duration (days)', value: report.estimatedDryingDuration?.toString() || 'N/A' },
    { field: 'Completion Date', value: formatDateOnly(report.completionDate) },
    { field: 'Created At', value: formatDate(report.createdAt) },
    { field: 'Last Updated', value: formatDate(report.updatedAt) },
    { field: 'Last Edited By', value: report.lastEditedBy || 'N/A' },
    { field: 'Last Edited At', value: formatDate(report.lastEditedAt) }
  ]

  summarySheet.addRows(summaryRows)
  formatHeaderRow(summarySheet, 1)
  applyAlternatingRows(summarySheet, 2, summaryRows.length + 1)

  // ============================================
  // SHEET 2: INSPECTOR INFORMATION
  // ============================================
  const inspectorSheet = workbook.addWorksheet('Inspector Information')
  inspectorSheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const inspectorRows = [
    { field: 'Inspector Name', value: report.technicianName || report.user?.name || 'N/A' },
    { field: 'Inspector ID', value: report.reportNumber || report.id || 'N/A' },
    { field: '', value: '' },
    { field: 'BUSINESS INFORMATION', value: '' }
  ]

  // Add business information from user if available
  if (report.user) {
    inspectorRows.push(
      { field: 'Business Name', value: report.user.businessName || 'N/A' },
      { field: 'Business Address', value: report.user.businessAddress || 'N/A' },
      { field: 'Business ABN', value: report.user.businessABN || 'N/A' },
      { field: 'Business Phone', value: report.user.businessPhone || 'N/A' },
      { field: 'Business Email', value: report.user.businessEmail || 'N/A' }
    )
  }

  // Also check structured data for header business info
  if (structuredData && structuredData.header) {
    if (!report.user?.businessName && structuredData.header.businessName) {
      inspectorRows.push(
        { field: '', value: '' },
        { field: 'FROM REPORT HEADER', value: '' },
        { field: 'Business Name', value: structuredData.header.businessName || 'N/A' },
        { field: 'Business Address', value: structuredData.header.businessAddress || 'N/A' },
        { field: 'Business ABN', value: structuredData.header.businessABN || 'N/A' },
        { field: 'Business Phone', value: structuredData.header.businessPhone || 'N/A' },
        { field: 'Business Email', value: structuredData.header.businessEmail || 'N/A' }
      )
    }
  }

  inspectorSheet.addRows(inspectorRows)
  formatHeaderRow(inspectorSheet, 1)
  applyAlternatingRows(inspectorSheet, 2, inspectorRows.length + 1)

  // ============================================
  // SHEET 3: STRUCTURE INFORMATION
  // ============================================
  const structureSheet = workbook.addWorksheet('Structure Information')
  structureSheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  // Build full address string
  const fullAddress = [
    report.propertyAddress,
    report.propertyPostcode ? `, ${report.propertyPostcode}` : '',
    geographicIntelligence?.state ? `, ${geographicIntelligence.state}` : ''
  ].filter(Boolean).join('')

  const structureRows = [
    { field: 'Address', value: fullAddress || report.propertyAddress || 'N/A' },
    { field: 'Job No', value: report.jobNumber || 'N/A' },
    { field: 'Description', value: report.description || 'N/A' },
    { field: 'Building Type', value: report.structureType || 'N/A' },
    { field: '', value: '' },
    { field: 'BUILDER/DEVELOPER INFORMATION', value: '' },
    { field: 'Builder/Dev Company Name', value: report.builderDeveloperCompanyName || 'N/A' },
    { field: 'Builder/Dev Contact', value: report.builderDeveloperContact || 'N/A' },
    { field: 'Builder/Dev Address', value: report.builderDeveloperAddress || 'N/A' },
    { field: 'Builder/Dev Phone', value: report.builderDeveloperPhone || 'N/A' },
    { field: '', value: '' },
    { field: 'OWNER/MANAGEMENT INFORMATION', value: '' },
    { field: 'Owner/Mgmt Contact', value: report.ownerManagementContactName || 'N/A' },
    { field: 'Owner/Mgmt Phone', value: report.ownerManagementPhone || 'N/A' },
    { field: 'Owner/Mgmt Email', value: report.ownerManagementEmail || 'N/A' },
    { field: '', value: '' },
    { field: 'PREVIOUS MAINTENANCE AND REPAIR WORK', value: '' },
    { field: 'Date of Last Inspection', value: formatDateOnly(report.lastInspectionDate) },
    { field: 'Building Changed Since Last Inspection', value: report.buildingChangedSinceLastInspection || 'N/A' },
    { field: 'Structure Changes Since Last Inspection', value: report.structureChangesSinceLastInspection || 'N/A' },
    { field: 'Previous Leakage', value: report.previousLeakage || 'N/A' },
    { field: 'Emergency Repair Performed', value: report.emergencyRepairPerformed || 'N/A' }
  ]

  structureSheet.addRows(structureRows)
  formatHeaderRow(structureSheet, 1)
  applyAlternatingRows(structureSheet, 2, structureRows.length + 1)

  // ============================================
  // SHEET 4: CLIENT & CONTACT INFORMATION
  // ============================================
  const contactSheet = workbook.addWorksheet('Contact Information')
  contactSheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const contactRows = [
    { field: 'Client Name', value: report.clientName || 'N/A' },
    { field: 'Client Contact Details', value: report.clientContactDetails || 'N/A' },
    { field: 'Client ID', value: report.clientId || 'N/A' },
    { field: 'Insurer Name', value: report.insurerName || 'N/A' },
    { field: 'Claim Reference Number', value: report.claimReferenceNumber || 'N/A' },
    { field: '', value: '' },
    { field: 'BUILDER/DEVELOPER INFORMATION', value: '' },
    { field: 'Company Name', value: report.builderDeveloperCompanyName || 'N/A' },
    { field: 'Contact', value: report.builderDeveloperContact || 'N/A' },
    { field: 'Address', value: report.builderDeveloperAddress || 'N/A' },
    { field: 'Phone', value: report.builderDeveloperPhone || 'N/A' },
    { field: '', value: '' },
    { field: 'OWNER/MANAGEMENT INFORMATION', value: '' },
    { field: 'Contact Name', value: report.ownerManagementContactName || 'N/A' },
    { field: 'Phone', value: report.ownerManagementPhone || 'N/A' },
    { field: 'Email', value: report.ownerManagementEmail || 'N/A' }
  ]

  if (report.client) {
    contactRows.push(
      { field: '', value: '' },
      { field: 'CLIENT DATABASE RECORD', value: '' },
      { field: 'Client Email', value: report.client.email || 'N/A' },
      { field: 'Client Phone', value: report.client.phone || 'N/A' },
      { field: 'Client Address', value: report.client.address || 'N/A' },
      { field: 'Client Company', value: report.client.company || 'N/A' },
      { field: 'Contact Person', value: report.client.contactPerson || 'N/A' },
      { field: 'Client Status', value: report.client.status || 'N/A' }
    )
  }

  contactSheet.addRows(contactRows)
  formatHeaderRow(contactSheet, 1)
  applyAlternatingRows(contactSheet, 2, contactRows.length + 1)

  // ============================================
  // SHEET 5: PROPERTY INFORMATION
  // ============================================
  const propertySheet = workbook.addWorksheet('Property Information')
  propertySheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const propertyRows = [
    { field: 'Property Address', value: report.propertyAddress || 'N/A' },
    { field: 'Property Postcode', value: report.propertyPostcode || 'N/A' },
    { field: 'Property ID', value: report.propertyId || 'N/A' },
    { field: 'Building Age (Year Built)', value: report.buildingAge?.toString() || 'N/A' },
    { field: 'Structure Type', value: report.structureType || 'N/A' },
    { field: 'Access Notes', value: report.accessNotes || 'N/A' },
    { field: '', value: '' },
    { field: 'MAINTENANCE & REPAIR HISTORY', value: '' },
    { field: 'Last Inspection Date', value: formatDateOnly(report.lastInspectionDate) },
    { field: 'Building Changed Since Last Inspection', value: report.buildingChangedSinceLastInspection || 'N/A' },
    { field: 'Structure Changes Since Last Inspection', value: report.structureChangesSinceLastInspection || 'N/A' },
    { field: 'Previous Leakage', value: report.previousLeakage || 'N/A' },
    { field: 'Emergency Repair Performed', value: report.emergencyRepairPerformed || 'N/A' }
  ]

  propertySheet.addRows(propertyRows)
  formatHeaderRow(propertySheet, 1)
  applyAlternatingRows(propertySheet, 2, propertyRows.length + 1)

  // ============================================
  // SHEET 6: PROPERTY & INCIDENT INFORMATION
  // ============================================
  const incidentSheet = workbook.addWorksheet('Property & Incident Info')
  incidentSheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const incidentRows = [
    { field: 'PROPERTY INFORMATION', value: '' },
    { field: 'Property ID', value: report.propertyId || 'N/A' },
    { field: 'Job Number', value: report.jobNumber || 'N/A' },
    { field: 'Building Age', value: report.buildingAge?.toString() || 'N/A' },
    { field: 'Structure Type', value: report.structureType || 'N/A' },
    { field: 'Access Notes', value: report.accessNotes || 'N/A' },
    { field: '', value: '' },
    { field: 'INCIDENT DETAILS', value: '' },
    { field: 'Date of Loss', value: formatDateOnly(report.incidentDate) },
    { field: 'Technician Attendance', value: formatDateOnly(report.technicianAttendanceDate) },
    { field: 'Technician', value: report.technicianName || 'N/A' },
    { field: 'Claim Reference', value: report.claimReferenceNumber || 'N/A' },
    { field: 'Insurer', value: report.insurerName || 'N/A' },
    { field: 'Water Class', value: report.waterClass || 'N/A' },
    { field: '', value: '' },
    { field: 'PROJECT TIMELINE', value: '' },
    { field: 'Phase 1 Start Date (Make-safe)', value: formatDateOnly(report.phase1StartDate) },
    { field: 'Phase 1 End Date (Make-safe)', value: formatDateOnly(report.phase1EndDate) },
    { field: 'Phase 2 Start Date (Remediation/Drying)', value: formatDateOnly(report.phase2StartDate) },
    { field: 'Phase 2 End Date (Remediation/Drying)', value: formatDateOnly(report.phase2EndDate) },
    { field: 'Phase 3 Start Date (Verification/Handover)', value: formatDateOnly(report.phase3StartDate) },
    { field: 'Phase 3 End Date (Verification/Handover)', value: formatDateOnly(report.phase3EndDate) }
  ]

  incidentSheet.addRows(incidentRows)
  formatHeaderRow(incidentSheet, 1)
  applyAlternatingRows(incidentSheet, 2, incidentRows.length + 1)

  // ============================================
  // SHEET 7: ENVIRONMENTAL CONDITIONS & CLASSIFICATION
  // ============================================
  const envSheet = workbook.addWorksheet('Environmental & Classification')
  envSheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const envRows = [
    { field: 'ENVIRONMENTAL DATA', value: '' },
    { field: 'Temperature (°C)', value: structuredData?.environmental?.ambientTemperature?.toString() || 
                                     psychrometricAssessment?.temperature?.toString() || 
                                     psychrometricReadings?.[0]?.temperature?.toString() || 'N/A' },
    { field: 'Humidity (%)', value: structuredData?.environmental?.humidityLevel?.toString() || 
                                   psychrometricAssessment?.humidity?.toString() || 
                                   psychrometricReadings?.[0]?.humidity?.toString() || 'N/A' },
    { field: 'Dew Point (°C)', value: structuredData?.environmental?.dewPoint?.toString() || 
                                     psychrometricReadings?.[0]?.dewPoint?.toString() || 'N/A' },
    { field: '', value: '' },
    { field: 'PSYCHROMETRIC ASSESSMENT', value: '' },
    { field: 'Drying Index', value: structuredData?.psychrometric?.dryingIndex?.toString() || 
                                psychrometricAssessment?.dryingIndex?.toString() || 'N/A' },
    { field: 'Drying Status', value: structuredData?.psychrometric?.dryingStatus || 
                                  psychrometricAssessment?.dryingStatus || 'N/A' },
    { field: 'Recommendation', value: structuredData?.psychrometric?.recommendation || 
                                    psychrometricAssessment?.recommendation || 'N/A' },
    { field: '', value: '' },
    { field: 'IICRC CLASSIFICATION', value: '' },
    { field: 'Water Category', value: report.waterCategory || 'N/A' },
    { field: 'Water Class', value: report.waterClass || 'N/A' },
    { field: 'Source of Water', value: report.sourceOfWater || 'N/A' },
    { field: 'Affected Area (sqm)', value: report.affectedArea?.toString() || 'N/A' },
    { field: '', value: '' },
    { field: 'HAZARDS ASSESSMENT', value: '' },
    { field: 'Methamphetamine Screen', value: report.methamphetamineScreen || 'N/A' },
    { field: 'Tests Performed', value: report.methamphetamineTestCount?.toString() || 'N/A' },
    { field: 'Biological Mould Detected', value: report.biologicalMouldDetected ? 'Yes' : 'No' },
    { field: 'Biological Mould Category', value: report.biologicalMouldCategory || 'N/A' },
    { field: 'Safety Hazards', value: report.safetyHazards || 'N/A' },
    { field: 'Electrical Hazards', value: report.electricalHazards || 'N/A' },
    { field: 'Microbial Growth', value: report.microbialGrowth || 'N/A' }
  ]

  envSheet.addRows(envRows)
  formatHeaderRow(envSheet, 1)
  applyAlternatingRows(envSheet, 2, envRows.length + 1)

  // ============================================
  // SHEET 8: DAMAGE ASSESSMENT
  // ============================================
  const damageSheet = workbook.addWorksheet('Damage Assessment')
  damageSheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const damageRows = [
    { field: 'Structural Damage', value: report.structuralDamage || 'N/A' },
    { field: 'Contents Damage', value: report.contentsDamage || 'N/A' },
    { field: 'HVAC Affected', value: report.hvacAffected ? 'Yes' : 'No' },
    { field: 'Electrical Hazards', value: report.electricalHazards || 'N/A' },
    { field: 'Microbial Growth', value: report.microbialGrowth || 'N/A' }
  ]

  damageSheet.addRows(damageRows)
  formatHeaderRow(damageSheet, 1)
  applyAlternatingRows(damageSheet, 2, damageRows.length + 1)

  // ============================================
  // SHEET 9: DRYING PLAN & EQUIPMENT
  // ============================================
  const dryingSheet = workbook.addWorksheet('Drying Plan & Equipment')
  dryingSheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const dryingRows = [
    { field: 'Target Humidity (%)', value: report.targetHumidity?.toString() || 'N/A' },
    { field: 'Target Temperature (°C)', value: report.targetTemperature?.toString() || 'N/A' },
    { field: 'Estimated Drying Time (hours)', value: report.estimatedDryingTime?.toString() || 'N/A' },
    { field: 'Estimated Drying Duration (days)', value: report.estimatedDryingDuration?.toString() || 'N/A' },
    { field: 'Dehumidification Capacity', value: report.dehumidificationCapacity?.toString() || 'N/A' },
    { field: 'Airmovers Count', value: report.airmoversCount?.toString() || 'N/A' },
    { field: 'Equipment Placement', value: report.equipmentPlacement || 'N/A' },
    { field: 'Equipment Used', value: report.equipmentUsed || 'N/A' },
    { field: 'Drying Plan', value: report.dryingPlan || 'N/A' }
  ]

  dryingSheet.addRows(dryingRows)
  formatHeaderRow(dryingSheet, 1)
  applyAlternatingRows(dryingSheet, 2, dryingRows.length + 1)

  // ============================================
  // SHEET 10: AFFECTED AREAS
  // ============================================
  if (structuredData?.affectedAreas && Array.isArray(structuredData.affectedAreas) && structuredData.affectedAreas.length > 0) {
    const affectedAreasSheet = workbook.addWorksheet('Affected Areas')
    affectedAreasSheet.columns = [
      { header: 'Area Name', key: 'name', width: 25 },
      { header: 'Dimensions', key: 'dimensions', width: 30 },
      { header: 'Wet Percentage', key: 'wetPercentage', width: 20 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Materials', key: 'materials', width: 40 }
    ]

    structuredData.affectedAreas.forEach((area: any) => {
      const dimensions = area.dimensions || 
                        (area.length && area.width && area.height ? `${area.length}m × ${area.width}m × ${area.height}m` : 'N/A')
      const wetPercent = area.wetPercentage || area.wetPercent || 'N/A'
      
      affectedAreasSheet.addRow({
        name: area.name || 'N/A',
        dimensions: dimensions,
        wetPercentage: typeof wetPercent === 'number' ? `${wetPercent}%` : wetPercent,
        description: area.description || 'N/A',
        materials: Array.isArray(area.materials) ? area.materials.join(', ') : 'N/A'
      })

      // Add moisture readings for this area if available
      if (area.moistureReadings && Array.isArray(area.moistureReadings) && area.moistureReadings.length > 0) {
        area.moistureReadings.forEach((reading: any) => {
          affectedAreasSheet.addRow({
            name: `  └─ ${reading.location || 'Reading'}`,
            dimensions: `${reading.value || ''} ${reading.unit || '%'}`,
            wetPercentage: '',
            description: '',
            materials: ''
          })
        })
      }
    })

    formatHeaderRow(affectedAreasSheet, 1)
    applyAlternatingRows(affectedAreasSheet, 2, structuredData.affectedAreas.length + 10)
  }

  // ============================================
  // SHEET 11: DETAILED MOISTURE READINGS
  // ============================================
  if (moistureReadings || structuredData?.moistureReadings) {
    const moistureSheet = workbook.addWorksheet('Detailed Moisture Readings')
    moistureSheet.columns = [
      { header: 'Location', key: 'location', width: 35 },
      { header: 'Surface Type', key: 'surfaceType', width: 25 },
      { header: 'Moisture Level', key: 'moistureLevel', width: 20 },
      { header: 'Depth', key: 'depth', width: 15 },
      { header: 'Unit', key: 'unit', width: 10 }
    ]

    const readings = Array.isArray(moistureReadings) ? moistureReadings : 
                     (Array.isArray(structuredData?.moistureReadings) ? structuredData.moistureReadings : [])

    if (readings.length > 0) {
      readings.forEach((reading: any) => {
        moistureSheet.addRow({
          location: reading.location || 'N/A',
          surfaceType: reading.surfaceType || 'N/A',
          moistureLevel: reading.moistureLevel || reading.value || 'N/A',
          depth: reading.depth || 'N/A',
          unit: reading.unit || '%'
        })
      })

      formatHeaderRow(moistureSheet, 1)
      applyAlternatingRows(moistureSheet, 2, readings.length + 1)
    }
  }

  // ============================================
  // SHEET 12: EQUIPMENT DEPLOYMENT
  // ============================================
  if (equipmentSelection && Array.isArray(equipmentSelection) && equipmentSelection.length > 0) {
    const equipmentDeploySheet = workbook.addWorksheet('Equipment Deployment')
    equipmentDeploySheet.columns = [
      { header: 'Equipment', key: 'name', width: 30 },
      { header: 'Quantity', key: 'quantity', width: 15 },
      { header: 'Daily Rate', key: 'dailyRate', width: 20 },
      { header: 'Duration (days)', key: 'duration', width: 20 },
      { header: 'Total Cost', key: 'totalCost', width: 20 }
    ]

    let totalEquipmentCost = 0
    equipmentSelection.forEach((item: any) => {
      const cost = item.totalCost || (item.dailyRate && item.quantity && item.duration ? 
        item.dailyRate * item.quantity * item.duration : 0)
      totalEquipmentCost += typeof cost === 'number' ? cost : 0

      equipmentDeploySheet.addRow({
        name: item.name || item.equipmentName || 'N/A',
        quantity: item.quantity || 0,
        dailyRate: item.dailyRate ? `$${Number(item.dailyRate).toFixed(2)}` : '$0.00',
        duration: item.duration || item.estimatedDuration || 0,
        totalCost: cost ? `$${Number(cost).toFixed(2)}` : '$0.00'
      })
    })

    // Add total row
    equipmentDeploySheet.addRow({
      name: 'Total Equipment Cost:',
      quantity: '',
      dailyRate: '',
      duration: '',
      totalCost: `$${totalEquipmentCost.toFixed(2)}`
    })

    const totalRow = equipmentDeploySheet.getRow(equipmentDeploySheet.rowCount)
    totalRow.font = { bold: true }
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

    formatHeaderRow(equipmentDeploySheet, 1)
    applyAlternatingRows(equipmentDeploySheet, 2, equipmentSelection.length + 1)
  }

  // ============================================
  // SHEET 13: COMPLIANCE & STANDARDS
  // ============================================
  if (structuredData?.compliance || geographicIntelligence) {
    const complianceSheet = workbook.addWorksheet('Compliance & Standards')
    complianceSheet.columns = [
      { header: 'Standard/Authority', key: 'standard', width: 50 },
      { header: 'Details', key: 'details', width: 50 }
    ]

    const complianceRows: Array<{ standard: string; details: string }> = []

    if (structuredData?.compliance) {
      if (structuredData.compliance.standards && Array.isArray(structuredData.compliance.standards)) {
        structuredData.compliance.standards.forEach((std: string) => {
          complianceRows.push({ standard: std, details: 'Applicable' })
        })
      }

      if (structuredData.compliance.state) {
        complianceRows.push({ standard: 'State', details: structuredData.compliance.state })
      }
      if (structuredData.compliance.buildingAuthority) {
        complianceRows.push({ standard: 'Building Authority', details: structuredData.compliance.buildingAuthority })
      }
      if (structuredData.compliance.workSafetyAuthority) {
        complianceRows.push({ standard: 'Work Safety Authority', details: structuredData.compliance.workSafetyAuthority })
      }
      if (structuredData.compliance.epaAuthority) {
        complianceRows.push({ standard: 'EPA Authority', details: structuredData.compliance.epaAuthority })
      }
    }

    if (geographicIntelligence) {
      if (geographicIntelligence.state) {
        complianceRows.push({ standard: 'State', details: geographicIntelligence.state })
      }
      if (geographicIntelligence.buildingAuthority) {
        complianceRows.push({ standard: 'Building Authority', details: geographicIntelligence.buildingAuthority })
      }
      if (geographicIntelligence.workSafetyAuthority) {
        complianceRows.push({ standard: 'Work Safety Authority', details: geographicIntelligence.workSafetyAuthority })
      }
      if (geographicIntelligence.epaAuthority) {
        complianceRows.push({ standard: 'EPA Authority', details: geographicIntelligence.epaAuthority })
      }
    }

    if (complianceRows.length > 0) {
      complianceSheet.addRows(complianceRows)
      formatHeaderRow(complianceSheet, 1)
      applyAlternatingRows(complianceSheet, 2, complianceRows.length + 1)
    }
  }

  // ============================================
  // SHEET 14: TECHNICIAN FIELD NOTES
  // ============================================
  if (report.technicianFieldReport) {
    const notesSheet = workbook.addWorksheet('Technician Field Notes')
    notesSheet.columns = [
      { header: 'Field Notes', key: 'notes', width: 100 }
    ]

    // Split by lines and add each as a row
    const lines = report.technicianFieldReport.split('\n')
    lines.forEach((line: string) => {
      notesSheet.addRow({ notes: line })
    })

    formatHeaderRow(notesSheet, 1)
    applyAlternatingRows(notesSheet, 2, lines.length + 1)
  }

  // ============================================
  // SHEET 15: MONITORING DATA
  // ============================================
  if (psychrometricReadings || moistureReadings) {
    const monitoringSheet = workbook.addWorksheet('Monitoring Data')
    
    if (psychrometricReadings) {
      monitoringSheet.addRow(['PSYCHROMETRIC READINGS'])
      monitoringSheet.mergeCells(`A${monitoringSheet.rowCount}:B${monitoringSheet.rowCount}`)
      const psychRow = monitoringSheet.getRow(monitoringSheet.rowCount)
      psychRow.font = { bold: true, size: 12 }
      psychRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
      monitoringSheet.addRow([])

      if (Array.isArray(psychrometricReadings)) {
        monitoringSheet.addRow(['Date/Time', 'Temperature (°C)', 'Humidity (%)', 'Dew Point (°C)', 'Notes'])
        formatHeaderRow(monitoringSheet, monitoringSheet.rowCount)
        
        psychrometricReadings.forEach((reading: any) => {
          monitoringSheet.addRow([
            formatDate(reading.timestamp || reading.date),
            reading.temperature,
            reading.humidity,
            reading.dewPoint,
            reading.notes || ''
          ])
        })
      } else if (typeof psychrometricReadings === 'object') {
        Object.entries(psychrometricReadings).forEach(([key, value]) => {
          monitoringSheet.addRow([key, typeof value === 'object' ? JSON.stringify(value) : String(value)])
        })
      }
      
      monitoringSheet.addRow([])
      monitoringSheet.addRow([])
    }

    if (moistureReadings) {
      monitoringSheet.addRow(['MOISTURE READINGS'])
      monitoringSheet.mergeCells(`A${monitoringSheet.rowCount}:E${monitoringSheet.rowCount}`)
      const moistRow = monitoringSheet.getRow(monitoringSheet.rowCount)
      moistRow.font = { bold: true, size: 12 }
      moistRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
      monitoringSheet.addRow([])

      if (Array.isArray(moistureReadings)) {
        monitoringSheet.addRow(['Location', 'Surface Type', 'Moisture Level', 'Depth', 'Unit', 'Notes'])
        formatHeaderRow(monitoringSheet, monitoringSheet.rowCount)
        
        moistureReadings.forEach((reading: any) => {
          monitoringSheet.addRow([
            reading.location || '',
            reading.surfaceType || '',
            reading.moistureLevel || reading.value || '',
            reading.depth || '',
            reading.unit || '',
            reading.notes || ''
          ])
        })
      } else if (typeof moistureReadings === 'object') {
        Object.entries(moistureReadings).forEach(([key, value]) => {
          monitoringSheet.addRow([key, typeof value === 'object' ? JSON.stringify(value) : String(value)])
        })
      }
    }
  }

  // ============================================
  // SHEET 9: PSYCHROMETRIC ASSESSMENT
  // ============================================
  if (psychrometricAssessment) {
    const psychSheet = workbook.addWorksheet('Psychrometric Assessment')
    psychSheet.columns = [
      { header: 'Field', key: 'field', width: 40 },
      { header: 'Value', key: 'value', width: 60 }
    ]

    const psychRows: Array<{ field: string; value: string }> = []
    
    if (typeof psychrometricAssessment === 'object') {
      Object.entries(psychrometricAssessment).forEach(([key, value]) => {
        psychRows.push({
          field: formatKey(key),
          value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
        })
      })
    }

    if (psychRows.length > 0) {
      psychSheet.addRows(psychRows)
      formatHeaderRow(psychSheet, 1)
      applyAlternatingRows(psychSheet, 2, psychRows.length + 1)
    }
  }

  // ============================================
  // SHEET 10: SCOPE AREAS
  // ============================================
  if (scopeAreas && Array.isArray(scopeAreas) && scopeAreas.length > 0) {
    const scopeAreasSheet = workbook.addWorksheet('Scope Areas')
    scopeAreasSheet.columns = [
      { header: 'Area Name', key: 'name', width: 30 },
      { header: 'Dimensions', key: 'dimensions', width: 25 },
      { header: 'Volume (m³)', key: 'volume', width: 15 },
      { header: 'Wet Percentage (%)', key: 'wetPercentage', width: 20 },
      { header: 'Description', key: 'description', width: 50 }
    ]

    scopeAreas.forEach((area: any) => {
      scopeAreasSheet.addRow({
        name: area.name || area.areaName || 'N/A',
        dimensions: area.dimensions || area.lengthWidthHeight || 'N/A',
        volume: area.volume || 'N/A',
        wetPercentage: area.wetPercentage || area.wetPercent || 'N/A',
        description: area.description || 'N/A'
      })
    })

    formatHeaderRow(scopeAreasSheet, 1)
    applyAlternatingRows(scopeAreasSheet, 2, scopeAreas.length + 1)
  }

  // ============================================
  // SHEET 11: EQUIPMENT SELECTION
  // ============================================
  if (equipmentSelection) {
    const equipmentSheet = workbook.addWorksheet('Equipment Selection')
    
    if (Array.isArray(equipmentSelection)) {
      equipmentSheet.columns = [
        { header: 'Equipment Name', key: 'name', width: 30 },
        { header: 'Type', key: 'type', width: 25 },
        { header: 'Quantity', key: 'quantity', width: 15 },
        { header: 'Daily Rate', key: 'dailyRate', width: 20 },
        { header: 'Duration (days)', key: 'duration', width: 20 },
        { header: 'Total Cost', key: 'totalCost', width: 20 },
        { header: 'Specifications', key: 'specifications', width: 40 }
      ]

      equipmentSelection.forEach((item: any) => {
        equipmentSheet.addRow({
          name: item.name || item.equipmentName || 'N/A',
          type: item.type || item.equipmentType || 'N/A',
          quantity: item.quantity || 0,
          dailyRate: item.dailyRate ? `$${Number(item.dailyRate).toFixed(2)}` : '$0.00',
          duration: item.duration || item.estimatedDuration || 0,
          totalCost: item.totalCost ? `$${Number(item.totalCost).toFixed(2)}` : '$0.00',
          specifications: typeof item.specifications === 'object' ? JSON.stringify(item.specifications) : (item.specifications || 'N/A')
        })
      })

      formatHeaderRow(equipmentSheet, 1)
      applyAlternatingRows(equipmentSheet, 2, equipmentSelection.length + 1)
    } else if (typeof equipmentSelection === 'object') {
      equipmentSheet.columns = [
        { header: 'Field', key: 'field', width: 40 },
        { header: 'Value', key: 'value', width: 60 }
      ]

      const equipRows: Array<{ field: string; value: string }> = []
      Object.entries(equipmentSelection).forEach(([key, value]) => {
        equipRows.push({
          field: formatKey(key),
          value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
        })
      })

      equipmentSheet.addRows(equipRows)
      formatHeaderRow(equipmentSheet, 1)
      applyAlternatingRows(equipmentSheet, 2, equipRows.length + 1)
    }
  }

  // ============================================
  // SHEET 12: STRUCTURED REPORT DATA
  // ============================================
  if (structuredData && structuredData.type === 'restoration_inspection_report') {
    const reportSheet = workbook.addWorksheet('Structured Report Data')
    reportSheet.columns = [
      { header: 'Section', key: 'section', width: 35 },
      { header: 'Details', key: 'details', width: 65 }
    ]

    const reportRows: Array<{ section: string; details: string }> = []

    // Add all structured data sections
    Object.entries(structuredData).forEach(([key, value]) => {
      if (key === 'type' || key === 'version' || key === 'generatedAt') {
        reportRows.push({ section: key.toUpperCase(), details: String(value) })
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        reportRows.push({ section: '', details: '' })
        reportRows.push({ section: formatKey(key).toUpperCase(), details: '' })
        Object.entries(value).forEach(([subKey, subValue]) => {
          reportRows.push({
            section: `  ${formatKey(subKey)}`,
            details: typeof subValue === 'object' ? JSON.stringify(subValue, null, 2) : String(subValue || 'N/A')
          })
        })
      } else if (Array.isArray(value) && value.length > 0) {
        reportRows.push({ section: '', details: '' })
        reportRows.push({ section: formatKey(key).toUpperCase(), details: `${value.length} items` })
        value.slice(0, 10).forEach((item: any, idx: number) => {
          reportRows.push({
            section: `  Item ${idx + 1}`,
            details: typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item)
          })
        })
        if (value.length > 10) {
          reportRows.push({ section: '', details: `... and ${value.length - 10} more items` })
        }
      }
    })

    if (reportRows.length > 0) {
      reportSheet.addRows(reportRows)
      formatHeaderRow(reportSheet, 1)
      applyAlternatingRows(reportSheet, 2, reportRows.length + 1)
    }
  }

  // ============================================
  // SHEET 13: TIER RESPONSES
  // ============================================
  if (tier1Responses || tier2Responses || tier3Responses) {
    const tierSheet = workbook.addWorksheet('Tier Responses')
    tierSheet.columns = [
      { header: 'Tier', key: 'tier', width: 15 },
      { header: 'Question/Field', key: 'question', width: 50 },
      { header: 'Response/Value', key: 'response', width: 60 }
    ]

    const tierRows: Array<{ tier: string; question: string; response: string }> = []

    if (tier1Responses) {
      if (Array.isArray(tier1Responses)) {
        tier1Responses.forEach((item: any, idx: number) => {
          tierRows.push({
            tier: 'Tier 1',
            question: item.question || item.field || `Item ${idx + 1}`,
            response: typeof item.response === 'object' ? JSON.stringify(item.response) : String(item.response || item.value || 'N/A')
          })
        })
      } else if (typeof tier1Responses === 'object') {
        Object.entries(tier1Responses).forEach(([key, value]) => {
          tierRows.push({
            tier: 'Tier 1',
            question: formatKey(key),
            response: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
          })
        })
      }
    }

    if (tier2Responses) {
      if (Array.isArray(tier2Responses)) {
        tier2Responses.forEach((item: any, idx: number) => {
          tierRows.push({
            tier: 'Tier 2',
            question: item.question || item.field || `Item ${idx + 1}`,
            response: typeof item.response === 'object' ? JSON.stringify(item.response) : String(item.response || item.value || 'N/A')
          })
        })
      } else if (typeof tier2Responses === 'object') {
        Object.entries(tier2Responses).forEach(([key, value]) => {
          tierRows.push({
            tier: 'Tier 2',
            question: formatKey(key),
            response: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
          })
        })
      }
    }

    if (tier3Responses) {
      if (Array.isArray(tier3Responses)) {
        tier3Responses.forEach((item: any, idx: number) => {
          tierRows.push({
            tier: 'Tier 3',
            question: item.question || item.field || `Item ${idx + 1}`,
            response: typeof item.response === 'object' ? JSON.stringify(item.response) : String(item.response || item.value || 'N/A')
          })
        })
      } else if (typeof tier3Responses === 'object') {
        Object.entries(tier3Responses).forEach(([key, value]) => {
          tierRows.push({
            tier: 'Tier 3',
            question: formatKey(key),
            response: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
          })
        })
      }
    }

    if (tierRows.length > 0) {
      tierSheet.addRows(tierRows)
      formatHeaderRow(tierSheet, 1)
      applyAlternatingRows(tierSheet, 2, tierRows.length + 1)
    }
  }

  // ============================================
  // SHEET 14: TECHNICIAN REPORT ANALYSIS
  // ============================================
  if (technicianAnalysis || report.technicianFieldReport) {
    const techSheet = workbook.addWorksheet('Technician Analysis')
    techSheet.columns = [
      { header: 'Field', key: 'field', width: 40 },
      { header: 'Value', key: 'value', width: 60 }
    ]

    const techRows: Array<{ field: string; value: string }> = []

    if (report.technicianFieldReport) {
      techRows.push({ field: 'Technician Field Report (Raw Text)', value: report.technicianFieldReport })
    }

    if (technicianAnalysis) {
      if (typeof technicianAnalysis === 'object') {
        Object.entries(technicianAnalysis).forEach(([key, value]) => {
          techRows.push({
            field: formatKey(key),
            value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
          })
        })
      } else {
        techRows.push({ field: 'Analysis Data', value: String(technicianAnalysis) })
      }
    }

    if (techRows.length > 0) {
      techSheet.addRows(techRows)
      formatHeaderRow(techSheet, 1)
      applyAlternatingRows(techSheet, 2, techRows.length + 1)
    }
  }

  // ============================================
  // SHEET 15: SCOPE OF WORKS
  // ============================================
  if (scopeData || report.scopeOfWorksDocument) {
    const scopeSheet = workbook.addWorksheet('Scope of Works')
    scopeSheet.columns = [
      { header: 'Field', key: 'field', width: 40 },
      { header: 'Value', key: 'value', width: 60 }
    ]

    const scopeRows: Array<{ field: string; value: string }> = []

    if (report.scopeOfWorksDocument) {
      scopeRows.push({ field: 'Scope of Works Document', value: report.scopeOfWorksDocument.substring(0, 10000) }) // Limit length
    }

    if (scopeData) {
      if (typeof scopeData === 'object') {
        Object.entries(scopeData).forEach(([key, value]) => {
          scopeRows.push({
            field: formatKey(key),
            value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
          })
        })
      } else {
        scopeRows.push({ field: 'Scope Data', value: String(scopeData) })
      }
    }

    if (scopeRows.length > 0) {
      scopeSheet.addRows(scopeRows)
      formatHeaderRow(scopeSheet, 1)
      applyAlternatingRows(scopeSheet, 2, scopeRows.length + 1)
    }
  }

  // ============================================
  // SHEET 16: COST ESTIMATION
  // ============================================
  if (costData || report.costEstimationDocument) {
    const costSheet = workbook.addWorksheet('Cost Estimation')
    costSheet.columns = [
      { header: 'Field', key: 'field', width: 40 },
      { header: 'Value', key: 'value', width: 60 }
    ]

    const costRows: Array<{ field: string; value: string }> = []

    if (report.costEstimationDocument) {
      costRows.push({ field: 'Cost Estimation Document', value: report.costEstimationDocument.substring(0, 10000) }) // Limit length
    }

    if (costData) {
      if (typeof costData === 'object') {
        Object.entries(costData).forEach(([key, value]) => {
          costRows.push({
            field: formatKey(key),
            value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
          })
        })
      } else {
        costRows.push({ field: 'Cost Data', value: String(costData) })
      }
    }

    if (costRows.length > 0) {
      costSheet.addRows(costRows)
      formatHeaderRow(costSheet, 1)
      applyAlternatingRows(costSheet, 2, costRows.length + 1)
    }
  }

  // ============================================
  // SHEET 17: COMPLIANCE DOCUMENTATION
  // ============================================
  const complianceSheet = workbook.addWorksheet('Compliance Documentation')
  complianceSheet.columns = [
    { header: 'Field', key: 'field', width: 40 },
    { header: 'Value', key: 'value', width: 60 }
  ]

  const complianceRows = [
    { field: 'Safety Plan', value: report.safetyPlan || 'N/A' },
    { field: 'Containment Setup', value: report.containmentSetup || 'N/A' },
    { field: 'Decontamination Procedures', value: report.decontaminationProcedures || 'N/A' },
    { field: 'Post Remediation Verification', value: report.postRemediationVerification || 'N/A' },
    { field: 'Report Instructions', value: report.reportInstructions || 'N/A' }
  ]

  complianceSheet.addRows(complianceRows)
  formatHeaderRow(complianceSheet, 1)
  applyAlternatingRows(complianceSheet, 2, complianceRows.length + 1)

  // ============================================
  // SHEET 18: INSURANCE INFORMATION
  // ============================================
  const insuranceSheet = workbook.addWorksheet('Insurance Information')
  insuranceSheet.columns = [
    { header: 'Cover Type', key: 'type', width: 30 },
    { header: 'Details', key: 'details', width: 70 }
  ]

  const insuranceRows: Array<{ type: string; details: string }> = []

  if (propertyCover) {
    insuranceRows.push({
      type: 'Property Cover',
      details: typeof propertyCover === 'object' ? JSON.stringify(propertyCover, null, 2) : String(propertyCover)
    })
  }

  if (contentsCover) {
    insuranceRows.push({
      type: 'Contents Cover',
      details: typeof contentsCover === 'object' ? JSON.stringify(contentsCover, null, 2) : String(contentsCover)
    })
  }

  if (liabilityCover) {
    insuranceRows.push({
      type: 'Liability Cover',
      details: typeof liabilityCover === 'object' ? JSON.stringify(liabilityCover, null, 2) : String(liabilityCover)
    })
  }

  if (businessInterruption) {
    insuranceRows.push({
      type: 'Business Interruption',
      details: typeof businessInterruption === 'object' ? JSON.stringify(businessInterruption, null, 2) : String(businessInterruption)
    })
  }

  if (additionalCover) {
    insuranceRows.push({
      type: 'Additional Cover',
      details: typeof additionalCover === 'object' ? JSON.stringify(additionalCover, null, 2) : String(additionalCover)
    })
  }

  if (insuranceRows.length > 0) {
    insuranceSheet.addRows(insuranceRows)
    formatHeaderRow(insuranceSheet, 1)
    applyAlternatingRows(insuranceSheet, 2, insuranceRows.length + 1)
  }

  // ============================================
  // SHEET 19: GEOGRAPHIC INTELLIGENCE
  // ============================================
  if (geographicIntelligence) {
    const geoSheet = workbook.addWorksheet('Geographic Intelligence')
    geoSheet.columns = [
      { header: 'Field', key: 'field', width: 40 },
      { header: 'Value', key: 'value', width: 60 }
    ]

    const geoRows: Array<{ field: string; value: string }> = []

    if (typeof geographicIntelligence === 'object') {
      Object.entries(geographicIntelligence).forEach(([key, value]) => {
        geoRows.push({
          field: formatKey(key),
          value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
        })
      })
    } else {
      geoRows.push({ field: 'Geographic Data', value: String(geographicIntelligence) })
    }

    if (geoRows.length > 0) {
      geoSheet.addRows(geoRows)
      formatHeaderRow(geoSheet, 1)
      applyAlternatingRows(geoSheet, 2, geoRows.length + 1)
    }
  }

  // ============================================
  // SHEET 20: VALIDATION & QUALITY CONTROL
  // ============================================
  if (validationWarnings || validationErrors) {
    const validationSheet = workbook.addWorksheet('Validation & QC')
    validationSheet.columns = [
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Item', key: 'item', width: 50 },
      { header: 'Details', key: 'details', width: 60 }
    ]

    const validationRows: Array<{ type: string; item: string; details: string }> = []

    if (validationWarnings) {
      if (Array.isArray(validationWarnings)) {
        validationWarnings.forEach((warning: any) => {
          validationRows.push({
            type: 'Warning',
            item: warning.field || warning.item || 'N/A',
            details: typeof warning === 'object' ? JSON.stringify(warning) : String(warning)
          })
        })
      } else if (typeof validationWarnings === 'object') {
        Object.entries(validationWarnings).forEach(([key, value]) => {
          validationRows.push({
            type: 'Warning',
            item: formatKey(key),
            details: typeof value === 'object' ? JSON.stringify(value) : String(value)
          })
        })
      }
    }

    if (validationErrors) {
      if (Array.isArray(validationErrors)) {
        validationErrors.forEach((error: any) => {
          validationRows.push({
            type: 'Error',
            item: error.field || error.item || 'N/A',
            details: typeof error === 'object' ? JSON.stringify(error) : String(error)
          })
        })
      } else if (typeof validationErrors === 'object') {
        Object.entries(validationErrors).forEach(([key, value]) => {
          validationRows.push({
            type: 'Error',
            item: formatKey(key),
            details: typeof value === 'object' ? JSON.stringify(value) : String(value)
          })
        })
      }
    }

    if (validationRows.length > 0) {
      validationSheet.addRows(validationRows)
      formatHeaderRow(validationSheet, 1)
      applyAlternatingRows(validationSheet, 2, validationRows.length + 1)
    }
  }

  // ============================================
  // SHEET 21: VERSION HISTORY
  // ============================================
  if (versionHistory) {
    const versionSheet = workbook.addWorksheet('Version History')
    versionSheet.columns = [
      { header: 'Version', key: 'version', width: 15 },
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Changed By', key: 'changedBy', width: 30 },
      { header: 'Changes', key: 'changes', width: 60 }
    ]

    if (Array.isArray(versionHistory)) {
      versionHistory.forEach((version: any) => {
        versionSheet.addRow({
          version: version.version || version.number || 'N/A',
          date: formatDate(version.date || version.timestamp || version.createdAt),
          changedBy: version.changedBy || version.userId || 'N/A',
          changes: typeof version.changes === 'object' ? JSON.stringify(version.changes, null, 2) : String(version.changes || version.description || 'N/A')
        })
      })

      formatHeaderRow(versionSheet, 1)
      applyAlternatingRows(versionSheet, 2, versionHistory.length + 1)
    } else if (typeof versionHistory === 'object') {
      versionSheet.columns = [
        { header: 'Field', key: 'field', width: 40 },
        { header: 'Value', key: 'value', width: 60 }
      ]

      const versionRows: Array<{ field: string; value: string }> = []
      Object.entries(versionHistory).forEach(([key, value]) => {
        versionRows.push({
          field: formatKey(key),
          value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'N/A')
        })
      })

      versionSheet.addRows(versionRows)
      formatHeaderRow(versionSheet, 1)
      applyAlternatingRows(versionSheet, 2, versionRows.length + 1)
    }
  }

  // ============================================
  // SHEET 22: DETAILED REPORT (Text)
  // ============================================
  if (report.detailedReport && typeof report.detailedReport === 'string' && !structuredData) {
    const detailedSheet = workbook.addWorksheet('Detailed Report Text')
    detailedSheet.columns = [
      { header: 'Content', key: 'content', width: 100 }
    ]

    // Split by lines and add each as a row
    const lines = report.detailedReport.split('\n')
    lines.forEach((line: string) => {
      detailedSheet.addRow({ content: line })
    })

    formatHeaderRow(detailedSheet, 1)
    applyAlternatingRows(detailedSheet, 2, lines.length + 1)
  }

  return workbook
}

/**
 * Generate Excel workbook for bulk reports (used by bulk export)
 */
export async function generateExcelWorkbook(
  reports: any[],
  options: ExcelExportOptions = {}
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'RestoreAssist'
  workbook.created = new Date()
  workbook.modified = new Date()

  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary')
  summarySheet.columns = [
    { header: 'Report Number', key: 'reportNumber', width: 20 },
    { header: 'Client Name', key: 'clientName', width: 25 },
    { header: 'Property Address', key: 'propertyAddress', width: 40 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Hazard Type', key: 'hazardType', width: 20 },
    { header: 'Water Category', key: 'waterCategory', width: 15 },
    { header: 'Water Class', key: 'waterClass', width: 15 },
    { header: 'Total Cost', key: 'totalCost', width: 15 },
    { header: 'Affected Area', key: 'affectedArea', width: 20 },
    { header: 'Inspection Date', key: 'inspectionDate', width: 18 },
    { header: 'Created At', key: 'createdAt', width: 18 }
  ]

  reports.forEach(report => {
    summarySheet.addRow({
      reportNumber: report.reportNumber || 'N/A',
      clientName: report.clientName || 'N/A',
      propertyAddress: report.propertyAddress || 'N/A',
      status: report.status || 'N/A',
      hazardType: report.hazardType || 'N/A',
      waterCategory: report.waterCategory || 'N/A',
      waterClass: report.waterClass || 'N/A',
      totalCost: report.totalCost ? `$${Number(report.totalCost).toFixed(2)}` : 'N/A',
      affectedArea: report.affectedArea || 'N/A',
      inspectionDate: report.inspectionDate ? format(new Date(report.inspectionDate), 'dd/MM/yyyy') : 'N/A',
      createdAt: report.createdAt ? format(new Date(report.createdAt), 'dd/MM/yyyy') : 'N/A'
    })
  })

  formatHeaderRow(summarySheet, 1)
  applyAlternatingRows(summarySheet, 2, reports.length + 1)

  return workbook
}

/**
 * Save workbook as buffer
 */
export async function saveWorkbookAsBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/**
 * Format header row with professional styling
 */
function formatHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber)
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0066CC' } // Professional blue
  }
  row.alignment = { vertical: 'middle', horizontal: 'center' }
  row.height = 25
}

/**
 * Apply alternating row colors for better readability
 */
function applyAlternatingRows(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let i = startRow; i <= endRow; i++) {
    const row = sheet.getRow(i)
    if (i % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' } // Light gray
      }
    }
    row.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
  }
}

/**
 * Format key names for display
 */
function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}
