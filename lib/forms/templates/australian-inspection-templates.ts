/**
 * Australian Inspection Report Templates
 * Pre-configured field combinations for common inspection scenarios
 *
 * Clients can start with these templates and customize by adding/removing fields
 */

export interface InspectionTemplate {
  id: string
  name: string
  description: string
  category: 'water-damage' | 'compliance' | 'quick' | 'insurance' | 'custom'
  fieldIds: string[]
  fieldCount: number
  estimatedCompletionTime: number // minutes
  stakeholders: ('insurance' | 'client' | 'internal')[]
  icon: string
}

/**
 * Template 1: Basic Water Damage Inspection
 * Quick assessment focused on water damage classification and basic costs
 * Best for: Initial on-site assessments
 * Stakeholders: All three
 */
const BASIC_WATER_DAMAGE: InspectionTemplate = {
  id: 'basic-water-damage',
  name: 'Basic Water Damage Inspection',
  description: 'Quick assessment with water classification and basic costs',
  category: 'water-damage',
  fieldIds: [
    // Property (8 fields)
    'property_type',
    'postcode',
    'state_territory',
    'building_age',
    'construction_type',
    'owner_name',
    'owner_contact',
    'property_address',

    // Emergency Services (2 fields)
    'emergency_services_attended',
    'emergency_incident_number',

    // IICRC Classification (12 fields - ALL)
    'water_source',
    'water_category',
    'water_class',
    'time_since_loss_hours',
    'affected_area_square_footage',
    'affected_area_percentage',
    'ceiling_height_meters',
    'temperature_celsius',
    'humidity_percentage',
    'dew_point_celsius',
    'equipment_recommendations',
    'drying_timeline_days',

    // Cost Breakdown (5 fields)
    'labour_cost',
    'equipment_rental_cost',
    'subtotal_ex_gst',
    'gst_10_percent',
    'total_inc_gst',
  ],
  fieldCount: 27, // 8 + 2 + 12 + 5
  estimatedCompletionTime: 20,
  stakeholders: ['insurance', 'client', 'internal'],
  icon: '💧',
}

/**
 * Template 2: Comprehensive Compliance Inspection
 * Complete documentation including all standards and regulatory requirements
 * Best for: Detailed compliance documentation, large losses
 * Stakeholders: Insurance (primary), Internal
 */
const COMPREHENSIVE_COMPLIANCE: InspectionTemplate = {
  id: 'comprehensive-compliance',
  name: 'Comprehensive Compliance Inspection',
  description: 'Full documentation with all standards, regulations, and compliance tracking',
  category: 'compliance',
  fieldIds: [
    // Property & Compliance (15 fields - ALL)
    'abn_number',
    'property_type',
    'strata_plan_number',
    'postcode',
    'state_territory',
    'building_age',
    'construction_type',
    'local_council_authority',
    'bca_compliance_required',
    'state_building_authority_contact',
    'owner_name',
    'owner_contact',
    'insurance_provider',
    'insurance_policy_number',
    'property_address',

    // Emergency Services (8 fields - ALL)
    'emergency_services_attended',
    'fire_brigade_attended',
    'fire_brigade_date_time',
    'ses_attended',
    'ses_date_time',
    'police_attended',
    'ambulance_attended',
    'emergency_incident_number',
    'emergency_contact_officer_name',
    'emergency_contact_officer_phone',

    // IICRC Classification (12 fields - ALL)
    'water_source',
    'water_category',
    'water_class',
    'time_since_loss_hours',
    'affected_area_square_footage',
    'affected_area_percentage',
    'ceiling_height_meters',
    'temperature_celsius',
    'humidity_percentage',
    'dew_point_celsius',
    'equipment_recommendations',
    'drying_timeline_days',

    // Cost Breakdown (10 fields - ALL)
    'labour_cost',
    'equipment_rental_cost',
    'materials_cost',
    'subcontractor_cost',
    'travel_logistics_cost',
    'waste_removal_cost',
    'subtotal_ex_gst',
    'gst_10_percent',
    'total_inc_gst',
    'payment_terms',

    // Standards Compliance (8 fields - ALL)
    'iicrc_s500_compliance',
    'as_nzs_3000_electrical_compliance',
    'bca_compliance_required_check',
    'worksafe_notification_required',
    'epa_notification_required',
    'include_regulatory_citations',
    'applicable_australian_standards',
    'state_specific_requirements',
  ],
  fieldCount: 53, // 15 + 8 + 12 + 10 + 8
  estimatedCompletionTime: 45,
  stakeholders: ['insurance', 'internal'],
  icon: '📊',
}

/**
 * Template 3: Quick Assessment
 * Minimal fields for rapid on-site data capture
 * Best for: Initial damage assessment, time-constrained situations
 * Stakeholders: Internal (for internal technician notes)
 */
const QUICK_ASSESSMENT: InspectionTemplate = {
  id: 'quick-assessment',
  name: 'Quick Assessment',
  description: 'Minimal fields for rapid on-site assessment',
  category: 'quick',
  fieldIds: [
    // Property (5 fields)
    'property_address',
    'postcode',
    'state_territory',
    'property_type',
    'owner_contact',

    // Emergency Services (1 field)
    'emergency_services_attended',

    // IICRC Classification (7 fields)
    'water_source',
    'water_category',
    'water_class',
    'affected_area_square_footage',
    'ceiling_height_meters',
    'temperature_celsius',
    'humidity_percentage',

    // Cost Breakdown (2 fields)
    'equipment_rental_cost',
    'total_inc_gst',
  ],
  fieldCount: 15, // 5 + 1 + 7 + 2
  estimatedCompletionTime: 10,
  stakeholders: ['internal'],
  icon: '⚡',
}

/**
 * Template 4: Insurance Claim Detailed
 * Optimized for insurance adjuster requirements - comprehensive without internal details
 * Best for: Claims submission, insurance documentation
 * Stakeholders: Insurance
 */
const INSURANCE_CLAIM_DETAILED: InspectionTemplate = {
  id: 'insurance-claim-detailed',
  name: 'Insurance Claim Detailed',
  description: 'Optimized for insurance adjuster requirements and claim documentation',
  category: 'insurance',
  fieldIds: [
    // Property & Compliance (12 fields - most important for insurance)
    'abn_number',
    'property_type',
    'strata_plan_number',
    'postcode',
    'state_territory',
    'building_age',
    'construction_type',
    'owner_name',
    'owner_contact',
    'insurance_provider',
    'insurance_policy_number',
    'property_address',

    // Emergency Services (8 fields - ALL)
    'emergency_services_attended',
    'fire_brigade_attended',
    'fire_brigade_date_time',
    'ses_attended',
    'ses_date_time',
    'police_attended',
    'ambulance_attended',
    'emergency_incident_number',
    'emergency_contact_officer_name',
    'emergency_contact_officer_phone',

    // IICRC Classification (12 fields - ALL)
    'water_source',
    'water_category',
    'water_class',
    'time_since_loss_hours',
    'affected_area_square_footage',
    'affected_area_percentage',
    'ceiling_height_meters',
    'temperature_celsius',
    'humidity_percentage',
    'dew_point_celsius',
    'equipment_recommendations',
    'drying_timeline_days',

    // Cost Breakdown (10 fields - ALL)
    'labour_cost',
    'equipment_rental_cost',
    'materials_cost',
    'subcontractor_cost',
    'travel_logistics_cost',
    'waste_removal_cost',
    'subtotal_ex_gst',
    'gst_10_percent',
    'total_inc_gst',
    'payment_terms',

    // Standards Compliance (5 fields - key compliance items)
    'iicrc_s500_compliance',
    'as_nzs_3000_electrical_compliance',
    'bca_compliance_required',
    'worksafe_notification_required',
    'include_regulatory_citations',
  ],
  fieldCount: 47, // 12 + 8 + 12 + 10 + 5
  estimatedCompletionTime: 40,
  stakeholders: ['insurance'],
  icon: '🏢',
}

/**
 * Collection of all pre-configured templates
 */
export const INSPECTION_TEMPLATES: InspectionTemplate[] = [
  BASIC_WATER_DAMAGE,
  COMPREHENSIVE_COMPLIANCE,
  QUICK_ASSESSMENT,
  INSURANCE_CLAIM_DETAILED,
]

/**
 * Get template by ID
 */
export function getTemplate(templateId: string): InspectionTemplate | undefined {
  return INSPECTION_TEMPLATES.find(t => t.id === templateId)
}

/**
 * Get all templates for a specific category
 */
export function getTemplatesByCategory(category: InspectionTemplate['category']): InspectionTemplate[] {
  return INSPECTION_TEMPLATES.filter(t => t.category === category)
}

/**
 * Get all templates suitable for specific stakeholders
 */
export function getTemplatesForStakeholder(
  stakeholder: 'insurance' | 'client' | 'internal'
): InspectionTemplate[] {
  return INSPECTION_TEMPLATES.filter(t => t.stakeholders.includes(stakeholder))
}

/**
 * Get template field count
 */
export function getTemplateFieldCount(templateId: string): number {
  return getTemplate(templateId)?.fieldCount ?? 0
}

/**
 * Get template estimated completion time in minutes
 */
export function getTemplateCompletionTime(templateId: string): number {
  return getTemplate(templateId)?.estimatedCompletionTime ?? 0
}

/**
 * Get all template metadata (for listings/UI)
 */
export function getTemplateMetadata() {
  return INSPECTION_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    fieldCount: t.fieldCount,
    estimatedCompletionTime: t.estimatedCompletionTime,
    stakeholders: t.stakeholders,
    icon: t.icon,
  }))
}

/**
 * Clone template and customize (returns field IDs for new selection)
 */
export function customizeTemplate(
  templateId: string,
  addFieldIds: string[] = [],
  removeFieldIds: string[] = []
): string[] {
  const template = getTemplate(templateId)
  if (!template) return []

  let customFields = new Set(template.fieldIds)

  // Add fields
  addFieldIds.forEach(id => customFields.add(id))

  // Remove fields
  removeFieldIds.forEach(id => customFields.delete(id))

  return Array.from(customFields)
}

/**
 * Create a new custom template from field selection
 */
export function createCustomTemplate(
  name: string,
  description: string,
  fieldIds: string[],
  stakeholders: ('insurance' | 'client' | 'internal')[] = ['insurance', 'client', 'internal']
): InspectionTemplate {
  return {
    id: `custom-${Date.now()}`,
    name,
    description,
    category: 'custom',
    fieldIds,
    fieldCount: fieldIds.length,
    estimatedCompletionTime: Math.ceil(fieldIds.length / 2), // ~2 fields per minute
    stakeholders,
    icon: '⚙️',
  }
}

/**
 * Get templates sorted by complexity (field count)
 */
export function getTemplatesByComplexity(order: 'asc' | 'desc' = 'asc'): InspectionTemplate[] {
  const sorted = [...INSPECTION_TEMPLATES].sort((a, b) => a.fieldCount - b.fieldCount)
  return order === 'desc' ? sorted.reverse() : sorted
}

/**
 * Get suggested template based on situation
 */
export function suggestTemplate(situation: 'initial-assessment' | 'detailed-claim' | 'compliance-audit'): InspectionTemplate {
  switch (situation) {
    case 'initial-assessment':
      return getTemplate('quick-assessment') || BASIC_WATER_DAMAGE
    case 'detailed-claim':
      return getTemplate('insurance-claim-detailed') || COMPREHENSIVE_COMPLIANCE
    case 'compliance-audit':
      return getTemplate('comprehensive-compliance') || COMPREHENSIVE_COMPLIANCE
    default:
      return BASIC_WATER_DAMAGE
  }
}

/**
 * Calculate template coverage (% of available fields)
 */
export function getTemplateCoverage(templateId: string, totalAvailableFields: number = 63): number {
  const template = getTemplate(templateId)
  if (!template) return 0
  return (template.fieldCount / totalAvailableFields) * 100
}

/**
 * Export template as JSON for sharing
 */
export function exportTemplateAsJSON(templateId: string): string {
  const template = getTemplate(templateId)
  if (!template) return '{}'
  return JSON.stringify(template, null, 2)
}

/**
 * Import template from JSON
 */
export function importTemplateFromJSON(jsonString: string): InspectionTemplate | null {
  try {
    const parsed = JSON.parse(jsonString)
    // Basic validation
    if (!parsed.id || !parsed.name || !Array.isArray(parsed.fieldIds)) {
      return null
    }
    return parsed as InspectionTemplate
  } catch {
    return null
  }
}

/**
 * Get template statistics
 */
export function getTemplateStatistics() {
  return {
    totalTemplates: INSPECTION_TEMPLATES.length,
    totalFieldsAcrossAllTemplates: INSPECTION_TEMPLATES.reduce((sum, t) => sum + t.fieldCount, 0),
    averageFieldsPerTemplate: Math.round(
      INSPECTION_TEMPLATES.reduce((sum, t) => sum + t.fieldCount, 0) / INSPECTION_TEMPLATES.length
    ),
    mostComprehensive: INSPECTION_TEMPLATES.reduce((prev, current) =>
      prev.fieldCount > current.fieldCount ? prev : current
    ),
    quickest: INSPECTION_TEMPLATES.reduce((prev, current) =>
      prev.estimatedCompletionTime < current.estimatedCompletionTime ? prev : current
    ),
    byCategory: {
      waterDamage: getTemplatesByCategory('water-damage').length,
      compliance: getTemplatesByCategory('compliance').length,
      quick: getTemplatesByCategory('quick').length,
      insurance: getTemplatesByCategory('insurance').length,
      custom: getTemplatesByCategory('custom').length,
    },
  }
}

export default INSPECTION_TEMPLATES
