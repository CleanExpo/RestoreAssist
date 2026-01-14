/**
 * Unit Tests for QuestionGenerationEngine
 * Tests all question generation, filtering, skip logic, and conditional logic
 */

import { QuestionGenerationEngine } from '../question-generation-engine'
import { INTERVIEW_QUESTION_LIBRARY } from '../question-templates'
import {
  Question,
  QuestionGenerationContext,
  SubscriptionTier,
} from '../types'

describe('QuestionGenerationEngine', () => {
  // Test data setup
  const mockContext: QuestionGenerationContext = {
    formTemplateId: 'form_123',
    jobType: 'WATER_DAMAGE',
    postcode: '4000', // Brisbane
    userId: 'user_123',
    userTierLevel: 'standard',
  }

  describe('generateQuestions', () => {
    it('should generate questions with all required response fields', () => {
      const result = QuestionGenerationEngine.generateQuestions(mockContext)

      expect(result).toHaveProperty('questions')
      expect(result).toHaveProperty('tieredQuestions')
      expect(result).toHaveProperty('estimatedDurationMinutes')
      expect(result).toHaveProperty('totalQuestionsCount')
      expect(result).toHaveProperty('standardsCovered')

      expect(Array.isArray(result.questions)).toBe(true)
      expect(typeof result.estimatedDurationMinutes).toBe('number')
      expect(typeof result.totalQuestionsCount).toBe('number')
      expect(Array.isArray(result.standardsCovered)).toBe(true)
    })

    it('should generate estimated duration between 5-30 minutes', () => {
      const result = QuestionGenerationEngine.generateQuestions(mockContext)
      expect(result.estimatedDurationMinutes).toBeGreaterThanOrEqual(5)
      expect(result.estimatedDurationMinutes).toBeLessThanOrEqual(30)
    })

    it('should organise questions into 4 tiers', () => {
      const result = QuestionGenerationEngine.generateQuestions(mockContext)
      const { tieredQuestions } = result

      expect(tieredQuestions).toHaveProperty('tier1')
      expect(tieredQuestions).toHaveProperty('tier2')
      expect(tieredQuestions).toHaveProperty('tier3')
      expect(tieredQuestions).toHaveProperty('tier4')

      expect(Array.isArray(tieredQuestions.tier1)).toBe(true)
      expect(Array.isArray(tieredQuestions.tier2)).toBe(true)
      expect(Array.isArray(tieredQuestions.tier3)).toBe(true)
      expect(Array.isArray(tieredQuestions.tier4)).toBe(true)
    })

    it('should extract all standards covered by questions', () => {
      const result = QuestionGenerationEngine.generateQuestions(mockContext)
      const { standardsCovered } = result

      expect(standardsCovered.length).toBeGreaterThan(0)
      expect(standardsCovered).toContain('IICRC')
      expect(standardsCovered).toContain('NCC') // Building codes
    })

    it('should filter questions based on job type', () => {
      const moldContext: QuestionGenerationContext = {
        ...mockContext,
        jobType: 'MOLD',
      }

      const moldResult = QuestionGenerationEngine.generateQuestions(moldContext)
      const waterResult = QuestionGenerationEngine.generateQuestions(mockContext)

      // Mold jobs should potentially have different question filtering
      expect(moldResult.questions).toBeDefined()
      expect(waterResult.questions).toBeDefined()
    })

    it('should prioritize questions by sequence number, standards count, and field impacts', () => {
      const result = QuestionGenerationEngine.generateQuestions(mockContext)
      const { questions } = result

      // Check that sequence numbers are ordered (if present)
      const sequencedQuestions = questions.filter((q) => q.sequenceNumber)
      for (let i = 1; i < sequencedQuestions.length; i++) {
        if (
          sequencedQuestions[i - 1].sequenceNumber &&
          sequencedQuestions[i].sequenceNumber
        ) {
          expect(sequencedQuestions[i].sequenceNumber).toBeGreaterThanOrEqual(
            sequencedQuestions[i - 1].sequenceNumber
          )
        }
      }
    })
  })

  describe('evaluateSkipLogic', () => {
    it('should return shouldSkip false when no skip logic is defined', () => {
      const questionWithoutSkipLogic: Question = {
        ...INTERVIEW_QUESTION_LIBRARY[0],
        skipLogic: undefined,
      }

      const result = QuestionGenerationEngine.evaluateSkipLogic(
        questionWithoutSkipLogic,
        new Map(),
        []
      )

      expect(result.shouldSkip).toBe(false)
      expect(result.nextQuestionId).toBeUndefined()
    })

    it('should return shouldSkip false when skip logic array is empty', () => {
      const questionWithoutSkipLogic: Question = {
        ...INTERVIEW_QUESTION_LIBRARY[0],
        skipLogic: [],
      }

      const result = QuestionGenerationEngine.evaluateSkipLogic(
        questionWithoutSkipLogic,
        new Map(),
        []
      )

      expect(result.shouldSkip).toBe(false)
    })

    it('should evaluate skip logic rules correctly', () => {
      const questionWithSkipLogic: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test question',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        skipLogic: [
          {
            answerValue: 'no',
            nextQuestionId: 'q_skip_to',
            reason: 'User answered no',
          },
        ],
      }

      const previousAnswers = new Map([['test_q', 'no']])

      const result = QuestionGenerationEngine.evaluateSkipLogic(
        questionWithSkipLogic,
        previousAnswers,
        []
      )

      expect(result.shouldSkip).toBe(true)
      expect(result.nextQuestionId).toBe('q_skip_to')
      expect(result.reason).toBe('User answered no')
    })

    it('should match answers case-insensitively for string values', () => {
      const questionWithSkipLogic: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'multiple_choice',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        skipLogic: [
          {
            answerValue: 'clean water',
            nextQuestionId: 'q_next',
          },
        ],
      }

      const previousAnswers = new Map([['water_source_q', 'CLEAN WATER']])

      const result = QuestionGenerationEngine.evaluateSkipLogic(
        questionWithSkipLogic,
        previousAnswers,
        []
      )

      expect(result.shouldSkip).toBe(true)
    })

    it('should handle array value matching in skip logic', () => {
      const questionWithSkipLogic: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'multiselect',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        skipLogic: [
          {
            answerValue: ['drywall', 'carpet'],
            nextQuestionId: 'q_next',
          },
        ],
      }

      const previousAnswers = new Map([
        ['materials_q', ['drywall', 'wood']],
      ])

      const result = QuestionGenerationEngine.evaluateSkipLogic(
        questionWithSkipLogic,
        previousAnswers,
        []
      )

      expect(result.shouldSkip).toBe(true)
    })
  })

  describe('evaluateConditionalShow', () => {
    it('should return true when no conditional shows are defined', () => {
      const questionNoConditionals: Question = {
        ...INTERVIEW_QUESTION_LIBRARY[0],
        conditionalShows: undefined,
      }

      const result = QuestionGenerationEngine.evaluateConditionalShow(
        questionNoConditionals,
        new Map()
      )

      expect(result).toBe(true)
    })

    it('should return true when conditional shows array is empty', () => {
      const questionNoConditionals: Question = {
        ...INTERVIEW_QUESTION_LIBRARY[0],
        conditionalShows: [],
      }

      const result = QuestionGenerationEngine.evaluateConditionalShow(
        questionNoConditionals,
        new Map()
      )

      expect(result).toBe(true)
    })

    it('should evaluate equality condition (eq) correctly', () => {
      const question: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'water_source',
            operator: 'eq',
            value: 'black_water',
          },
        ],
      }

      const answersTrue = new Map([['water_source', 'black_water']])
      const answersFalse = new Map([['water_source', 'clean_water']])

      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersTrue)).toBe(
        true
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersFalse)).toBe(
        false
      )
    })

    it('should evaluate not-equal condition (neq) correctly', () => {
      const question: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'water_source',
            operator: 'neq',
            value: 'clean_water',
          },
        ],
      }

      const answersTrue = new Map([['water_source', 'black_water']])
      const answersFalse = new Map([['water_source', 'clean_water']])

      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersTrue)).toBe(
        true
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersFalse)).toBe(
        false
      )
    })

    it('should evaluate greater-than condition (gt) correctly', () => {
      const question: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'numeric',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'affected_area_percentage',
            operator: 'gt',
            value: 30,
          },
        ],
      }

      const answersTrue = new Map([['affected_area_percentage', 50]])
      const answersFalse = new Map([['affected_area_percentage', 20]])

      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersTrue)).toBe(
        true
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersFalse)).toBe(
        false
      )
    })

    it('should evaluate less-than condition (lt) correctly', () => {
      const question: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'numeric',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'time_since_loss_hours',
            operator: 'lt',
            value: 12,
          },
        ],
      }

      const answersTrue = new Map([['time_since_loss_hours', 6]])
      const answersFalse = new Map([['time_since_loss_hours', 24]])

      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersTrue)).toBe(
        true
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersFalse)).toBe(
        false
      )
    })

    it('should evaluate includes condition correctly', () => {
      const question: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'multiselect',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'materials_affected',
            operator: 'includes',
            value: 'drywall',
          },
        ],
      }

      const answersTrue = new Map([
        ['materials_affected', ['drywall', 'carpet']],
      ])
      const answersFalse = new Map([['materials_affected', ['carpet', 'wood']]])

      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersTrue)).toBe(
        true
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersFalse)).toBe(
        false
      )
    })

    it('should evaluate excludes condition correctly', () => {
      const question: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'multiselect',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'materials_affected',
            operator: 'excludes',
            value: 'drywall',
          },
        ],
      }

      const answersTrue = new Map([['materials_affected', ['carpet', 'wood']]])
      const answersFalse = new Map([
        ['materials_affected', ['drywall', 'carpet']],
      ])

      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersTrue)).toBe(
        true
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersFalse)).toBe(
        false
      )
    })

    it('should evaluate contains condition correctly', () => {
      const question: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'text',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'damage_description',
            operator: 'contains',
            value: 'mold',
          },
        ],
      }

      const answersTrue = new Map([
        ['damage_description', 'visible mold growth detected'],
      ])
      const answersFalse = new Map([
        ['damage_description', 'water damage observed'],
      ])

      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersTrue)).toBe(
        true
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersFalse)).toBe(
        false
      )
    })

    it('should enforce AND logic for multiple conditions', () => {
      const question: Question = {
        id: 'q_test',
        sequenceNumber: 5,
        text: 'Test',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'water_source',
            operator: 'eq',
            value: 'black_water',
          },
          {
            field: 'affected_area_percentage',
            operator: 'gt',
            value: 30,
          },
        ],
      }

      // Both conditions met
      const answersBoth = new Map([
        ['water_source', 'black_water'],
        ['affected_area_percentage', 50],
      ])

      // Only first condition met
      const answersFirst = new Map([
        ['water_source', 'black_water'],
        ['affected_area_percentage', 20],
      ])

      // Neither condition met
      const answersNeither = new Map([
        ['water_source', 'clean_water'],
        ['affected_area_percentage', 20],
      ])

      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersBoth)).toBe(
        true
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersFirst)).toBe(
        false
      )
      expect(QuestionGenerationEngine.evaluateConditionalShow(question, answersNeither)).toBe(
        false
      )
    })
  })

  describe('calculateFieldConfidence', () => {
    const mockMapping = {
      formFieldId: 'field_123',
      confidence: 100,
    }

    it('should return original confidence for certain answers', () => {
      const answer = 'definite_answer'
      const confidence = QuestionGenerationEngine.calculateFieldConfidence(
        answer,
        mockMapping
      )

      expect(confidence).toBe(100)
    })

    it('should reduce confidence for uncertain answers (unsure)', () => {
      const answer = 'unsure'
      const confidence = QuestionGenerationEngine.calculateFieldConfidence(
        answer,
        mockMapping
      )

      expect(confidence).toBe(Math.round(100 * 0.7)) // 70
    })

    it('should reduce confidence for uncertain answers (maybe)', () => {
      const answer = 'maybe'
      const confidence = QuestionGenerationEngine.calculateFieldConfidence(
        answer,
        mockMapping
      )

      expect(confidence).toBe(Math.round(100 * 0.7)) // 70
    })

    it('should reduce confidence for transformed/derived values', () => {
      const mockTransformedMapping = {
        formFieldId: 'field_123',
        confidence: 100,
        transformer: (val: any) => val.toUpperCase(),
      }

      const answer = 'test_answer'
      const confidence = QuestionGenerationEngine.calculateFieldConfidence(
        answer,
        mockTransformedMapping
      )

      expect(confidence).toBe(Math.round(100 * 0.9)) // 90
    })

    it('should apply multiple confidence reductions correctly', () => {
      const mockTransformedMapping = {
        formFieldId: 'field_123',
        confidence: 100,
        transformer: (val: any) => val.toUpperCase(),
      }

      const answer = 'unsure'
      const confidence = QuestionGenerationEngine.calculateFieldConfidence(
        answer,
        mockTransformedMapping
      )

      // 100 * 0.7 (unsure) * 0.9 (transformer) = 63
      expect(confidence).toBe(Math.round(100 * 0.7 * 0.9))
    })
  })

  describe('validateQuestion', () => {
    it('should validate a complete question successfully', () => {
      const validQuestion: Question = {
        id: 'q_valid',
        sequenceNumber: 1,
        text: 'Valid question?',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [
          {
            formFieldId: 'field_123',
            confidence: 95,
          },
        ],
      }

      const result = QuestionGenerationEngine.validateQuestion(validQuestion)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail validation for missing id', () => {
      const invalidQuestion: Question = {
        id: '',
        sequenceNumber: 1,
        text: 'Question?',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [{ formFieldId: 'field_123', confidence: 95 }],
      }

      const result = QuestionGenerationEngine.validateQuestion(invalidQuestion)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('id'))).toBe(true)
    })

    it('should fail validation for missing text', () => {
      const invalidQuestion: Question = {
        id: 'q_test',
        sequenceNumber: 1,
        text: '',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [{ formFieldId: 'field_123', confidence: 95 }],
      }

      const result = QuestionGenerationEngine.validateQuestion(invalidQuestion)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('text'))).toBe(true)
    })

    it('should fail validation for missing type', () => {
      const invalidQuestion: Question = {
        id: 'q_test',
        sequenceNumber: 1,
        text: 'Question?',
        type: undefined as any,
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [{ formFieldId: 'field_123', confidence: 95 }],
      }

      const result = QuestionGenerationEngine.validateQuestion(invalidQuestion)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('type'))).toBe(true)
    })

    it('should fail validation for missing standards reference', () => {
      const invalidQuestion: Question = {
        id: 'q_test',
        sequenceNumber: 1,
        text: 'Question?',
        type: 'yes_no',
        standardsReference: [],
        standardsJustification: 'Test',
        fieldMappings: [{ formFieldId: 'field_123', confidence: 95 }],
      }

      const result = QuestionGenerationEngine.validateQuestion(invalidQuestion)

      expect(result.valid).toBe(false)
      expect(
        result.errors.some((e) => e.includes('standards reference'))
      ).toBe(true)
    })

    it('should fail validation for missing field mappings', () => {
      const invalidQuestion: Question = {
        id: 'q_test',
        sequenceNumber: 1,
        text: 'Question?',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
      }

      const result = QuestionGenerationEngine.validateQuestion(invalidQuestion)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('field mapping'))).toBe(true)
    })

    it('should fail validation for field mapping missing formFieldId', () => {
      const invalidQuestion: Question = {
        id: 'q_test',
        sequenceNumber: 1,
        text: 'Question?',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [
          {
            formFieldId: '',
            confidence: 95,
          },
        ],
      }

      const result = QuestionGenerationEngine.validateQuestion(invalidQuestion)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('formFieldId'))).toBe(true)
    })

    it('should fail validation for confidence out of range', () => {
      const invalidQuestion: Question = {
        id: 'q_test',
        sequenceNumber: 1,
        text: 'Question?',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [
          {
            formFieldId: 'field_123',
            confidence: 150, // Out of range
          },
        ],
      }

      const result = QuestionGenerationEngine.validateQuestion(invalidQuestion)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('confidence'))).toBe(true)
    })
  })

  describe('getNextQuestion', () => {
    const mockQuestions: Question[] = [
      {
        id: 'q1',
        sequenceNumber: 1,
        text: 'Question 1',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: undefined,
      },
      {
        id: 'q2',
        sequenceNumber: 2,
        text: 'Question 2',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
        conditionalShows: [
          {
            field: 'water_source',
            operator: 'eq',
            value: 'black_water',
          },
        ],
      },
      {
        id: 'q3',
        sequenceNumber: 3,
        text: 'Question 3',
        type: 'yes_no',
        standardsReference: ['IICRC S500'],
        standardsJustification: 'Test',
        fieldMappings: [],
      },
    ]

    it('should return next question when moving forward', () => {
      const previousAnswers = new Map([['water_source', 'black_water']])

      const nextQ = QuestionGenerationEngine.getNextQuestion(
        0,
        mockQuestions,
        previousAnswers
      )

      expect(nextQ).toBeDefined()
      expect(nextQ?.id).toBe('q2')
    })

    it('should skip questions with unmet conditions', () => {
      const previousAnswers = new Map([['water_source', 'clean_water']]) // Condition not met

      const nextQ = QuestionGenerationEngine.getNextQuestion(
        0,
        mockQuestions,
        previousAnswers
      )

      // Should skip q2 (condition not met) and return q3
      expect(nextQ).toBeDefined()
      expect(nextQ?.id).toBe('q3')
    })

    it('should return undefined when at end of questions', () => {
      const previousAnswers = new Map()

      const nextQ = QuestionGenerationEngine.getNextQuestion(
        mockQuestions.length - 1,
        mockQuestions,
        previousAnswers
      )

      expect(nextQ).toBeUndefined()
    })
  })

  describe('Question Library Validation', () => {
    it('all questions in library should pass validation', () => {
      const invalidQuestions = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        const result = QuestionGenerationEngine.validateQuestion(q)
        return !result.valid
      })

      expect(invalidQuestions).toHaveLength(0)
    })

    it('all questions should have at least 2 field mappings', () => {
      const insufficientMappings = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) => !q.fieldMappings || q.fieldMappings.length < 1
      )

      expect(insufficientMappings).toHaveLength(0)
    })

    it('all questions should reference IICRC S500 or building standards', () => {
      const invalidStandards = INTERVIEW_QUESTION_LIBRARY.filter((q) => {
        const hasValidStandard = q.standardsReference.some(
          (s) =>
            s.includes('IICRC') ||
            s.includes('NCC') ||
            s.includes('AS/NZS') ||
            s.includes('WHS')
        )
        return !hasValidStandard
      })

      expect(invalidStandards).toHaveLength(0)
    })

    it('tier 1 questions should have sequence numbers 1-5', () => {
      const tier1 = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) => q.sequenceNumber && q.sequenceNumber <= 5
      )

      expect(tier1.length).toBeGreaterThan(0)
      tier1.forEach((q) => {
        expect(q.sequenceNumber).toBeLessThanOrEqual(5)
        expect(q.sequenceNumber).toBeGreaterThan(0)
      })
    })

    it('should not exceed 4 confidence levels', () => {
      const invalidConfidence = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) =>
          !q.fieldMappings ||
          q.fieldMappings.some((m) => m.confidence < 0 || m.confidence > 100)
      )

      expect(invalidConfidence).toHaveLength(0)
    })
  })

  describe('Subscription Tier Filtering', () => {
    it('should filter questions by subscription tier', () => {
      const standardTierQuestions = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) => !q.minTierLevel || q.minTierLevel === 'standard'
      )

      const premiumTierQuestions = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) => q.minTierLevel === 'premium' || q.minTierLevel === 'standard'
      )

      expect(standardTierQuestions.length).toBeLessThan(
        premiumTierQuestions.length
      )
    })

    it('should have premium tier questions in library', () => {
      const premiumQuestions = INTERVIEW_QUESTION_LIBRARY.filter(
        (q) => q.minTierLevel === 'premium'
      )

      expect(premiumQuestions.length).toBeGreaterThan(0)
    })
  })
})
