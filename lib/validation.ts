// Validation and error prevention utilities

export interface ValidationWarning {
  field: string
  message: string
  severity: 'warning' | 'error'
  canOverride: boolean
}

export interface ValidationResult {
  isValid: boolean
  warnings: ValidationWarning[]
  errors: ValidationWarning[]
  completenessScore: number
}

// Validate Stage 1: Initial Data Entry
export function validateInitialDataEntry(data: {
  clientName?: string
  propertyAddress?: string
  propertyPostcode?: string
  incidentDate?: string | Date
  technicianFieldReport?: string
}): ValidationResult {
  const warnings: ValidationWarning[] = []
  const errors: ValidationWarning[] = []
  let completenessScore = 0
  const totalFields = 5

  // Required field validation
  if (!data.clientName || !data.clientName.trim()) {
    errors.push({
      field: 'clientName',
      message: 'Client name is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    completenessScore++
  }

  if (!data.propertyAddress || !data.propertyAddress.trim()) {
    errors.push({
      field: 'propertyAddress',
      message: 'Property address is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    completenessScore++
  }

  if (!data.propertyPostcode || !data.propertyPostcode.trim()) {
    errors.push({
      field: 'propertyPostcode',
      message: 'Postcode is required for state detection and regulatory compliance',
      severity: 'error',
      canOverride: false
    })
  } else {
    // Validate Australian postcode format
    const postcodeNum = parseInt(data.propertyPostcode.replace(/\D/g, ''))
    if (isNaN(postcodeNum) || postcodeNum < 200 || postcodeNum > 9999) {
      warnings.push({
        field: 'propertyPostcode',
        message: 'Postcode format may be invalid. Please verify.',
        severity: 'warning',
        canOverride: true
      })
    }
    completenessScore++
  }

  if (!data.technicianFieldReport || !data.technicianFieldReport.trim()) {
    errors.push({
      field: 'technicianFieldReport',
      message: 'Technician field report is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    completenessScore++
  }

  // Date validation
  if (data.incidentDate) {
    const incidentDate = typeof data.incidentDate === 'string' 
      ? new Date(data.incidentDate) 
      : data.incidentDate
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    
    if (incidentDate > today) {
      errors.push({
        field: 'incidentDate',
        message: 'Incident date cannot be in the future',
        severity: 'error',
        canOverride: false
      })
    } else {
      completenessScore++
    }
  } else {
    warnings.push({
      field: 'incidentDate',
      message: 'Incident date is recommended for accurate reporting',
      severity: 'warning',
      canOverride: true
    })
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
    completenessScore: Math.round((completenessScore / totalFields) * 100)
  }
}

// Validate Tier 1 Responses
export function validateTier1Responses(responses: any): ValidationResult {
  const warnings: ValidationWarning[] = []
  const errors: ValidationWarning[] = []
  let answeredQuestions = 0
  const totalQuestions = 8

  // T1_Q1: Property Type
  if (!responses.T1_Q1_propertyType) {
    errors.push({
      field: 'T1_Q1_propertyType',
      message: 'Property type is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    answeredQuestions++
  }

  // T1_Q2: Construction Year
  if (!responses.T1_Q2_constructionYear) {
    errors.push({
      field: 'T1_Q2_constructionYear',
      message: 'Construction year is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    answeredQuestions++
  }

  // T1_Q3: Water Source
  if (!responses.T1_Q3_waterSource) {
    errors.push({
      field: 'T1_Q3_waterSource',
      message: 'Water source is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    answeredQuestions++
  }

  // T1_Q4: Occupancy Status
  if (!responses.T1_Q4_occupancyStatus) {
    errors.push({
      field: 'T1_Q4_occupancyStatus',
      message: 'Occupancy status is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    answeredQuestions++
  }

  // T1_Q5: Rooms Affected
  if (!responses.T1_Q5_roomsAffected || !responses.T1_Q5_roomsAffected.trim()) {
    errors.push({
      field: 'T1_Q5_roomsAffected',
      message: 'Rooms/areas affected description is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    answeredQuestions++
  }

  // T1_Q6: Materials Affected
  if (!responses.T1_Q6_materialsAffected || responses.T1_Q6_materialsAffected.length === 0) {
    errors.push({
      field: 'T1_Q6_materialsAffected',
      message: 'At least one affected material must be selected',
      severity: 'error',
      canOverride: false
    })
  } else {
    answeredQuestions++
  }

  // T1_Q7: Hazards
  if (!responses.T1_Q7_hazards || responses.T1_Q7_hazards.length === 0) {
    errors.push({
      field: 'T1_Q7_hazards',
      message: 'Hazard assessment is required (select "None identified" if no hazards)',
      severity: 'error',
      canOverride: false
    })
  } else {
    answeredQuestions++
  }

  // T1_Q8: Water Duration
  if (!responses.T1_Q8_waterDuration) {
    errors.push({
      field: 'T1_Q8_waterDuration',
      message: 'Water duration is required',
      severity: 'error',
      canOverride: false
    })
  } else {
    answeredQuestions++
  }

  // Logical conflict detection
  if (responses.T1_Q4_occupancyStatus?.includes('Vacant') && responses.T1_Q4_petsPresent) {
    warnings.push({
      field: 'T1_Q4',
      message: 'Property marked as vacant but pets indicated. Please clarify.',
      severity: 'warning',
      canOverride: true
    })
  }

  if (responses.T1_Q2_constructionYear?.includes('Pre-1970') && 
      responses.T1_Q7_hazards?.includes('None identified')) {
    warnings.push({
      field: 'T1_Q7',
      message: 'Pre-1970 construction typically has asbestos risk. Consider selecting "Suspected asbestos" or confirming "None identified".',
      severity: 'warning',
      canOverride: true
    })
  }

  const waterSource = responses.T1_Q3_waterSource || ''
  if ((waterSource.includes('Category 3') || waterSource.includes('Sewage') || waterSource.includes('biohazard')) &&
      responses.T3_Q3_chemicalTreatment && 
      !responses.T3_Q3_chemicalTreatment.includes('Biohazard')) {
    warnings.push({
      field: 'T3_Q3',
      message: 'Category 3 water typically requires biohazard treatment. Verify selection.',
      severity: 'warning',
      canOverride: true
    })
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
    completenessScore: Math.round((answeredQuestions / totalQuestions) * 100)
  }
}

// Validate Cost Estimation
export function validateCostEstimation(costData: any): ValidationResult {
  const warnings: ValidationWarning[] = []
  const errors: ValidationWarning[] = []

  if (!costData || !costData.totals) {
    errors.push({
      field: 'costEstimation',
      message: 'Cost estimation data is missing',
      severity: 'error',
      canOverride: false
    })
    return { isValid: false, warnings, errors, completenessScore: 0 }
  }

  const { subtotal } = costData.totals

  // Check for positive values
  if (subtotal <= 0) {
    errors.push({
      field: 'subtotal',
      message: 'Total cost must be greater than zero',
      severity: 'error',
      canOverride: false
    })
  }

  // Warning thresholds
  if (subtotal > 50000) {
    warnings.push({
      field: 'subtotal',
      message: 'This is a high-value claim ($' + subtotal.toLocaleString() + '). Verify all quantities and rates.',
      severity: 'warning',
      canOverride: true
    })
  }

  if (subtotal < 2000) {
    warnings.push({
      field: 'subtotal',
      message: 'This estimate seems low for the described damage. Verify scope is complete.',
      severity: 'warning',
      canOverride: true
    })
  }

  // Validate quantities and rates
  if (costData.categories) {
    Object.values(costData.categories).forEach((category: any) => {
      if (category.lineItems) {
        category.lineItems.forEach((item: any) => {
          if (item.hours && item.hours > 16) {
            warnings.push({
              field: item.description,
              message: `Hours (${item.hours}) exceed reasonable daily limit. Verify.`,
              severity: 'warning',
              canOverride: true
            })
          }
          if (item.days && item.days > 30) {
            warnings.push({
              field: item.description,
              message: `Days (${item.days}) exceed reasonable limit. Verify.`,
              severity: 'warning',
              canOverride: true
            })
          }
          if (item.rate && item.rate < 0) {
            errors.push({
              field: item.description,
              message: 'Rate cannot be negative',
              severity: 'error',
              canOverride: false
            })
          }
        })
      }
    })
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
    completenessScore: 100
  }
}

// Calculate overall completeness score
export function calculateCompletenessScore(report: any): number {
  let score = 0
  const maxScore = 100

  // Stage 1: Initial Data Entry (20 points)
  if (report.clientName) score += 4
  if (report.propertyAddress) score += 4
  if (report.propertyPostcode) score += 4
  if (report.technicianFieldReport) score += 4
  if (report.incidentDate) score += 4

  // Stage 2: Analysis (10 points)
  if (report.technicianReportAnalysis) score += 10

  // Stage 3: Tier 1 Questions (30 points) - Only for Enhanced/Optimised reports
  const reportDepthLevel = report.reportDepthLevel?.toLowerCase() || ''
  if ((reportDepthLevel === 'enhanced' || reportDepthLevel === 'optimised') && report.tier1Responses) {
    const tier1 = JSON.parse(report.tier1Responses)
    const tier1Fields = [
      'T1_Q1_propertyType',
      'T1_Q2_constructionYear',
      'T1_Q3_waterSource',
      'T1_Q4_occupancyStatus',
      'T1_Q5_roomsAffected',
      'T1_Q6_materialsAffected',
      'T1_Q7_hazards',
      'T1_Q8_waterDuration'
    ]
    const answered = tier1Fields.filter(field => tier1[field] && 
      (typeof tier1[field] !== 'object' || (Array.isArray(tier1[field]) && tier1[field].length > 0) || tier1[field].trim?.()))
    score += Math.round((answered.length / tier1Fields.length) * 30)
  } else if (reportDepthLevel === 'enhanced' || reportDepthLevel === 'optimised') {
    // For Enhanced/Optimised reports without tier1, don't add points but don't penalize either
    // The completeness check will handle validation
  }

  // Stage 4: Tier 2 Questions (20 points) - Only for Enhanced/Optimised reports
  if ((reportDepthLevel === 'enhanced' || reportDepthLevel === 'optimised') && report.tier2Responses) {
    const tier2 = JSON.parse(report.tier2Responses)
    const tier2Fields = [
      'T2_Q1_moistureReadings',
      'T2_Q2_waterMigrationPattern',
      'T2_Q3_equipmentDeployed',
      'T2_Q4_affectedContents',
      'T2_Q5_structuralConcerns',
      'T2_Q6_buildingServicesAffected',
      'T2_Q7_insuranceConsiderations'
    ]
    const answered = tier2Fields.filter(field => tier2[field] && 
      (typeof tier2[field] !== 'object' || (Array.isArray(tier2[field]) && tier2[field].length > 0) || tier2[field].trim?.()))
    score += Math.round((answered.length / tier2Fields.length) * 20)
  }

  // Stage 5: Tier 3 Questions (10 points - optional) - Only for Optimised reports
  if (reportDepthLevel === 'optimised' && report.tier3Responses) {
    const tier3 = JSON.parse(report.tier3Responses)
    const tier3Fields = [
      'T3_Q1_timelineRequirements',
      'T3_Q2_dryingPreferences',
      'T3_Q3_chemicalTreatment',
      'T3_Q4_totalAffectedArea',
      'T3_Q5_class4DryingAssessment'
    ]
    const answered = tier3Fields.filter(field => tier3[field] && tier3[field].trim?.())
    score += Math.round((answered.length / tier3Fields.length) * 10)
  }

  // Stage 6-7: Documents Generated (10 points)
  if (report.detailedReport) score += 3
  if (report.scopeOfWorksDocument) score += 3
  if (report.costEstimationDocument) score += 4

  return Math.min(score, maxScore)
}

// Check completeness before document generation
export function checkCompletenessBeforeGeneration(report: any): {
  canGenerate: boolean
  missingItems: string[]
  warnings: string[]
} {
  const missingItems: string[] = []
  const warnings: string[] = []

  // Required for basic report
  if (!report.clientName) missingItems.push('Client name')
  if (!report.propertyAddress) missingItems.push('Property address')
  if (!report.propertyPostcode) missingItems.push('Property postcode')
  if (!report.technicianFieldReport) missingItems.push('Technician field report')

  // Required for enhanced report - check case-insensitively
  const reportDepthLevel = (report.reportDepthLevel || '').toLowerCase()
  if (reportDepthLevel === 'enhanced' || reportDepthLevel === 'optimised') {
    if (!report.tier1Responses) {
      missingItems.push('Tier 1 questions (all 8 required)')
    } else {
      const tier1 = JSON.parse(report.tier1Responses)
      const requiredFields = [
        'T1_Q1_propertyType',
        'T1_Q2_constructionYear',
        'T1_Q3_waterSource',
        'T1_Q4_occupancyStatus',
        'T1_Q5_roomsAffected',
        'T1_Q6_materialsAffected',
        'T1_Q7_hazards',
        'T1_Q8_waterDuration'
      ]
      const missing = requiredFields.filter(field => !tier1[field] || 
        (typeof tier1[field] === 'object' && !Array.isArray(tier1[field]) && !tier1[field].trim?.()) ||
        (Array.isArray(tier1[field]) && tier1[field].length === 0))
      if (missing.length > 0) {
        missingItems.push(`Tier 1 questions: ${missing.length} unanswered`)
      }
    }
  }
  // For Basic reports, Tier 1 is NOT required - explicitly skip it

  // Warnings for incomplete enhancement - check case-insensitively
  if (reportDepthLevel === 'enhanced' && !report.tier2Responses) {
    warnings.push('Tier 2 questions not completed - report will be less detailed')
  }

  if (reportDepthLevel === 'optimised' && !report.tier3Responses) {
    warnings.push('Tier 3 questions not completed - cost estimation may be less precise')
  }

  // Check for hazards
  if (report.tier1Responses) {
    const tier1 = JSON.parse(report.tier1Responses)
    const hazards = tier1.T1_Q7_hazards || []
    if (hazards.length > 0 && !hazards.includes('None identified')) {
      warnings.push('Hazards identified - ensure STOP WORK flags are included in report')
    }
  }

  // Check for Class 4 drying
  if (report.tier3Responses) {
    const tier3 = JSON.parse(report.tier3Responses)
    if (tier3.T3_Q5_class4DryingAssessment?.includes('Class 4')) {
      warnings.push('Class 4 drying confirmed - ensure specialist quote flag is included')
    }
  }

  return {
    canGenerate: missingItems.length === 0,
    missingItems,
    warnings
  }
}

