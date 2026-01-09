/**
 * Australian Inspection Report Field Library
 * Pre-configured fields for customizable inspection reports
 * Total: 63 fields across 5 categories
 *
 * Categories:
 * 1. Property & Compliance (15 fields)
 * 2. Emergency Services Documentation (8 fields)
 * 3. IICRC Classification (12 fields)
 * 4. Cost Breakdown - Australian GST (10 fields)
 * 5. Standards Compliance (8 fields)
 */

/**
 * Field Library Type Definitions
 */
export interface InspectionField {
  id: string
  label: string
  description?: string
  type: 'text' | 'number' | 'email' | 'tel' | 'date' | 'datetime' | 'select' | 'multiselect' | 'checkbox' | 'textarea' | 'currency'
  category: string
  required: boolean
  defaultValue?: string | number | boolean
  placeholder?: string
  validation?: RegExp | ((value: any) => boolean)
  validationMessage?: string
  options?: Array<{ label: string; value: string | number }>
  conditionalOn?: {
    fieldId: string
    value: string | number | boolean
  }
  autoCalculate?: (formData: Record<string, any>) => any
  helpText?: string
  maxLength?: number
  pattern?: string
}

export interface FieldLibrary {
  propertyCompliance: InspectionField[]
  emergencyServices: InspectionField[]
  iicrcClassification: InspectionField[]
  costBreakdown: InspectionField[]
  standardsCompliance: InspectionField[]
}

/**
 * Australian Inspection Field Library
 * 63 pre-configured fields for customizable inspection reports
 */
export const AUSTRALIAN_INSPECTION_FIELD_LIBRARY: FieldLibrary = {
  /**
   * CATEGORY 1: PROPERTY & COMPLIANCE (15 fields)
   */
  propertyCompliance: [
    {
      id: 'abn_number',
      label: 'ABN Number',
      description: 'Australian Business Number of the property owner',
      type: 'text',
      category: 'Property & Compliance',
      required: false,
      placeholder: '12 345 678 901',
      validation: /^\d{2}\s\d{3}\s\d{3}\s\d{3}$/,
      validationMessage: 'ABN must be in format: XX XXX XXX XXX',
      helpText: 'Enter 11-digit ABN with spaces'
    },
    {
      id: 'property_type',
      label: 'Property Type',
      description: 'Classification of the property',
      type: 'select',
      category: 'Property & Compliance',
      required: true,
      options: [
        { label: 'Residential - House', value: 'residential_house' },
        { label: 'Residential - Apartment', value: 'residential_apartment' },
        { label: 'Residential - Townhouse', value: 'residential_townhouse' },
        { label: 'Commercial - Office', value: 'commercial_office' },
        { label: 'Commercial - Retail', value: 'commercial_retail' },
        { label: 'Commercial - Warehouse', value: 'commercial_warehouse' },
        { label: 'Strata Title', value: 'strata_title' },
        { label: 'Industrial', value: 'industrial' },
        { label: 'Other', value: 'other' }
      ],
      defaultValue: 'residential_house'
    },
    {
      id: 'strata_plan_number',
      label: 'Strata Plan Number',
      description: 'Strata plan number (if applicable)',
      type: 'text',
      category: 'Property & Compliance',
      required: false,
      placeholder: 'E.g., 12345',
      conditionalOn: {
        fieldId: 'property_type',
        value: 'strata_title'
      }
    },
    {
      id: 'property_postcode',
      label: 'Property Postcode',
      description: 'Postcode triggers automatic state detection',
      type: 'text',
      category: 'Property & Compliance',
      required: true,
      placeholder: '4000',
      validation: /^\d{4}$/,
      validationMessage: 'Postcode must be 4 digits',
      helpText: 'Enter Australian postcode (triggers state detection)'
    },
    {
      id: 'state_territory',
      label: 'State/Territory',
      description: 'Auto-detected from postcode, can be overridden',
      type: 'select',
      category: 'Property & Compliance',
      required: true,
      options: [
        { label: 'Queensland (QLD)', value: 'QLD' },
        { label: 'New South Wales (NSW)', value: 'NSW' },
        { label: 'Victoria (VIC)', value: 'VIC' },
        { label: 'South Australia (SA)', value: 'SA' },
        { label: 'Western Australia (WA)', value: 'WA' },
        { label: 'Tasmania (TAS)', value: 'TAS' },
        { label: 'Australian Capital Territory (ACT)', value: 'ACT' },
        { label: 'Northern Territory (NT)', value: 'NT' }
      ],
      defaultValue: 'QLD'
    },
    {
      id: 'building_age',
      label: 'Building Age',
      description: 'Approximate age of the building',
      type: 'select',
      category: 'Property & Compliance',
      required: false,
      options: [
        { label: 'Less than 5 years', value: 'less_5' },
        { label: '5-10 years', value: '5_10' },
        { label: '10-20 years', value: '10_20' },
        { label: '20-50 years', value: '20_50' },
        { label: 'More than 50 years', value: 'more_50' }
      ]
    },
    {
      id: 'construction_type',
      label: 'Construction Type',
      description: 'Primary construction material of the property',
      type: 'select',
      category: 'Property & Compliance',
      required: false,
      options: [
        { label: 'Brick Veneer', value: 'brick_veneer' },
        { label: 'Double Brick', value: 'double_brick' },
        { label: 'Weatherboard', value: 'weatherboard' },
        { label: 'Concrete Block', value: 'concrete_block' },
        { label: 'Timber Frame', value: 'timber_frame' },
        { label: 'Steel Frame', value: 'steel_frame' },
        { label: 'Concrete Slab', value: 'concrete_slab' },
        { label: 'Mixed Materials', value: 'mixed' }
      ]
    },
    {
      id: 'local_council_authority',
      label: 'Local Council/Authority',
      description: 'Local council or local authority having jurisdiction',
      type: 'text',
      category: 'Property & Compliance',
      required: false,
      placeholder: 'E.g., Brisbane City Council'
    },
    {
      id: 'building_code_compliance_required',
      label: 'Building Code Compliance Required',
      description: 'Is Building Code of Australia (BCA) compliance assessment required?',
      type: 'checkbox',
      category: 'Property & Compliance',
      required: false,
      defaultValue: false
    },
    {
      id: 'state_building_authority_contact',
      label: 'State Building Authority Contact',
      description: 'Auto-populated based on state selection',
      type: 'text',
      category: 'Property & Compliance',
      required: false,
      placeholder: 'Auto-populated from state'
    },
    {
      id: 'property_address',
      label: 'Property Address (Full)',
      description: 'Complete street address of the property',
      type: 'textarea',
      category: 'Property & Compliance',
      required: true,
      placeholder: '123 Main Street, Brisbane QLD 4000'
    },
    {
      id: 'property_owner_name',
      label: 'Property Owner Name',
      description: 'Full name of the property owner',
      type: 'text',
      category: 'Property & Compliance',
      required: false,
      placeholder: 'John Smith'
    },
    {
      id: 'property_owner_contact',
      label: 'Property Owner Contact',
      description: 'Phone or email of the property owner',
      type: 'text',
      category: 'Property & Compliance',
      required: false,
      placeholder: '0412 345 678 or john@example.com'
    },
    {
      id: 'insurance_provider',
      label: 'Insurance Provider',
      description: 'Name of the insurance company covering this property',
      type: 'text',
      category: 'Property & Compliance',
      required: false,
      placeholder: 'E.g., NRMA, QBE'
    },
    {
      id: 'insurance_policy_number',
      label: 'Insurance Policy Number',
      description: 'Policy number for insurance claim reference',
      type: 'text',
      category: 'Property & Compliance',
      required: false,
      placeholder: 'POL-123456'
    }
  ],

  /**
   * CATEGORY 2: EMERGENCY SERVICES DOCUMENTATION (8 fields)
   */
  emergencyServices: [
    {
      id: 'emergency_services_attended',
      label: 'Emergency Services Attended Site',
      description: 'Did any emergency services attend the site?',
      type: 'checkbox',
      category: 'Emergency Services',
      required: false,
      defaultValue: false
    },
    {
      id: 'fire_brigade_attended',
      label: 'Fire Brigade Attended',
      description: 'Did Fire Brigade attend the incident?',
      type: 'checkbox',
      category: 'Emergency Services',
      required: false,
      conditionalOn: {
        fieldId: 'emergency_services_attended',
        value: true
      }
    },
    {
      id: 'fire_brigade_datetime',
      label: 'Fire Brigade Date & Time',
      description: 'Date and time Fire Brigade attended',
      type: 'datetime',
      category: 'Emergency Services',
      required: false,
      conditionalOn: {
        fieldId: 'fire_brigade_attended',
        value: true
      }
    },
    {
      id: 'ses_attended',
      label: 'SES (State Emergency Service) Attended',
      description: 'Did SES attend the incident?',
      type: 'checkbox',
      category: 'Emergency Services',
      required: false,
      conditionalOn: {
        fieldId: 'emergency_services_attended',
        value: true
      }
    },
    {
      id: 'ses_datetime',
      label: 'SES Date & Time',
      description: 'Date and time SES attended',
      type: 'datetime',
      category: 'Emergency Services',
      required: false,
      conditionalOn: {
        fieldId: 'ses_attended',
        value: true
      }
    },
    {
      id: 'emergency_service_incident_number',
      label: 'Emergency Service Incident Number',
      description: 'Reference number from emergency services report',
      type: 'text',
      category: 'Emergency Services',
      required: false,
      placeholder: 'INC-2024-001234',
      conditionalOn: {
        fieldId: 'emergency_services_attended',
        value: true
      }
    },
    {
      id: 'emergency_contact_officer_name',
      label: 'Emergency Service Contact Officer Name',
      description: 'Name of the officer who attended',
      type: 'text',
      category: 'Emergency Services',
      required: false,
      placeholder: 'Constable John Doe',
      conditionalOn: {
        fieldId: 'emergency_services_attended',
        value: true
      }
    },
    {
      id: 'emergency_contact_officer_phone',
      label: 'Emergency Service Contact Officer Phone',
      description: 'Phone number of the contact officer',
      type: 'tel',
      category: 'Emergency Services',
      required: false,
      placeholder: '0412 345 678',
      conditionalOn: {
        fieldId: 'emergency_services_attended',
        value: true
      }
    }
  ],

  /**
   * CATEGORY 3: IICRC CLASSIFICATION (12 fields)
   * Based on IICRC S500 standard
   */
  iicrcClassification: [
    {
      id: 'water_source',
      label: 'Water Source',
      description: 'Source of the water damage (determines water category)',
      type: 'select',
      category: 'IICRC Classification',
      required: true,
      options: [
        { label: 'Clean (potable water, broken pipe, rain)', value: 'clean' },
        { label: 'Grey (washing machine, dishwasher, aquarium)', value: 'grey' },
        { label: 'Black (sewage, contaminated water)', value: 'black' },
        { label: 'Unknown', value: 'unknown' }
      ],
      defaultValue: 'clean'
    },
    {
      id: 'water_category',
      label: 'Water Category (IICRC)',
      description: 'Auto-calculated based on water source and time since loss',
      type: 'select',
      category: 'IICRC Classification',
      required: true,
      options: [
        { label: 'Category 1 - Clean Water', value: '1' },
        { label: 'Category 2 - Grey Water', value: '2' },
        { label: 'Category 3 - Black Water', value: '3' }
      ],
      autoCalculate: (data) => {
        const source = data.water_source
        const timeSinceLoss = data.time_since_loss_hours || 0

        if (source === 'black') return '3'
        if (source === 'grey') return '2'
        if (source === 'clean' && timeSinceLoss > 48) return '2'
        return '1'
      }
    },
    {
      id: 'water_class',
      label: 'Water Class (IICRC)',
      description: 'Auto-calculated based on affected area percentage',
      type: 'select',
      category: 'IICRC Classification',
      required: true,
      options: [
        { label: 'Class 1 - Least affected (<10% floor space)', value: '1' },
        { label: 'Class 2 - Small affected (10-25% floor space)', value: '2' },
        { label: 'Class 3 - Large affected (>25% floor space)', value: '3' },
        { label: 'Class 4 - Specialty drying (dense materials)', value: '4' }
      ],
      autoCalculate: (data) => {
        const affectedPercent = data.affected_area_percentage || 0
        if (affectedPercent > 75) return '3'
        if (affectedPercent > 25) return '2'
        if (affectedPercent > 10) return '2'
        return '1'
      }
    },
    {
      id: 'time_since_loss_hours',
      label: 'Time Since Loss (Hours)',
      description: 'Hours elapsed since water damage occurred',
      type: 'number',
      category: 'IICRC Classification',
      required: true,
      placeholder: '24',
      helpText: 'Used to determine category degradation (Category 1 degrades after 48 hours)'
    },
    {
      id: 'affected_area_square_footage',
      label: 'Affected Square Footage',
      description: 'Total area affected by water damage (sq ft)',
      type: 'number',
      category: 'IICRC Classification',
      required: true,
      placeholder: '500',
      helpText: 'Used to calculate water class'
    },
    {
      id: 'affected_area_percentage',
      label: 'Affected Area Percentage',
      description: 'Percentage of floor space affected',
      type: 'number',
      category: 'IICRC Classification',
      required: false,
      placeholder: '15',
      autoCalculate: (data) => {
        if (data.affected_area_square_footage && data.total_floor_area) {
          return Math.round((data.affected_area_square_footage / data.total_floor_area) * 100)
        }
        return null
      }
    },
    {
      id: 'ceiling_height_meters',
      label: 'Ceiling Height (Meters)',
      description: 'Average ceiling height of affected area',
      type: 'number',
      category: 'IICRC Classification',
      required: false,
      placeholder: '2.7',
      defaultValue: 2.7
    },
    {
      id: 'temperature_celsius',
      label: 'Temperature (°C)',
      description: 'Current ambient temperature',
      type: 'number',
      category: 'IICRC Classification',
      required: false,
      placeholder: '22'
    },
    {
      id: 'humidity_percentage',
      label: 'Humidity (%)',
      description: 'Current relative humidity',
      type: 'number',
      category: 'IICRC Classification',
      required: false,
      placeholder: '65',
      helpText: 'Range: 0-100%'
    },
    {
      id: 'dew_point_celsius',
      label: 'Dew Point (°C)',
      description: 'Dew point temperature (auto-calculated or measured)',
      type: 'number',
      category: 'IICRC Classification',
      required: false,
      placeholder: '15',
      autoCalculate: (data) => {
        const temp = data.temperature_celsius
        const humidity = data.humidity_percentage
        if (temp && humidity) {
          const a = 17.27
          const b = 237.7
          const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100)
          const dewPoint = (b * alpha) / (a - alpha)
          return Math.round(dewPoint * 10) / 10
        }
        return null
      }
    },
    {
      id: 'equipment_recommendations',
      label: 'Equipment Recommendations',
      description: 'Recommended equipment based on IICRC class (auto-generated)',
      type: 'textarea',
      category: 'IICRC Classification',
      required: false,
      autoCalculate: (data) => {
        const waterClass = data.water_class
        const affectedSqFt = data.affected_area_square_footage || 0
        const ceilingHeight = data.ceiling_height_meters || 2.7
        const cubicFeet = affectedSqFt * ceilingHeight * 3.281

        let equipment = []

        // Air movers: 1 per 75-200 sq ft depending on class
        const airMoverRatio = waterClass === '1' ? 200 : waterClass === '2' ? 150 : 75
        const airMovers = Math.ceil(affectedSqFt / airMoverRatio)
        equipment.push(`Air Movers: ${airMovers} units (1 per ${airMoverRatio} sq ft)`)

        // Dehumidifiers: 1 per 1250 cu ft for LGR
        const dehumidifiers = Math.ceil(cubicFeet / 1250)
        equipment.push(`LGR Dehumidifiers: ${dehumidifiers} units (1 per 1250 cu ft)`)

        // Air scrubbers: if Category 2 or 3
        if (data.water_category === '2' || data.water_category === '3') {
          const airScrubbers = Math.ceil(affectedSqFt / 500)
          equipment.push(`Air Scrubbers: ${airScrubbers} units (1 per 500 sq ft)`)
        }

        return equipment.join('\n')
      }
    },
    {
      id: 'drying_timeline_days',
      label: 'Drying Timeline (Days)',
      description: 'Estimated drying time based on IICRC class and state climate',
      type: 'number',
      category: 'IICRC Classification',
      required: false,
      placeholder: '7',
      helpText: 'State-specific climate variations applied automatically'
    }
  ],

  /**
   * CATEGORY 4: COST BREAKDOWN - AUSTRALIAN GST (10 fields)
   */
  costBreakdown: [
    {
      id: 'labour_cost',
      label: 'Labour Cost (AUD)',
      description: 'Total labour cost before GST',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      placeholder: '5000.00'
    },
    {
      id: 'equipment_rental_cost',
      label: 'Equipment Rental Cost (AUD)',
      description: 'Total equipment rental cost before GST',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      placeholder: '2500.00'
    },
    {
      id: 'materials_cost',
      label: 'Materials Cost (AUD)',
      description: 'Cost of materials used before GST',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      placeholder: '1200.00'
    },
    {
      id: 'subcontractor_cost',
      label: 'Subcontractor Cost (AUD)',
      description: 'Cost of subcontracted services before GST',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      placeholder: '0.00'
    },
    {
      id: 'travel_logistics_cost',
      label: 'Travel & Logistics Cost (AUD)',
      description: 'Travel and transportation costs before GST',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      placeholder: '500.00'
    },
    {
      id: 'waste_removal_cost',
      label: 'Waste Removal Cost (AUD)',
      description: 'Waste disposal and removal cost before GST',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      placeholder: '300.00'
    },
    {
      id: 'subtotal_ex_gst',
      label: 'Subtotal (Excluding GST)',
      description: 'Sum of all costs before GST',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      autoCalculate: (data) => {
        const labour = parseFloat(data.labour_cost) || 0
        const equipment = parseFloat(data.equipment_rental_cost) || 0
        const materials = parseFloat(data.materials_cost) || 0
        const subcontractor = parseFloat(data.subcontractor_cost) || 0
        const travel = parseFloat(data.travel_logistics_cost) || 0
        const waste = parseFloat(data.waste_removal_cost) || 0
        return labour + equipment + materials + subcontractor + travel + waste
      }
    },
    {
      id: 'gst_amount',
      label: 'GST (10%)',
      description: 'Goods and Services Tax at 10% rate',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      autoCalculate: (data) => {
        const subtotal = data.subtotal_ex_gst || 0
        return Math.round(subtotal * 0.1 * 100) / 100 // GST is 10%
      }
    },
    {
      id: 'total_inc_gst',
      label: 'Total (Including GST)',
      description: 'Final total cost including 10% GST',
      type: 'currency',
      category: 'Cost Breakdown',
      required: false,
      autoCalculate: (data) => {
        const subtotal = data.subtotal_ex_gst || 0
        const gst = data.gst_amount || (subtotal * 0.1)
        return Math.round((subtotal + gst) * 100) / 100
      }
    },
    {
      id: 'payment_terms',
      label: 'Payment Terms',
      description: 'Payment terms for this invoice',
      type: 'select',
      category: 'Cost Breakdown',
      required: false,
      options: [
        { label: '7 days', value: '7' },
        { label: '14 days', value: '14' },
        { label: '30 days', value: '30' },
        { label: '60 days', value: '60' }
      ],
      defaultValue: '30'
    }
  ],

  /**
   * CATEGORY 5: STANDARDS COMPLIANCE (8 fields)
   */
  standardsCompliance: [
    {
      id: 'iicrc_s500_compliance',
      label: 'IICRC S500 Compliance',
      description: 'Compliance with IICRC S500 Standard for Water Damage',
      type: 'select',
      category: 'Standards Compliance',
      required: false,
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
        { label: 'N/A', value: 'na' }
      ]
    },
    {
      id: 'asnzs_3000_electrical_compliance',
      label: 'AS/NZS 3000 Electrical Compliance',
      description: 'Compliance with Australian Electrical Wiring Rules',
      type: 'select',
      category: 'Standards Compliance',
      required: false,
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
        { label: 'N/A', value: 'na' }
      ]
    },
    {
      id: 'bca_compliance_required',
      label: 'BCA Compliance Required',
      description: 'Building Code of Australia (BCA) compliance assessment needed',
      type: 'checkbox',
      category: 'Standards Compliance',
      required: false,
      defaultValue: false
    },
    {
      id: 'worksafe_notification_required',
      label: 'WorkSafe Notification Required',
      description: 'Is WorkSafe notification required for this incident?',
      type: 'checkbox',
      category: 'Standards Compliance',
      required: false,
      defaultValue: false
    },
    {
      id: 'epa_notification_required',
      label: 'EPA Notification Required',
      description: 'Is Environmental Protection Authority notification required?',
      type: 'checkbox',
      category: 'Standards Compliance',
      required: false,
      defaultValue: false
    },
    {
      id: 'include_regulatory_citations',
      label: 'Include Regulatory Citations in PDF',
      description: 'Add Australian regulatory citations to the report (optional)',
      type: 'checkbox',
      category: 'Standards Compliance',
      required: false,
      defaultValue: false,
      helpText: 'Adds NCC 2025, AS/NZS, BCA, ACL citations to report PDF'
    },
    {
      id: 'applicable_australian_standards',
      label: 'Applicable Australian Standards',
      description: 'Select all applicable standards for this project',
      type: 'multiselect',
      category: 'Standards Compliance',
      required: false,
      options: [
        { label: 'IICRC S500 (Water Damage Standard)', value: 'iicrc_s500' },
        { label: 'AS/NZS 3000 (Electrical Wiring Rules)', value: 'asnzs_3000' },
        { label: 'BCA (Building Code of Australia)', value: 'bca' },
        { label: 'NCC 2025 (National Construction Code)', value: 'ncc_2025' },
        { label: 'Australian Consumer Law 2024', value: 'acl_2024' },
        { label: 'General Insurance Code', value: 'insurance_code' },
        { label: 'Work Health and Safety Act', value: 'whs_act' }
      ]
    },
    {
      id: 'state_specific_requirements',
      label: 'State-Specific Requirements',
      description: 'Auto-populated based on property state',
      type: 'textarea',
      category: 'Standards Compliance',
      required: false,
      helpText: 'Auto-populated with state-specific building and safety requirements'
    }
  ]
}

/**
 * Helper function: Get all fields flattened into a single array
 */
export function getAllAustralianFields(): InspectionField[] {
  return [
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown,
    ...AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance
  ]
}

/**
 * Helper function: Get field by ID
 */
export function getFieldById(fieldId: string): InspectionField | undefined {
  return getAllAustralianFields().find(field => field.id === fieldId)
}

/**
 * Helper function: Get fields by category
 */
export function getFieldsByCategory(category: string): InspectionField[] {
  return getAllAustralianFields().filter(field => field.category === category)
}

/**
 * Helper function: Validate field value
 */
export function validateFieldValue(fieldId: string, value: any): { valid: boolean; error?: string } {
  const field = getFieldById(fieldId)
  if (!field) {
    return { valid: false, error: 'Field not found' }
  }

  // Check required
  if (field.required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: `${field.label} is required` }
  }

  // Check validation regex
  if (field.validation instanceof RegExp && value) {
    if (!field.validation.test(value.toString())) {
      return { valid: false, error: field.validationMessage || `${field.label} format is invalid` }
    }
  }

  // Check validation function
  if (typeof field.validation === 'function' && value) {
    if (!field.validation(value)) {
      return { valid: false, error: field.validationMessage || `${field.label} validation failed` }
    }
  }

  return { valid: true }
}

/**
 * Export for use in form builder
 */
export const FIELD_CATEGORIES = [
  {
    id: 'property_compliance',
    label: '🏠 Property & Compliance',
    description: 'Property details, ABN, building information',
    count: AUSTRALIAN_INSPECTION_FIELD_LIBRARY.propertyCompliance.length
  },
  {
    id: 'emergency_services',
    label: '🚒 Emergency Services',
    description: 'Fire Brigade, SES, police attendance documentation',
    count: AUSTRALIAN_INSPECTION_FIELD_LIBRARY.emergencyServices.length
  },
  {
    id: 'iicrc_classification',
    label: '💧 IICRC Classification',
    description: 'Water damage assessment, categories, classes, equipment',
    count: AUSTRALIAN_INSPECTION_FIELD_LIBRARY.iicrcClassification.length
  },
  {
    id: 'cost_breakdown',
    label: '💰 Cost Breakdown (GST)',
    description: 'Labour, equipment, materials with Australian GST calculation',
    count: AUSTRALIAN_INSPECTION_FIELD_LIBRARY.costBreakdown.length
  },
  {
    id: 'standards_compliance',
    label: '✓ Standards Compliance',
    description: 'IICRC, AS/NZS, BCA, WorkSafe, EPA compliance tracking',
    count: AUSTRALIAN_INSPECTION_FIELD_LIBRARY.standardsCompliance.length
  }
]
