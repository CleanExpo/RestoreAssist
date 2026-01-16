/**
 * Auto-suggestion logic for Authority Forms based on report data
 * Option B: Auto-Suggestion Based on Report Type
 */

export interface ReportAnalysis {
  waterCategory?: string | null // "Category 1", "Category 2", "Category 3"
  waterClass?: string | null // "1", "2", "3", "4"
  scopeItems?: string[] // Array of scope item IDs
  equipmentDeployed?: boolean
  hasDemolition?: boolean
  hasDisposal?: boolean
  hasContamination?: boolean
  biologicalMouldDetected?: boolean
  methamphetamineScreen?: string | null
}

export interface SuggestedForm {
  templateCode: string
  templateName: string
  priority: 'required' | 'recommended' | 'optional'
  reason: string
}

/**
 * Analyze report data and suggest appropriate authority forms
 */
export function suggestAuthorityForms(analysis: ReportAnalysis): SuggestedForm[] {
  const suggestions: SuggestedForm[] = []

  // 1. Authority to Commence Work
  // Required if equipment is being deployed or work is starting
  if (analysis.equipmentDeployed || analysis.waterCategory) {
    suggestions.push({
      templateCode: 'AUTH_COMMENCE',
      templateName: 'Authority to Commence Work',
      priority: 'required',
      reason: 'Equipment deployment or work commencement requires client authorization'
    })
  }

  // 2. Authority to Dispose
  // Required for Category 3 water or contaminated materials
  if (
    analysis.waterCategory?.includes('Category 3') ||
    analysis.waterCategory?.includes('Category 2') ||
    analysis.hasContamination ||
    analysis.biologicalMouldDetected ||
    analysis.methamphetamineScreen === 'POSITIVE'
  ) {
    suggestions.push({
      templateCode: 'AUTH_DISPOSE',
      templateName: 'Authority to Dispose',
      priority: 'required',
      reason: 'Contaminated materials or Category 2/3 water requires disposal authorization'
    })
  }

  // 3. Authority to Not Remove Recommended Damaged Building Materials
  // Required if demolition is recommended but client declines
  if (analysis.hasDemolition) {
    suggestions.push({
      templateCode: 'AUTH_NO_REMOVE',
      templateName: 'Authority to Not Remove Recommended Damaged Building Materials',
      priority: 'recommended',
      reason: 'Demolition work is recommended - client may decline removal'
    })
  }

  // 4. Authority for Chemical Treatment
  // Recommended if antimicrobial treatment is needed
  if (analysis.biologicalMouldDetected || analysis.hasContamination) {
    suggestions.push({
      templateCode: 'AUTH_CHEMICAL',
      templateName: 'Authority for Chemical Treatment',
      priority: 'recommended',
      reason: 'Antimicrobial or chemical treatment may be required for contamination'
    })
  }

  // 5. Authority for Extended Drying Period
  // Optional if extended drying is needed (Class 4 or large area)
  if (analysis.waterClass === '4' || analysis.waterClass === 4) {
    suggestions.push({
      templateCode: 'AUTH_EXTENDED_DRYING',
      templateName: 'Authority for Extended Drying Period',
      priority: 'optional',
      reason: 'Class 4 water damage may require extended drying period'
    })
  }

  // Sort by priority: required > recommended > optional
  return suggestions.sort((a, b) => {
    const priorityOrder = { required: 0, recommended: 1, optional: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
}

/**
 * Extract report analysis from report data
 */
export function extractReportAnalysis(report: any): ReportAnalysis {
  // Parse scope items from JSON if available
  let scopeItems: string[] = []
  try {
    if (report.scopeOfWorksData) {
      const scopeData = JSON.parse(report.scopeOfWorksData)
      if (Array.isArray(scopeData)) {
        scopeItems = scopeData.map((item: any) => item.id || item.itemType || item.code).filter(Boolean)
      } else if (scopeData.items && Array.isArray(scopeData.items)) {
        scopeItems = scopeData.items.map((item: any) => item.id || item.itemType || item.code).filter(Boolean)
      }
    }
  } catch (e) {
    // Ignore parse errors
  }

  // Check for demolition in scope items
  const hasDemolition = scopeItems.some((item: string) => 
    item.toLowerCase().includes('demolish') || 
    item.toLowerCase().includes('remove') ||
    item.toLowerCase().includes('demolition')
  )

  // Check for disposal in scope items
  const hasDisposal = scopeItems.some((item: string) =>
    item.toLowerCase().includes('dispose') ||
    item.toLowerCase().includes('disposal') ||
    item.toLowerCase().includes('waste')
  )

  // Check if equipment is deployed
  const equipmentDeployed = !!(
    report.equipmentSelection ||
    report.equipmentUsed ||
    report.psychrometricAssessment
  )

  return {
    waterCategory: report.waterCategory,
    waterClass: report.waterClass,
    scopeItems,
    equipmentDeployed,
    hasDemolition,
    hasDisposal,
    hasContamination: report.biologicalMouldDetected || report.methamphetamineScreen === 'POSITIVE',
    biologicalMouldDetected: report.biologicalMouldDetected || false,
    methamphetamineScreen: report.methamphetamineScreen
  }
}
