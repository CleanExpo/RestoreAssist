/**
 * Question Generation Engine
 * Generates intelligent questions for guided interview based on form schema and standards data
 */

import {
  Question,
  TieredQuestions,
  FieldMapping,
  QuestionGenerationContext,
  GenerateQuestionsResponse,
  QuestionOption,
  SkipLogicRule,
  ConditionalShow,
  SubscriptionTier,
} from './types'
import { INTERVIEW_QUESTION_LIBRARY } from './question-templates'

/**
 * QuestionGenerationEngine
 * Core service for generating interview questions with standards backing
 */
export class QuestionGenerationEngine {
  /**
   * Generate questions for a form based on context
   * Returns tiered questions (Tier 1, 2, 3, 4) organized by priority
   */
  static generateQuestions(context: QuestionGenerationContext): GenerateQuestionsResponse {
    const questions = this.buildQuestionLibrary(context)
    const tieredQuestions = this.organizeTiers(questions, context.userTierLevel)
    const standardsCovered = this.extractStandardsCovered(questions)

    return {
      questions: this.prioritizeQuestions(questions, context),
      tieredQuestions,
      estimatedDurationMinutes: this.estimateDuration(tieredQuestions),
      totalQuestionsCount: Object.values(tieredQuestions).flat().length,
      standardsCovered,
    }
  }

  /**
   * Build complete question library from templates
   * Filters based on context (job type, postcode, tier level)
   */
  private static buildQuestionLibrary(context: QuestionGenerationContext): Question[] {
    const questionLibrary = this.getQuestionTemplates()

    // Filter questions based on context
    return questionLibrary.filter((q) => {
      // Tier-based filtering
      if (q.minTierLevel && this.getTierLevel(q.minTierLevel) > this.getTierLevel(context.userTierLevel)) {
        return false
      }

      // Job type filtering (if applicable)
      if (q.id.includes('mold') && context.jobType !== 'MOLD') return false
      if (q.id.includes('fire') && context.jobType !== 'FIRE') return false
      if (!q.id.includes('mold') && !q.id.includes('fire') && context.jobType === 'MOLD') {
        // Only show water-specific for MOLD if generic
        if (q.id.includes('water_source')) return false
      }

      return true
    })
  }

  /**
   * Organise questions into 4 tiers based on priority
   * Tier 1: Essential (5 questions) - always shown
   * Tier 2: Environmental (3 questions) - always shown
   * Tier 3: Compliance (3-5 questions) - conditional on postcode/job type
   * Tier 4: Specialized (5-10 questions) - conditional on answers
   */
  private static organizeTiers(questions: Question[], tierLevel: SubscriptionTier): TieredQuestions {
    const tier1 = questions.filter((q) => q.sequenceNumber && q.sequenceNumber <= 5)
    const tier2 = questions.filter((q) => q.sequenceNumber && q.sequenceNumber > 5 && q.sequenceNumber <= 8)
    const tier3 = questions.filter((q) => q.sequenceNumber && q.sequenceNumber > 8 && q.sequenceNumber <= 13)
    const tier4 = questions.filter((q) => !q.sequenceNumber || q.sequenceNumber > 13)

    return {
      tier1,
      tier2,
      tier3,
      tier4,
    }
  }

  /**
   * Prioritize questions by importance and context
   */
  private static prioritizeQuestions(questions: Question[], context: QuestionGenerationContext): Question[] {
    return questions.sort((a, b) => {
      // 1. Sequence number priority
      const seqA = a.sequenceNumber || 999
      const seqB = b.sequenceNumber || 999
      if (seqA !== seqB) return seqA - seqB

      // 2. Standards references (more standards = higher priority)
      const stdA = a.standardsReference?.length || 0
      const stdB = b.standardsReference?.length || 0
      if (stdA !== stdB) return stdB - stdA

      // 3. Form fields affected (more impact = higher priority)
      const fieldsA = a.fieldMappings?.length || 0
      const fieldsB = b.fieldMappings?.length || 0
      return fieldsB - fieldsA
    })
  }

  /**
   * Estimate total interview duration in minutes
   */
  private static estimateDuration(tieredQuestions: TieredQuestions): number {
    const totalQuestions = Object.values(tieredQuestions).flat().length
    // Average 20-30 seconds per question
    const minutes = Math.ceil((totalQuestions * 25) / 60)
    return Math.max(5, Math.min(minutes, 30)) // 5-30 minute range
  }

  /**
   * Extract all standards covered by questions
   */
  private static extractStandardsCovered(questions: Question[]): string[] {
    const standards = new Set<string>()
    questions.forEach((q) => {
      q.standardsReference?.forEach((std) => {
        const code = std.split(' ')[0] // Extract "IICRC", "NCC", etc.
        standards.add(code)
      })
    })
    return Array.from(standards).sort()
  }

  /**
   * Evaluate skip logic - determine if current question should be skipped
   */
  static evaluateSkipLogic(
    question: Question,
    previousAnswers: Map<string, any>,
    allQuestions: Question[]
  ): { shouldSkip: boolean; nextQuestionId?: string; reason?: string } {
    if (!question.skipLogic || question.skipLogic.length === 0) {
      return { shouldSkip: false }
    }

    // Find the most recent answer that affects this question
    for (const rule of question.skipLogic) {
      // Check if previous answers match the skip condition
      for (const [questionId, answer] of previousAnswers) {
        const question = allQuestions.find((q) => q.id === questionId)
        if (question && this.answerMatches(answer, rule.answerValue)) {
          return {
            shouldSkip: true,
            nextQuestionId: rule.nextQuestionId,
            reason: rule.reason,
          }
        }
      }
    }

    return { shouldSkip: false }
  }

  /**
   * Evaluate conditional show - determine if question should be shown
   */
  static evaluateConditionalShow(question: Question, previousAnswers: Map<string, any>): boolean {
    if (!question.conditionalShows || question.conditionalShows.length === 0) {
      return true // Always show if no conditions
    }

    // All conditions must be met (AND logic)
    return question.conditionalShows.every((condition) => {
      const answer = previousAnswers.get(condition.field)
      return this.evaluateCondition(answer, condition)
    })
  }

  /**
   * Evaluate a single condition
   */
  private static evaluateCondition(answer: any, condition: ConditionalShow): boolean {
    if (answer === undefined || answer === null) return false

    switch (condition.operator) {
      case 'eq':
        return answer === condition.value
      case 'neq':
        return answer !== condition.value
      case 'gt':
        return Number(answer) > Number(condition.value)
      case 'lt':
        return Number(answer) < Number(condition.value)
      case 'gte':
        return Number(answer) >= Number(condition.value)
      case 'lte':
        return Number(answer) <= Number(condition.value)
      case 'includes':
        return Array.isArray(answer) && answer.includes(condition.value)
      case 'excludes':
        return Array.isArray(answer) && !answer.includes(condition.value)
      case 'contains':
        return String(answer).includes(String(condition.value))
      default:
        return false
    }
  }

  /**
   * Check if answer matches skip condition value
   */
  private static answerMatches(answer: any, expectedValue: any): boolean {
    if (Array.isArray(expectedValue)) {
      return Array.isArray(answer) && answer.some((a) => expectedValue.includes(a))
    }
    return answer === expectedValue || String(answer).toLowerCase() === String(expectedValue).toLowerCase()
  }

  /**
   * Get next question ID based on current answer and skip logic
   */
  static getNextQuestionId(
    currentQuestion: Question,
    currentAnswer: any,
    allQuestions: Question[]
  ): string | undefined {
    if (!currentQuestion.skipLogic) return undefined

    for (const rule of currentQuestion.skipLogic) {
      if (this.answerMatches(currentAnswer, rule.answerValue)) {
        return rule.nextQuestionId
      }
    }

    return undefined
  }

  /**
   * Find the next available question (respecting skip logic and conditionals)
   */
  static getNextQuestion(
    currentIndex: number,
    allQuestions: Question[],
    previousAnswers: Map<string, any>
  ): Question | undefined {
    if (currentIndex >= allQuestions.length - 1) {
      return undefined // End of questions
    }

    // Start from next question
    for (let i = currentIndex + 1; i < allQuestions.length; i++) {
      const question = allQuestions[i]

      // Check if should be shown based on conditionals
      if (!this.evaluateConditionalShow(question, previousAnswers)) {
        continue // Skip this question
      }

      return question
    }

    return undefined
  }

  /**
   * Get full question library with all question templates
   * Uses imported INTERVIEW_QUESTION_LIBRARY from question-templates.ts
   */
  private static getQuestionTemplates(): Question[] {
    return INTERVIEW_QUESTION_LIBRARY
  }

  /**
   * Convert tier level string to numeric for comparison
   */
  private static getTierLevel(tier: string | SubscriptionTier): number {
    const tierMap = { standard: 0, premium: 1, enterprise: 2 }
    return tierMap[tier as keyof typeof tierMap] || 0
  }

  /**
   * Calculate field mappings confidence based on answer type
   */
  static calculateFieldConfidence(answer: any, mapping: FieldMapping): number {
    // Start with base confidence
    let confidence = mapping.confidence

    // Reduce confidence if answer is uncertain
    if (answer === 'unsure' || answer === 'maybe') {
      confidence *= 0.7
    }

    // Reduce confidence if derived/transformed (vs direct)
    if (mapping.transformer) {
      confidence *= 0.9
    }

    return Math.round(confidence)
  }

  /**
   * Validate question structure for integrity
   */
  static validateQuestion(question: Question): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!question.id) errors.push('Question must have an id')
    if (!question.text) errors.push('Question must have text')
    if (!question.type) errors.push('Question must have a type')
    if (!question.standardsReference || question.standardsReference.length === 0) {
      errors.push('Question must have at least one standards reference')
    }
    if (!question.fieldMappings || question.fieldMappings.length === 0) {
      errors.push('Question must have at least one field mapping')
    }

    // Validate field mappings
    question.fieldMappings?.forEach((mapping, index) => {
      if (!mapping.formFieldId) errors.push(`Field mapping ${index} missing formFieldId`)
      if (mapping.confidence < 0 || mapping.confidence > 100) {
        errors.push(`Field mapping ${index} confidence must be 0-100`)
      }
    })

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}
