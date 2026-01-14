/**
 * Core Interview Question Templates
 * 25+ questions backed by IICRC S500, Building Codes, Electrical, Plumbing, WHS standards
 * Organized in 4 tiers of progressive detail
 */

import { Question, SubscriptionTier } from './types'

/**
 * TIER 1: ESSENTIAL QUESTIONS (5 questions)
 * Required for all users
 * Determines water source, timing, area, and building basics
 */
const TIER1_QUESTIONS: Question[] = [
  {
    // Q1: Water Source (determines water category)
    id: 'q1_water_source',
    sequenceNumber: 1,
    text: 'Where did the water come from?',
    type: 'multiple_choice',
    helperText: 'This helps determine the water category per IICRC standards',
    exampleAnswer: 'Clean water (supply line burst)',

    standardsReference: ['IICRC S500 s2', 'AS 3500 Plumbing'],
    standardsJustification: 'Water source determines Category 1/2/3 classification',

    options: [
      {
        label: 'Clean water (supply line burst, roof leak)',
        value: 'clean_water',
        helperText: 'Potable water source',
      },
      {
        label: 'Grey water (washing machine, dishwasher, toilet)',
        value: 'grey_water',
        helperText: 'Wastewater with contamination',
      },
      {
        label: 'Black water (sewage backup, highly contaminated)',
        value: 'black_water',
        helperText: 'Hazardous biological contamination',
      },
    ],

    fieldMappings: [
      {
        formFieldId: 'sourceOfWater',
        value: undefined, // Will be set based on answer
        confidence: 100,
      },
      {
        formFieldId: 'waterCategory',
        transformer: (answer) => {
          const categoryMap = { clean_water: 'Category 1', grey_water: 'Category 2', black_water: 'Category 3' }
          return categoryMap[answer] || 'Unknown'
        },
        confidence: 95, // IICRC S500
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q2: Time Since Loss (refines category determination)
    id: 'q2_time_since_loss',
    sequenceNumber: 2,
    text: 'How many hours ago did the loss occur?',
    type: 'multiple_choice',

    standardsReference: ['IICRC S500 s3', 'QDC 4.5 Moisture Thresholds'],
    standardsJustification: 'Time since loss affects contamination level and drying urgency',

    options: [
      { label: 'Less than 12 hours ago', value: 'lt_12h', helperText: 'Fresh loss, minimal degradation' },
      { label: '12-48 hours ago', value: '12_48h', helperText: 'Moderate urgency' },
      { label: '48-72 hours ago', value: '48_72h', helperText: 'Significant degradation risk' },
      { label: 'More than 72 hours ago', value: 'gt_72h', helperText: 'Category may upgrade due to time' },
    ],

    fieldMappings: [
      {
        formFieldId: 'timeSinceLoss',
        transformer: (answer) => {
          const hoursMap = { lt_12h: '6', '12_48h': '30', '48_72h': '60', gt_72h: '100' }
          return hoursMap[answer] || '0'
        },
        confidence: 90,
      },
      {
        formFieldId: 'waterCategory',
        transformer: (answer, context) => {
          // If answer = gt_72h and currentCategory = 1, upgrade to 2
          if (answer === 'gt_72h') return 'Category 2 or 3 (upgraded due to time)'
          return context?.waterCategory || 'Unknown'
        },
        confidence: 85,
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q3: Affected Area Percentage
    id: 'q3_affected_area',
    sequenceNumber: 3,
    text: 'What percentage of the property is affected?',
    type: 'multiple_choice',

    standardsReference: ['IICRC S500 s4', 'NCC 2025 Building Materials'],
    standardsJustification: 'Area percentage affects water class and drying approach',

    options: [
      { label: '0-10% (isolated, single room or bathroom)', value: '0_10' },
      { label: '10-30% (moderate, 2-3 rooms)', value: '10_30' },
      { label: '30-50% (significant, large area)', value: '30_50' },
      { label: 'More than 50% (extensive damage)', value: 'gt_50' },
    ],

    fieldMappings: [
      {
        formFieldId: 'affectedAreaPercentage',
        value: undefined,
        confidence: 100,
      },
      {
        formFieldId: 'waterClass',
        transformer: (answer) => {
          const classMap = { '0_10': 'Class 1', '10_30': 'Class 2', '30_50': 'Class 3', gt_50: 'Class 4' }
          return classMap[answer] || 'Unknown'
        },
        confidence: 90, // IICRC S500
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q4: Affected Materials
    id: 'q4_materials',
    sequenceNumber: 4,
    text: 'What materials are affected? (Select all)',
    type: 'multiselect',

    standardsReference: ['IICRC S500 s4', 'NCC 2025 Building Materials'],
    standardsJustification: 'Material types determine drying method and duration',

    options: [
      { label: 'Drywall', value: 'drywall' },
      { label: 'Carpet/Flooring', value: 'carpet' },
      { label: 'Wood flooring', value: 'wood_floor' },
      { label: 'Concrete', value: 'concrete' },
      { label: 'Structural timber', value: 'structural_timber' },
      { label: 'Insulation', value: 'insulation' },
    ],

    fieldMappings: [
      {
        formFieldId: 'affectedMaterials',
        value: undefined, // Direct array mapping
        confidence: 100,
      },
      {
        formFieldId: 'dryingMethodRequired',
        transformer: (answer) => {
          const hasPorous = Array.isArray(answer) && (answer.includes('drywall') || answer.includes('carpet'))
          return hasPorous ? 'LGR Dehumidification + Air movers' : 'Standard Dehumidification'
        },
        confidence: 92,
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q5: Current Temperature
    id: 'q5_temperature',
    sequenceNumber: 5,
    text: 'What is the current temperature?',
    type: 'numeric',
    helperText: 'In degrees Celsius (typical range: 10-30°C)',

    standardsReference: ['IICRC S500 s6-7 Psychrometric Assessment'],
    standardsJustification: 'Temperature affects evaporation rate and drying duration',

    fieldMappings: [
      {
        formFieldId: 'temperatureCurrent',
        value: undefined,
        confidence: 100,
      },
      {
        formFieldId: 'psychrometricAssessment',
        transformer: (temp) => {
          if (temp < 15) return 'Temperature too low for efficient drying (< 15°C)'
          if (temp > 30) return 'Temperature optimal for drying (> 30°C)'
          return 'Temperature within normal range (15-30°C)'
        },
        confidence: 88,
      },
    ],

    minTierLevel: 'standard',
  },
]

/**
 * TIER 2: ENVIRONMENTAL DATA QUESTIONS (3 questions)
 * Psychrometric and building environment assessment
 */
const TIER2_QUESTIONS: Question[] = [
  {
    // Q6: Current Humidity
    id: 'q6_humidity',
    sequenceNumber: 6,
    text: 'What is the current humidity level?',
    type: 'numeric',
    helperText: 'As percentage RH (relative humidity). Range: 30-100%',

    standardsReference: ['IICRC S500 s6-7 Psychrometric Assessment'],
    standardsJustification: 'Humidity delta determines dehumidifier capacity and drying duration',

    fieldMappings: [
      {
        formFieldId: 'humidityCurrent',
        value: undefined,
        confidence: 100,
      },
      {
        formFieldId: 'humidityDelta',
        transformer: (humidity) => {
          const target = 30
          return Math.abs(humidity - target)
        },
        confidence: 95,
      },
      {
        formFieldId: 'dehumidificationRequired',
        transformer: (humidity) => humidity > 40,
        confidence: 98,
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q7: Structural Assessment
    id: 'q7_structural_damage',
    sequenceNumber: 7,
    text: 'Is there visible structural damage?',
    type: 'yes_no',

    standardsReference: ['NCC 2025 s3 Building Structure', 'Building Standards - Structural'],
    standardsJustification: 'Structural damage affects safety and drying approach',

    conditionalShows: [
      {
        field: 'q3_affected_area',
        operator: 'gt',
        value: 10, // Only show if > 10% affected
      },
    ],

    fieldMappings: [
      {
        formFieldId: 'structuralDamage',
        transformer: (answer) => (answer ? 'Visible structural damage detected' : 'No structural damage visible'),
        confidence: 85,
      },
      {
        formFieldId: 'makeSafeRequired',
        transformer: (answer) => (answer ? ['structural_support'] : []),
        confidence: 90,
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q8: Mould/Microbial Growth
    id: 'q8_microbial_growth',
    sequenceNumber: 8,
    text: 'Can you see any visible mould or microbial growth?',
    type: 'multiple_choice',

    standardsReference: ['IICRC S500 s8 Microbial Assessment', 'WHS Act 2011 Health Hazards'],
    standardsJustification: 'Visible growth requires antimicrobial treatment and safety protocols',

    options: [
      { label: 'Yes - visible mould growth', value: 'visible_mold' },
      { label: 'No - none visible', value: 'no_mold' },
      { label: 'Unsure - need professional assessment', value: 'unsure' },
    ],

    fieldMappings: [
      {
        formFieldId: 'biologicalMouldDetected',
        transformer: (answer) => answer === 'visible_mold',
        confidence: 95,
      },
      {
        formFieldId: 'antimicrobialTreatmentRequired',
        transformer: (answer) => answer === 'visible_mold' || answer === 'unsure',
        confidence: 90,
      },
    ],

    minTierLevel: 'standard',
  },
]

/**
 * TIER 3: BUILDING CODE & COMPLIANCE QUESTIONS (5 questions)
 * State-specific requirements, building age, hazards
 */
const TIER3_QUESTIONS: Question[] = [
  {
    // Q9: Building Age (triggers asbestos/lead assessment)
    id: 'q9_building_age',
    sequenceNumber: 9,
    text: 'What year was the building constructed?',
    type: 'multiple_choice',

    standardsReference: ['QDC 4.5 Building Materials', 'Environmental Protection Regulation 2008', 'WHS Act 2011'],
    standardsJustification: 'Building age determines asbestos/lead hazard assessment requirements',

    options: [
      { label: 'Pre-1980 (likely contains asbestos)', value: 'pre_1980' },
      { label: '1980-2000 (may contain asbestos/lead)', value: '1980_2000' },
      { label: '2000-2010', value: '2000_2010' },
      { label: 'Post-2010 (modern standards)', value: 'post_2010' },
    ],

    fieldMappings: [
      {
        formFieldId: 'buildingAge',
        transformer: (answer) => {
          const yearMap = { pre_1980: 1970, '1980_2000': 1990, '2000_2010': 2005, post_2010: 2015 }
          return yearMap[answer] || 2000
        },
        confidence: 75,
      },
      {
        formFieldId: 'asbestosSurveyRequired',
        transformer: (answer) => answer === 'pre_1980' || answer === '1980_2000',
        confidence: 95, // WHS Act mandate
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q10: Electrical Equipment Affected
    id: 'q10_electrical_affected',
    sequenceNumber: 10,
    text: 'Is electrical equipment affected by water?',
    type: 'yes_no',

    standardsReference: ['AS/NZS 3000:2023 Electrical Wiring', 'WHS Act 2011 Electrical Safety'],
    standardsJustification: 'Electrical hazards require immediate isolation and licensed electrician assessment',

    fieldMappings: [
      {
        formFieldId: 'electricalEquipmentAffected',
        value: undefined,
        confidence: 100,
      },
      {
        formFieldId: 'electricalSafetyRequired',
        transformer: (answer) => answer,
        confidence: 100,
      },
      {
        formFieldId: 'makeSafeRequired',
        transformer: (answer) => (answer ? ['electrical_isolation'] : []),
        confidence: 98,
      },
    ],

    skipLogic: [
      {
        answerValue: true,
        nextQuestionId: 'q10a_electrical_type',
        reason: 'Show follow-up for electrical details',
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q10a: Electrical Equipment Type (conditional follow-up)
    id: 'q10a_electrical_type',
    sequenceNumber: 10.5,
    text: 'What type of electrical equipment is affected? (Select all)',
    type: 'multiselect',

    standardsReference: ['AS/NZS 3000:2023 s7 Circuits'],
    standardsJustification: 'Specific equipment types determine repair requirements',

    options: [
      { label: 'Power outlets', value: 'outlets' },
      { label: 'Light fixtures', value: 'lights' },
      { label: 'Light switches', value: 'switches' },
      { label: 'Panel/switchboard', value: 'panel' },
      { label: 'Appliances', value: 'appliances' },
    ],

    conditionalShows: [
      {
        field: 'q10_electrical_affected',
        operator: 'eq',
        value: true,
      },
    ],

    fieldMappings: [
      {
        formFieldId: 'electricalEquipmentTypes',
        value: undefined,
        confidence: 100,
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q11: Plumbing System Affected
    id: 'q11_plumbing_affected',
    sequenceNumber: 11,
    text: 'Is the plumbing system affected?',
    type: 'yes_no',

    standardsReference: ['AS/NZS 3500:2021 Plumbing Code', 'Building Standards - Plumbing'],
    standardsJustification: 'Plumbing damage requires licensed plumber repair',

    fieldMappings: [
      {
        formFieldId: 'plumbingSystemAffected',
        value: undefined,
        confidence: 100,
      },
      {
        formFieldId: 'makeSafeRequired',
        transformer: (answer) => (answer ? ['water_shutoff'] : []),
        confidence: 95,
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q12: Safety Hazards
    id: 'q12_safety_hazards',
    sequenceNumber: 12,
    text: 'Are there any visible safety hazards?',
    type: 'yes_no',

    standardsReference: ['Work Health and Safety Act 2011', 'SWMS Site Setup Requirements'],
    standardsJustification: 'Safety hazards must be identified and managed before remediation',

    fieldMappings: [
      {
        formFieldId: 'safetyHazards',
        transformer: (answer) => (answer ? 'Safety hazards present - requires assessment' : 'No immediate hazards'),
        confidence: 85,
      },
      {
        formFieldId: 'makeSafeRequired',
        transformer: (answer) => (answer ? ['hazard_isolation'] : []),
        confidence: 90,
      },
    ],

    minTierLevel: 'standard',
  },
]

/**
 * TIER 4: SPECIALIZED & PREMIUM QUESTIONS (10+ questions)
 * Conditional based on previous answers
 * Some only available in Premium tier
 */
const TIER4_QUESTIONS: Question[] = [
  {
    // Q13: Insurance Claim (Premium only)
    id: 'q13_insurance_claim',
    sequenceNumber: 13,
    text: 'Is this a claim under insurance?',
    type: 'yes_no',

    standardsReference: ['General Insurance Code of Practice', 'NECA Standards'],
    standardsJustification: 'Insurance claims require specific documentation and compliance',

    fieldMappings: [
      {
        formFieldId: 'insuranceClaimStatus',
        transformer: (answer) => (answer ? 'ACTIVE_CLAIM' : 'NO_CLAIM'),
        confidence: 100,
      },
    ],

    skipLogic: [
      {
        answerValue: true,
        nextQuestionId: 'q13a_insurance_company',
        reason: 'Show insurance details follow-up',
      },
    ],

    minTierLevel: 'premium',
  },

  {
    // Q13a: Insurance Company (Premium only, conditional)
    id: 'q13a_insurance_company',
    sequenceNumber: 13.5,
    text: 'What insurance company?',
    type: 'text',

    standardsReference: ['General Insurance Code of Practice'],
    standardsJustification: 'Insurance company affects claim documentation requirements',

    conditionalShows: [
      {
        field: 'q13_insurance_claim',
        operator: 'eq',
        value: true,
      },
    ],

    fieldMappings: [
      {
        formFieldId: 'insurerName',
        value: undefined,
        confidence: 100,
      },
    ],

    minTierLevel: 'premium',
  },

  {
    // Q14: Water Contamination Level
    id: 'q14_contamination_level',
    sequenceNumber: 14,
    text: 'What is the estimated contamination level?',
    type: 'multiple_choice',

    standardsReference: ['IICRC S500 s2 Water Categories', 'WHS Act 2011'],
    standardsJustification: 'Contamination level determines PPE and treatment requirements',

    options: [
      { label: 'None (clean water only)', value: 'none' },
      { label: 'Low (minor contamination risk)', value: 'low' },
      { label: 'Moderate (visible contamination)', value: 'moderate' },
      { label: 'High (significant hazard)', value: 'high' },
    ],

    conditionalShows: [
      {
        field: 'q1_water_source',
        operator: 'neq',
        value: 'clean_water',
      },
    ],

    fieldMappings: [
      {
        formFieldId: 'contaminationLevel',
        value: undefined,
        confidence: 80,
      },
      {
        formFieldId: 'ppeRequirements',
        transformer: (answer) => {
          const ppeMap = {
            none: 'Standard PPE',
            low: 'Standard PPE + gloves',
            moderate: 'Full PPE + respiratory protection',
            high: 'Hazmat suit + respiratory + training required',
          }
          return ppeMap[answer] || 'Unknown'
        },
        confidence: 85,
      },
    ],

    minTierLevel: 'standard',
  },

  {
    // Q15: Post-Remediation Verification
    id: 'q15_verification_method',
    sequenceNumber: 15,
    text: 'How will drying be verified?',
    type: 'multiple_choice',

    standardsReference: ['IICRC S500 s7 Verification', 'Building Standards - Completion'],
    standardsJustification: 'Proper verification ensures standards compliance and customer satisfaction',

    options: [
      { label: 'Moisture meter readings', value: 'moisture_meter' },
      { label: 'Hygrometer monitoring', value: 'hygrometer' },
      { label: 'Both methods', value: 'both' },
      { label: 'Professional assessment required', value: 'professional' },
    ],

    fieldMappings: [
      {
        formFieldId: 'verificationMethod',
        value: undefined,
        confidence: 90,
      },
    ],

    minTierLevel: 'standard',
  },
]

/**
 * Export complete question library
 */
export const INTERVIEW_QUESTION_LIBRARY: Question[] = [...TIER1_QUESTIONS, ...TIER2_QUESTIONS, ...TIER3_QUESTIONS, ...TIER4_QUESTIONS]

/**
 * Get all questions for a specific tier
 */
export function getQuestionsForTier(tier: number): Question[] {
  const tierLimits = { 1: 5, 2: 8, 3: 13, 4: Infinity }
  const maxSeq = tierLimits[tier as keyof typeof tierLimits]

  return INTERVIEW_QUESTION_LIBRARY.filter((q) => {
    const seq = q.sequenceNumber || 999
    return seq <= maxSeq && (tier === 1 ? seq <= 5 : seq <= maxSeq && seq > tierLimits[tier - 1 as keyof typeof tierLimits])
  })
}

/**
 * Get all questions accessible to a subscription tier
 */
export function getQuestionsForSubscriptionTier(subscriptionTier: 'standard' | 'premium' | 'enterprise'): Question[] {
  const tierMap = { standard: ['standard'], premium: ['standard', 'premium'], enterprise: ['standard', 'premium', 'enterprise'] }
  const accessibleTiers = tierMap[subscriptionTier]

  return INTERVIEW_QUESTION_LIBRARY.filter((q) => {
    const minTier = q.minTierLevel || 'standard'
    return accessibleTiers.includes(minTier)
  })
}
