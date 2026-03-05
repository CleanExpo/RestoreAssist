/**
 * Interview System Type Definitions
 * Defines all TypeScript interfaces for the Guided Interview feature
 */

/**
 * Question Types
 */
export type QuestionType = 'yes_no' | 'multiple_choice' | 'text' | 'numeric' | 'measurement' | 'location' | 'multiselect' | 'checkbox'

/**
 * Interview Session Status
 */
export type InterviewStatus = 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'

/**
 * Field Confidence Levels
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * Subscription Tiers
 */
export type SubscriptionTier = 'standard' | 'premium' | 'enterprise'

/**
 * Core Question Interface
 */
export interface Question {
  id: string
  sequenceNumber: number
  text: string
  type: QuestionType
  helperText?: string
  exampleAnswer?: string

  // Standards References
  standardsReference: string[] // e.g., ["IICRC S500 s2", "NCC 2025 s3"]
  standardsJustification: string // Why this question matters

  // Logic & Dependencies
  condition?: string // Skip condition (e.g., "waterSource === 'black_water'")
  triggerFields?: string[] // Which form fields this affects
  skipLogic?: SkipLogicRule[]
  conditionalShows?: ConditionalShow[]

  // Answer Options
  options?: QuestionOption[]

  // Field Mapping
  fieldMappings: FieldMapping[]

  // Minimum tier to show this question
  minTierLevel?: SubscriptionTier
}

/**
 * Skip Logic Rule
 * If user answers with answerValue, jump to nextQuestionId
 */
export interface SkipLogicRule {
  answerValue: any
  nextQuestionId: string
  reason?: string
}

/**
 * Conditional Show Rule
 * Show this question only if certain conditions are met
 */
export interface ConditionalShow {
  field: string // Which field to evaluate
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'includes' | 'excludes' | 'contains'
  value: any
}

/**
 * Question Option
 */
export interface QuestionOption {
  label: string
  value: any
  helperText?: string
  triggersFollowUp?: boolean
  followUpQuestionId?: string
}

/**
 * Field Mapping from Question Answer to Form Field
 */
export interface FieldMapping {
  formFieldId: string
  value?: any // Static value
  transformer?: (answer: any, context: any) => any // Dynamic transformation
  confidence: number // 0-100, higher = more confident
}

/**
 * Question Context for Generation
 */
export interface QuestionGenerationContext {
  formTemplateId: string
  jobType?: string // WATER_DAMAGE, MOLD, FIRE, etc.
  waterCategory?: string // 1, 2, 3
  waterClass?: string // 1, 2, 3, 4
  postcode?: string // For building code detection
  propertyAge?: number // Year built
  userId: string
  userTierLevel: SubscriptionTier
}

/**
 * Interview Session
 */
export interface InterviewSession {
  id: string
  userId: string
  formTemplateId: string
  formSubmissionId?: string
  status: InterviewStatus
  startedAt: Date
  completedAt?: Date
  abandonedAt?: Date

  // Tracking
  totalQuestionsAsked: number
  totalAnswersGiven: number
  estimatedTimeMinutes: number
  actualTimeMinutes?: number

  // Data
  answers: Map<string, any> // questionId → answer
  autoPopulatedFields: FieldPopulation[]
  standardsReferences: StandardsReference[]

  // Equipment & Cost
  equipmentRecommendations: EquipmentRecommendation[]
  estimatedEquipmentCost?: number

  // Metadata
  userTierLevel: SubscriptionTier
  technicianExperience?: 'novice' | 'experienced' | 'expert'
}

/**
 * Interview Answer
 */
export interface InterviewAnswer {
  questionId: string
  answer: any
  answeredAt: Date
  timeSpentSeconds?: number
  populatedFields: FieldPopulation[]
  standardsReference: string[]
}

/**
 * Field Population
 */
export interface FieldPopulation {
  formFieldId: string
  populatedValue: any
  confidence: number // 0-100
  standardsReference?: string
  source: 'direct' | 'derived' | 'calculated'
  techniciansNote?: string
  isOverrideable: boolean
  originalValue?: any
}

/**
 * Standards Reference
 */
export interface StandardsReference {
  code: string // "IICRC S500", "NCC 2025", etc.
  section: string // "s2", "s3.2", etc.
  fullReference: string // "IICRC S500 Section 2"
  questionsUsing: string[] // Array of question IDs
  fieldsAffected: string[] // Array of form field IDs
  confidence: number // 0-100
}

/**
 * Equipment Recommendation
 */
export interface EquipmentRecommendation {
  equipmentId: string
  equipmentType: 'dehumidifier' | 'air_mover' | 'air_scrubber' | 'heater' | 'monitor'
  quantity: number
  reasoning: string // "1 LGR per 1250 cu-ft per IICRC S500"

  // Specification
  specification?: {
    type?: string // "LGR" vs "Conventional"
    capacity?: number
    wattage?: number
  }

  // Cost
  dailyRentalCost: number
  estimatedDaysNeeded: number
  totalEstimatedCost: number

  // Standards Backing
  standardsReference: string

  // Tagging (Premium Feature)
  equipmentTags?: {
    materialType?: string[]
    waterCategory?: string
    waterClass?: string
    environmentalCondition?: string
    optimalFor?: string[]
  }
}

/**
 * Interview Response for Database
 */
export interface InterviewResponseRecord {
  id: string
  interviewSessionId: string
  questionId: string
  questionText: string
  answerValue?: any
  answerType: QuestionType
  answeredAt: Date
  timeSpentSeconds?: number
  populatedFields?: FieldPopulation[]
  standardsReference?: string[]
}

/**
 * Grouped Questions by Tier
 */
export interface TieredQuestions {
  tier1: Question[] // Essential (5 questions)
  tier2: Question[] // Environmental (3 questions)
  tier3: Question[] // Building Code (3-5 questions)
  tier4: Question[] // Specialized (5-10 questions, conditional)
}

/**
 * Interview Summary
 */
export interface InterviewSummary {
  sessionId: string
  totalQuestionsAsked: number
  totalAnswersGiven: number
  completionPercentage: number
  estimatedTimeMinutes: number
  actualTimeMinutes?: number
  autoPopulatedFieldsCount: number
  averageConfidence: number
  standardsApplied: StandardsReference[]
  equipmentRecommendationsCount: number
  estimatedTotalCost: number
  gaps?: string[] // Missing fields or incomplete answers
}

/**
 * Answer Mapping Result
 */
export interface AnswerMappingResult {
  questionId: string
  answer: any
  fieldPopulations: FieldPopulation[]
  standardsApplied: StandardsReference[]
  nextQuestionId?: string
  shouldSkip: boolean
  skipReason?: string
}

/**
 * Subscription Tier Definition
 */
export interface SubscriptionTierDefinition {
  id: string
  tierName: SubscriptionTier
  monthlyPrice: number
  features: SubscriptionFeatures
  standardsCoverage: string[] // ["iicrc", "building", "electrical", "whs"]
  maxFormsPerMonth?: number
  maxQuestionsPerInterview?: number
}

/**
 * Subscription Features
 */
export interface SubscriptionFeatures {
  guidedInterview: boolean
  autoPopulation: boolean
  equipmentRecommendations: boolean
  equipmentTagging: boolean
  qualityCheck: boolean
  apiAccess: boolean
  customQuestions?: boolean
  benchmarking?: boolean
}

/**
 * Question Generation Request
 */
export interface GenerateQuestionsRequest {
  formTemplateId: string
  jobType?: string
  postcode?: string
  context?: QuestionGenerationContext
}

/**
 * Question Generation Response
 */
export interface GenerateQuestionsResponse {
  questions: Question[]
  tieredQuestions: TieredQuestions
  estimatedDurationMinutes: number
  totalQuestionsCount: number
  standardsCovered: string[]
}

/**
 * Interview State (for flow management)
 */
export interface InterviewState {
  sessionId: string
  userId: string
  formTemplateId: string
  status: InterviewStatus
  startedAt: Date
  completedAt?: Date
  totalQuestionsAsked: number
  totalAnswersGiven: number
  estimatedTimeMinutes: number
  actualTimeMinutes?: number
  answers: { [questionId: string]: any }
  autoPopulatedFields: { [fieldId: string]: { value: any; confidence: number } }
  standardsReferences: string[]
}
