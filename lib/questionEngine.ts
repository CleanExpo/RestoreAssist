/**
 * RestoreAssist Question Engine
 * Tiered question system for LLM report generation
 *
 * Tier 1 (RED): Critical mandatory questions
 * Tier 2 (AMBER): Enhancement optional questions
 * Tier 3 (GREEN): Optimisation optional questions
 */

export type QuestionTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_choice_multi_select'
  | 'freeform_with_guidance'
  | 'yes_no';

export interface QuestionOption {
  label: string;
  value: string;
  description?: string;
  /** If selected, triggers special handling */
  trigger?: 'STOP_WORK' | 'REQUIRES_SPECIALIST' | 'HIGH_PRIORITY';
}

export interface FollowUpCondition {
  /** Condition expression (e.g., "asbestos_suspected" or "construction_year < 1990") */
  if: string;
  /** Question IDs to show if condition is true */
  then: string[];
}

export interface Question {
  id: string;
  tier: QuestionTier;
  category: string;
  question: string;
  type: QuestionType;
  required: boolean;
  options?: QuestionOption[];
  guidance?: string;
  placeholder?: string;
  /** Effect description if answered */
  trigger_effect?: string;
  /** Conditional follow-up questions */
  follow_up_conditions?: FollowUpCondition[];
  /** Validation rules */
  validation?: {
    min_length?: number;
    max_length?: number;
    pattern?: string;
    min_selections?: number;
    max_selections?: number;
  };
}

export interface QuestionResponse {
  question_id: string;
  answer: string | string[];
  metadata?: {
    skipped?: boolean;
    timestamp?: string;
    confidence?: number;
  };
}

export interface EvaluationResult {
  is_valid: boolean;
  triggers: Array<'STOP_WORK' | 'REQUIRES_SPECIALIST' | 'HIGH_PRIORITY'>;
  follow_up_questions: string[];
  warnings: string[];
  errors: string[];
}

// =============================================================================
// TIER 1: CRITICAL MANDATORY QUESTIONS (RED)
// =============================================================================

const TIER_1_QUESTIONS: Question[] = [
  {
    id: 'T1_Q1',
    tier: 'TIER_1',
    category: 'Property Classification',
    question: 'What type of property is affected?',
    type: 'multiple_choice',
    required: true,
    options: [
      { label: 'Residential House', value: 'residential_house' },
      { label: 'Apartment/Unit', value: 'apartment' },
      { label: 'Commercial Office', value: 'commercial_office' },
      { label: 'Retail Store', value: 'retail' },
      { label: 'Industrial Facility', value: 'industrial' },
      { label: 'Aged Care Facility', value: 'aged_care', trigger: 'HIGH_PRIORITY' },
      { label: 'Healthcare Facility', value: 'healthcare', trigger: 'HIGH_PRIORITY' },
      { label: 'Educational Facility', value: 'educational' },
      { label: 'Other', value: 'other' },
    ],
    trigger_effect: 'Determines scope classification and required certifications',
  },
  {
    id: 'T1_Q2',
    tier: 'TIER_1',
    category: 'Property Classification',
    question: 'What year was the property constructed?',
    type: 'freeform_with_guidance',
    required: true,
    guidance: 'Properties built before 1990 may contain asbestos. Properties built before 1970 may have lead paint.',
    placeholder: 'e.g., 1985 or "Unknown"',
    trigger_effect: 'Pre-1990: Asbestos risk flagged. Pre-1970: Lead paint risk flagged.',
    follow_up_conditions: [
      {
        if: 'construction_year < 1990',
        then: ['T2_Q7_ASBESTOS_FOLLOWUP'],
      },
    ],
    validation: {
      pattern: '^(\\d{4}|unknown|not sure)$',
      min_length: 4,
    },
  },
  {
    id: 'T1_Q3',
    tier: 'TIER_1',
    category: 'Water Classification',
    question: 'What is the source of the water damage?',
    type: 'multiple_choice',
    required: true,
    options: [
      {
        label: 'Clean Water (Category 1)',
        value: 'cat1_clean',
        description: 'Supply line, rain, condensation',
      },
      {
        label: 'Grey Water (Category 2)',
        value: 'cat2_grey',
        description: 'Washing machine, dishwasher, toilet overflow (urine only)',
        trigger: 'REQUIRES_SPECIALIST',
      },
      {
        label: 'Black Water (Category 3)',
        value: 'cat3_black',
        description: 'Sewage, flooding, standing water >72hrs',
        trigger: 'STOP_WORK',
      },
      {
        label: 'Unknown',
        value: 'unknown',
        trigger: 'REQUIRES_SPECIALIST',
      },
    ],
    trigger_effect: 'Category 2/3: PPE requirements escalate. Category 3: Stop work until specialist clearance.',
  },
  {
    id: 'T1_Q4',
    tier: 'TIER_1',
    category: 'Occupancy & Safety',
    question: 'Is the property currently occupied? If yes, who by?',
    type: 'multiple_choice_multi_select',
    required: true,
    options: [
      { label: 'Unoccupied', value: 'unoccupied' },
      { label: 'Residents (adults only)', value: 'adults' },
      { label: 'Children under 12', value: 'children', trigger: 'HIGH_PRIORITY' },
      { label: 'Elderly/vulnerable persons', value: 'elderly', trigger: 'HIGH_PRIORITY' },
      { label: 'Persons with respiratory conditions', value: 'respiratory', trigger: 'HIGH_PRIORITY' },
      { label: 'Pets/animals', value: 'pets' },
      { label: 'Business operations ongoing', value: 'business' },
    ],
    guidance: 'Select all that apply. Vulnerable persons require expedited drying and mould prevention.',
    trigger_effect: 'Vulnerable occupants: Prioritise rapid drying, mould prevention, air quality monitoring.',
    validation: {
      min_selections: 1,
    },
  },
  {
    id: 'T1_Q5',
    tier: 'TIER_1',
    category: 'Scope Definition',
    question: 'Which rooms/areas are affected by water damage?',
    type: 'multiple_choice_multi_select',
    required: true,
    options: [
      { label: 'Kitchen', value: 'kitchen' },
      { label: 'Bathroom(s)', value: 'bathroom' },
      { label: 'Laundry', value: 'laundry' },
      { label: 'Living Room', value: 'living_room' },
      { label: 'Bedroom(s)', value: 'bedroom' },
      { label: 'Hallway/Corridor', value: 'hallway' },
      { label: 'Basement/Cellar', value: 'basement', trigger: 'HIGH_PRIORITY' },
      { label: 'Roof Space/Ceiling Cavity', value: 'roof_space' },
      { label: 'External Walls', value: 'external_walls' },
      { label: 'Garage', value: 'garage' },
      { label: 'Commercial Space', value: 'commercial_space' },
      { label: 'Other (specify in notes)', value: 'other' },
    ],
    guidance: 'Select all affected areas. Basement flooding requires sump pump assessment.',
    trigger_effect: 'Multiple areas: Extended drying timeline. Basement: Structural inspection required.',
    validation: {
      min_selections: 1,
    },
  },
  {
    id: 'T1_Q6',
    tier: 'TIER_1',
    category: 'Materials Assessment',
    question: 'What materials are visibly affected by water?',
    type: 'multiple_choice_multi_select',
    required: true,
    options: [
      { label: 'Carpet (synthetic)', value: 'carpet_synthetic' },
      { label: 'Carpet (wool/natural)', value: 'carpet_natural', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Underlay (foam/rubber)', value: 'underlay' },
      { label: 'Timber Flooring (solid)', value: 'timber_solid' },
      { label: 'Timber Flooring (engineered)', value: 'timber_engineered' },
      { label: 'Laminate Flooring', value: 'laminate' },
      { label: 'Particle Board/Yellow Tongue Subfloor', value: 'yellow_tongue', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Plasterboard/Drywall', value: 'plasterboard' },
      { label: 'Insulation', value: 'insulation', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Ceiling Tiles', value: 'ceiling_tiles' },
      { label: 'Concrete Slab', value: 'concrete' },
      { label: 'Tiles (ceramic/porcelain)', value: 'tiles' },
      { label: 'Wallpaper', value: 'wallpaper' },
      { label: 'Furniture/Contents', value: 'furniture' },
    ],
    guidance: 'Select all materials showing visible water damage, staining, or swelling.',
    trigger_effect: 'Yellow tongue/particle board: High risk of swelling/delamination. Natural materials: Special drying protocols.',
    validation: {
      min_selections: 1,
    },
  },
  {
    id: 'T1_Q7',
    tier: 'TIER_1',
    category: 'Hazard Identification',
    question: 'Are any of the following hazards present or suspected?',
    type: 'multiple_choice_multi_select',
    required: true,
    options: [
      { label: 'None observed', value: 'none' },
      {
        label: 'Asbestos (confirmed or suspected)',
        value: 'asbestos',
        trigger: 'STOP_WORK',
        description: 'Fibrous cement, textured ceiling, vinyl floor tiles',
      },
      {
        label: 'Visible Mould Growth',
        value: 'mould',
        trigger: 'REQUIRES_SPECIALIST',
        description: 'Black, green, or white fuzzy growth',
      },
      {
        label: 'Electrical Hazards',
        value: 'electrical',
        trigger: 'STOP_WORK',
        description: 'Exposed wiring, active power points in wet areas',
      },
      {
        label: 'Structural Damage',
        value: 'structural',
        trigger: 'STOP_WORK',
        description: 'Sagging ceilings, cracked beams, unstable floors',
      },
      {
        label: 'Sewage/Biological Contamination',
        value: 'sewage',
        trigger: 'STOP_WORK',
        description: 'Faecal matter, decomposing organic material',
      },
      {
        label: 'Chemical Spills',
        value: 'chemicals',
        trigger: 'STOP_WORK',
      },
      {
        label: 'Lead Paint (pre-1970 property)',
        value: 'lead_paint',
        trigger: 'REQUIRES_SPECIALIST',
      },
    ],
    guidance: 'CRITICAL: Select ALL hazards observed. Some hazards require immediate work stoppage.',
    trigger_effect: 'STOP WORK hazards: Site evacuation, specialist certification required before proceeding.',
    validation: {
      min_selections: 1,
    },
  },
  {
    id: 'T1_Q8',
    tier: 'TIER_1',
    category: 'Timeline Assessment',
    question: 'How long has the affected area been exposed to water?',
    type: 'multiple_choice',
    required: true,
    options: [
      { label: 'Less than 24 hours', value: 'under_24h' },
      { label: '24-48 hours', value: '24_48h' },
      { label: '48-72 hours', value: '48_72h', trigger: 'HIGH_PRIORITY' },
      { label: 'More than 72 hours', value: 'over_72h', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Unknown', value: 'unknown', trigger: 'REQUIRES_SPECIALIST' },
    ],
    trigger_effect: '>72 hours: High mould risk. Category 1 water may degrade to Category 2. Expedited response required.',
    follow_up_conditions: [
      {
        if: 'duration > 72h',
        then: ['T2_Q8_MOULD_INSPECTION'],
      },
    ],
  },
];

// =============================================================================
// TIER 2: ENHANCEMENT OPTIONAL QUESTIONS (AMBER)
// =============================================================================

const TIER_2_QUESTIONS: Question[] = [
  {
    id: 'T2_Q1',
    tier: 'TIER_2',
    category: 'Technical Assessment',
    question: 'Have moisture readings been taken? If yes, what are the peak readings?',
    type: 'freeform_with_guidance',
    required: false,
    guidance: 'Provide readings in % moisture content or relative humidity. E.g., "Carpet pad: 85%, Subfloor: 42%"',
    placeholder: 'e.g., "Carpet: 65% MC, Drywall: 28% MC" or "Not yet measured"',
    trigger_effect: 'High readings (>40% in wood, >20% in drywall) indicate extended drying required.',
    validation: {
      max_length: 500,
    },
  },
  {
    id: 'T2_Q2',
    tier: 'TIER_2',
    category: 'Technical Assessment',
    question: 'Has water migrated to adjacent rooms or floors?',
    type: 'yes_no',
    required: false,
    guidance: 'Check for water staining, dampness, or odour in rooms bordering the affected area.',
    trigger_effect: 'Migration detected: Expands scope. Requires containment barriers and additional drying equipment.',
  },
  {
    id: 'T2_Q3',
    tier: 'TIER_2',
    category: 'Equipment Deployed',
    question: 'What restoration equipment has already been deployed (if any)?',
    type: 'multiple_choice_multi_select',
    required: false,
    options: [
      { label: 'None yet', value: 'none' },
      { label: 'Air Movers/Fans', value: 'air_movers' },
      { label: 'Dehumidifiers (refrigerant)', value: 'dehumidifier_refrigerant' },
      { label: 'Dehumidifiers (desiccant)', value: 'dehumidifier_desiccant' },
      { label: 'Air Scrubbers/HEPA Filters', value: 'air_scrubbers' },
      { label: 'Thermal Imaging Camera', value: 'thermal_camera' },
      { label: 'Moisture Meters', value: 'moisture_meters' },
      { label: 'Extraction Equipment (water removal)', value: 'extraction' },
      { label: 'Containment Barriers', value: 'containment' },
    ],
    guidance: 'Select all equipment currently on-site.',
    trigger_effect: 'Equipment in use: Update drying schedule. No equipment: Immediate deployment recommended.',
    validation: {
      min_selections: 1,
    },
  },
  {
    id: 'T2_Q4',
    tier: 'TIER_2',
    category: 'Contents Assessment',
    question: 'Are there affected contents (furniture, electronics, documents) requiring pack-out?',
    type: 'yes_no',
    required: false,
    guidance: 'Pack-out is removal and off-site storage of contents during restoration.',
    trigger_effect: 'Pack-out required: Add inventory checklist, storage costs, and logistics timeline.',
  },
  {
    id: 'T2_Q5',
    tier: 'TIER_2',
    category: 'Structural Concerns',
    question: 'Are there any structural concerns beyond water damage?',
    type: 'multiple_choice_multi_select',
    required: false,
    options: [
      { label: 'None observed', value: 'none' },
      { label: 'Cracked foundation', value: 'foundation_cracks', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Sagging/bowing walls', value: 'wall_sagging', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Ceiling collapse risk', value: 'ceiling_risk', trigger: 'STOP_WORK' },
      { label: 'Compromised load-bearing elements', value: 'load_bearing', trigger: 'STOP_WORK' },
      { label: 'Pest infestation (termites, rodents)', value: 'pest_infestation' },
      { label: 'Pre-existing water damage', value: 'pre_existing' },
    ],
    guidance: 'Structural issues may require engineer certification before work proceeds.',
    trigger_effect: 'Structural concerns: Engineer inspection required. Update scope and timeline.',
    validation: {
      min_selections: 1,
    },
  },
  {
    id: 'T2_Q6',
    tier: 'TIER_2',
    category: 'Building Services',
    question: 'Are any building services affected or requiring isolation?',
    type: 'multiple_choice_multi_select',
    required: false,
    options: [
      { label: 'None affected', value: 'none' },
      { label: 'Electrical systems', value: 'electrical', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Plumbing/water supply', value: 'plumbing' },
      { label: 'HVAC/Air conditioning', value: 'hvac' },
      { label: 'Gas lines', value: 'gas', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Sewage/drainage', value: 'sewage', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Fire suppression systems', value: 'fire_suppression', trigger: 'REQUIRES_SPECIALIST' },
      { label: 'Security systems', value: 'security' },
    ],
    guidance: 'Affected services must be isolated and tested by licensed professionals.',
    trigger_effect: 'Service isolation: Requires specialist certification before reconnection.',
    validation: {
      min_selections: 1,
    },
  },
  {
    id: 'T2_Q7',
    tier: 'TIER_2',
    category: 'Insurance & Documentation',
    question: 'Has an insurance claim been lodged? If yes, what is the claim number?',
    type: 'freeform_with_guidance',
    required: false,
    guidance: 'Provide insurer name and claim reference if available.',
    placeholder: 'e.g., "NRMA Claim #123456789" or "Not yet lodged"',
    trigger_effect: 'Insurance claim: Coordinate with loss adjuster. May require additional documentation.',
    validation: {
      max_length: 200,
    },
  },
];

// =============================================================================
// TIER 3: OPTIMISATION OPTIONAL QUESTIONS (GREEN)
// =============================================================================

const TIER_3_QUESTIONS: Question[] = [
  {
    id: 'T3_Q1',
    tier: 'TIER_3',
    category: 'Project Timeline',
    question: 'Is there a required completion deadline?',
    type: 'freeform_with_guidance',
    required: false,
    guidance: 'E.g., property settlement date, event date, tenant move-in.',
    placeholder: 'e.g., "Must complete by 15 March 2025" or "No fixed deadline"',
    trigger_effect: 'Tight deadline: May require accelerated drying (heat drying, 24hr monitoring).',
    validation: {
      max_length: 200,
    },
  },
  {
    id: 'T3_Q2',
    tier: 'TIER_3',
    category: 'Drying Preferences',
    question: 'Are there any preferences or constraints for drying methods?',
    type: 'multiple_choice_multi_select',
    required: false,
    options: [
      { label: 'No constraints', value: 'none' },
      { label: 'Noise restrictions (residential)', value: 'noise_restrictions' },
      { label: 'After-hours access only', value: 'after_hours' },
      { label: 'Avoid heat drying (sensitive materials)', value: 'no_heat' },
      { label: 'Must maintain business operations', value: 'maintain_operations' },
      { label: 'Power supply limitations', value: 'power_limited' },
      { label: 'Preferred natural ventilation', value: 'natural_ventilation' },
    ],
    guidance: 'Constraints may extend drying timeline or require alternative methods.',
    trigger_effect: 'Constraints: Adjust equipment selection and drying schedule.',
    validation: {
      min_selections: 1,
    },
  },
  {
    id: 'T3_Q3',
    tier: 'TIER_3',
    category: 'Treatment Preferences',
    question: 'Are chemical treatments (antimicrobial, odour neutralisation) required or preferred?',
    type: 'yes_no',
    required: false,
    guidance: 'Chemical treatments are recommended for Category 2/3 water and mould prevention.',
    trigger_effect: 'Chemical treatment: Add material costs and application timeline. May require occupant vacating.',
  },
  {
    id: 'T3_Q4',
    tier: 'TIER_3',
    category: 'Measurements',
    question: 'If known, what is the total floor area affected (in square metres)?',
    type: 'freeform_with_guidance',
    required: false,
    guidance: 'Approximate measurement acceptable. Helps estimate equipment and labour requirements.',
    placeholder: 'e.g., "Approximately 40m²" or "Unknown - will measure on-site"',
    trigger_effect: 'Large area (>100m²): Multiple equipment sets required. Extended drying time.',
    validation: {
      pattern: '^\\d+(\\.\\d+)?\\s*(m²|m2|sqm|square metres)?$',
    },
  },
  {
    id: 'T3_Q5',
    tier: 'TIER_3',
    category: 'Advanced Drying Assessment',
    question: 'Is Class 4 specialty drying required (low-permeance materials like hardwood, stone)?',
    type: 'yes_no',
    required: false,
    guidance: 'Class 4 involves bound water in dense materials. Requires advanced drying systems and extended timeline.',
    trigger_effect: 'Class 4 drying: Desiccant dehumidifiers, heat injection, extended monitoring (7-14 days).',
  },
];

// =============================================================================
// CONDITIONAL FOLLOW-UP QUESTIONS
// =============================================================================

const CONDITIONAL_QUESTIONS: Question[] = [
  {
    id: 'T2_Q7_ASBESTOS_FOLLOWUP',
    tier: 'TIER_2',
    category: 'Asbestos Management',
    question: 'Has an asbestos inspection been conducted by a licensed assessor?',
    type: 'yes_no',
    required: false,
    guidance: 'Required for pre-1990 properties before disturbing materials.',
    trigger_effect: 'No inspection: Work must stop until clearance certificate obtained.',
  },
  {
    id: 'T2_Q8_MOULD_INSPECTION',
    tier: 'TIER_2',
    category: 'Mould Assessment',
    question: 'Is there visible mould growth (>72 hours water exposure)?',
    type: 'yes_no',
    required: false,
    guidance: 'Water damage >72 hours creates high mould risk. Visual inspection required.',
    trigger_effect: 'Mould present: Containment required. Air quality testing recommended.',
  },
];

// =============================================================================
// QUESTION REGISTRY
// =============================================================================

export const ALL_QUESTIONS: Question[] = [
  ...TIER_1_QUESTIONS,
  ...TIER_2_QUESTIONS,
  ...TIER_3_QUESTIONS,
  ...CONDITIONAL_QUESTIONS,
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get all questions for a specific tier
 */
export function getQuestionsForTier(tier: QuestionTier): Question[] {
  return ALL_QUESTIONS.filter(q => q.tier === tier);
}

/**
 * Get a question by ID
 */
export function getQuestionById(questionId: string): Question | undefined {
  return ALL_QUESTIONS.find(q => q.id === questionId);
}

/**
 * Get all mandatory (Tier 1) questions
 */
export function getMandatoryQuestions(): Question[] {
  return TIER_1_QUESTIONS;
}

/**
 * Get all optional questions (Tier 2 + Tier 3)
 */
export function getOptionalQuestions(): Question[] {
  return [...TIER_2_QUESTIONS, ...TIER_3_QUESTIONS];
}

/**
 * Validate a response against question rules
 */
export function validateResponse(
  question: Question,
  answer: string | string[]
): { is_valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (question.required) {
    if (!answer || (Array.isArray(answer) && answer.length === 0)) {
      errors.push(`Question ${question.id} is mandatory and must be answered`);
    }
  }

  // Check string length validation
  if (typeof answer === 'string' && question.validation) {
    if (question.validation.min_length && answer.length < question.validation.min_length) {
      errors.push(`Answer must be at least ${question.validation.min_length} characters`);
    }
    if (question.validation.max_length && answer.length > question.validation.max_length) {
      errors.push(`Answer must not exceed ${question.validation.max_length} characters`);
    }
    if (question.validation.pattern && !new RegExp(question.validation.pattern, 'i').test(answer)) {
      errors.push(`Answer does not match required format`);
    }
  }

  // Check multi-select validation
  if (Array.isArray(answer) && question.validation) {
    if (question.validation.min_selections && answer.length < question.validation.min_selections) {
      errors.push(`Must select at least ${question.validation.min_selections} option(s)`);
    }
    if (question.validation.max_selections && answer.length > question.validation.max_selections) {
      errors.push(`Cannot select more than ${question.validation.max_selections} option(s)`);
    }
  }

  // Check valid option values for multiple choice
  if (question.type.includes('multiple_choice') && question.options) {
    const validValues = question.options.map(opt => opt.value);
    const answers = Array.isArray(answer) ? answer : [answer];

    const invalidValues = answers.filter(val => !validValues.includes(val));
    if (invalidValues.length > 0) {
      errors.push(`Invalid option(s): ${invalidValues.join(', ')}`);
    }
  }

  return {
    is_valid: errors.length === 0,
    errors,
  };
}

/**
 * Evaluate a response and determine triggers, warnings, follow-ups
 */
export function evaluateResponse(
  questionId: string,
  answer: string | string[]
): EvaluationResult {
  const question = getQuestionById(questionId);

  if (!question) {
    return {
      is_valid: false,
      triggers: [],
      follow_up_questions: [],
      warnings: [],
      errors: [`Question ${questionId} not found`],
    };
  }

  const validation = validateResponse(question, answer);

  if (!validation.is_valid) {
    return {
      is_valid: false,
      triggers: [],
      follow_up_questions: [],
      warnings: [],
      errors: validation.errors,
    };
  }

  const triggers: Array<'STOP_WORK' | 'REQUIRES_SPECIALIST' | 'HIGH_PRIORITY'> = [];
  const warnings: string[] = [];
  const follow_up_questions: string[] = [];

  // Check for triggers from selected options
  if (question.options) {
    const answers = Array.isArray(answer) ? answer : [answer];

    answers.forEach(ans => {
      const option = question.options?.find(opt => opt.value === ans);
      if (option?.trigger) {
        triggers.push(option.trigger);

        if (option.trigger === 'STOP_WORK') {
          warnings.push(`CRITICAL: ${option.label} requires immediate work stoppage and specialist clearance`);
        } else if (option.trigger === 'REQUIRES_SPECIALIST') {
          warnings.push(`${option.label} requires specialist assessment before proceeding`);
        } else if (option.trigger === 'HIGH_PRIORITY') {
          warnings.push(`${option.label} flagged as high priority - expedited response required`);
        }
      }
    });
  }

  // Check for conditional follow-up questions
  if (question.follow_up_conditions) {
    question.follow_up_conditions.forEach(condition => {
      const shouldTrigger = evaluateCondition(condition.if, questionId, answer);
      if (shouldTrigger) {
        follow_up_questions.push(...condition.then);
      }
    });
  }

  return {
    is_valid: true,
    triggers: Array.from(new Set(triggers)), // Remove duplicates
    follow_up_questions: Array.from(new Set(follow_up_questions)),
    warnings,
    errors: [],
  };
}

/**
 * Evaluate a conditional expression
 * Supports: construction_year < 1990, duration > 72h, asbestos_suspected
 */
function evaluateCondition(
  condition: string,
  questionId: string,
  answer: string | string[]
): boolean {
  // Simple condition evaluation
  // For MVP, support basic patterns

  // Pattern: "construction_year < 1990"
  if (condition.includes('construction_year') && questionId === 'T1_Q2') {
    const yearMatch = typeof answer === 'string' ? answer.match(/(\d{4})/) : null;
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (condition.includes('<')) {
        const threshold = parseInt(condition.split('<')[1].trim());
        return year < threshold;
      }
    }
  }

  // Pattern: "duration > 72h"
  if (condition.includes('duration') && questionId === 'T1_Q8') {
    const ans = typeof answer === 'string' ? answer : '';
    return ans === 'over_72h' || ans === 'unknown';
  }

  // Pattern: "asbestos_suspected"
  if (condition.includes('asbestos') && questionId === 'T1_Q7') {
    const answers = Array.isArray(answer) ? answer : [answer];
    return answers.includes('asbestos');
  }

  return false;
}

/**
 * Generate all follow-up questions based on multiple responses
 */
export function generateFollowUps(responses: QuestionResponse[]): string[] {
  const allFollowUps: string[] = [];

  responses.forEach(response => {
    const evaluation = evaluateResponse(response.question_id, response.answer);
    allFollowUps.push(...evaluation.follow_up_questions);
  });

  return Array.from(new Set(allFollowUps)); // Remove duplicates
}

/**
 * Get all triggers across multiple responses
 */
export function getAllTriggers(
  responses: QuestionResponse[]
): Array<'STOP_WORK' | 'REQUIRES_SPECIALIST' | 'HIGH_PRIORITY'> {
  const allTriggers: Array<'STOP_WORK' | 'REQUIRES_SPECIALIST' | 'HIGH_PRIORITY'> = [];

  responses.forEach(response => {
    const evaluation = evaluateResponse(response.question_id, response.answer);
    allTriggers.push(...evaluation.triggers);
  });

  return Array.from(new Set(allTriggers));
}

/**
 * Check if all mandatory questions have been answered
 */
export function isMandatoryComplete(responses: QuestionResponse[]): boolean {
  const mandatoryIds = TIER_1_QUESTIONS.map(q => q.id);
  const answeredIds = responses
    .filter(r => !r.metadata?.skipped)
    .map(r => r.question_id);

  return mandatoryIds.every(id => answeredIds.includes(id));
}

/**
 * Get completion percentage
 */
export function getCompletionStats(responses: QuestionResponse[]): {
  tier1_complete: boolean;
  tier1_percentage: number;
  tier2_percentage: number;
  tier3_percentage: number;
  overall_percentage: number;
  total_questions: number;
  answered_questions: number;
} {
  const answeredIds = responses
    .filter(r => !r.metadata?.skipped)
    .map(r => r.question_id);

  const tier1Count = TIER_1_QUESTIONS.length;
  const tier2Count = TIER_2_QUESTIONS.length;
  const tier3Count = TIER_3_QUESTIONS.length;
  const totalCount = tier1Count + tier2Count + tier3Count;

  const tier1Answered = TIER_1_QUESTIONS.filter(q => answeredIds.includes(q.id)).length;
  const tier2Answered = TIER_2_QUESTIONS.filter(q => answeredIds.includes(q.id)).length;
  const tier3Answered = TIER_3_QUESTIONS.filter(q => answeredIds.includes(q.id)).length;

  return {
    tier1_complete: tier1Answered === tier1Count,
    tier1_percentage: (tier1Answered / tier1Count) * 100,
    tier2_percentage: tier2Count > 0 ? (tier2Answered / tier2Count) * 100 : 0,
    tier3_percentage: tier3Count > 0 ? (tier3Answered / tier3Count) * 100 : 0,
    overall_percentage: ((tier1Answered + tier2Answered + tier3Answered) / totalCount) * 100,
    total_questions: totalCount,
    answered_questions: tier1Answered + tier2Answered + tier3Answered,
  };
}

/**
 * Export all questions as JSON for frontend consumption
 */
export function exportQuestionsJSON(): string {
  return JSON.stringify(
    {
      tier_1: TIER_1_QUESTIONS,
      tier_2: TIER_2_QUESTIONS,
      tier_3: TIER_3_QUESTIONS,
      conditional: CONDITIONAL_QUESTIONS,
      metadata: {
        total_questions: ALL_QUESTIONS.length,
        mandatory_questions: TIER_1_QUESTIONS.length,
        optional_questions: TIER_2_QUESTIONS.length + TIER_3_QUESTIONS.length,
        version: '1.0.0',
        last_updated: new Date().toISOString(),
      },
    },
    null,
    2
  );
}
