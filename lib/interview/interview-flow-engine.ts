/**
 * Interview Flow Engine
 * Manages interview state, question progression, and answer tracking
 * Orchestrates the flow through tiers based on user responses
 */

import { QuestionGenerationEngine } from './question-generation-engine'
import {
  Question,
  QuestionGenerationContext,
  InterviewState,
  InterviewResponse,
} from './types'

/**
 * Represents the current state of an interview session
 */
export interface InterviewSessionState {
  sessionId: string
  userId: string
  formTemplateId: string
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
  currentTier: number
  currentQuestionIndex: number
  currentQuestion: Question | null
  allQuestions: Question[]
  answers: Map<string, any>
  confidenceScores: Map<string, number>
  startedAt: Date
  lastActivityAt: Date
  estimatedDurationMinutes: number
  actualTimeElapsedMinutes: number
  totalQuestionsCount: number
  questionsAnsweredCount: number
  progressPercentage: number
  standardsCovered: string[]
  autoPopulatedFields: Map<string, { value: any; confidence: number }>
}

/**
 * Interview Flow Engine
 * Orchestrates interview progression and state management
 */
export class InterviewFlowEngine {
  /**
   * Initialize an interview session with all questions
   */
  static initializeSession(
    sessionId: string,
    userId: string,
    formTemplateId: string,
    context: QuestionGenerationContext,
    estimatedDuration: number,
    totalQuestions: number,
    standardsCovered: string[]
  ): InterviewSessionState {
    const questionResponse = QuestionGenerationEngine.generateQuestions(context)

    return {
      sessionId,
      userId,
      formTemplateId,
      status: 'STARTED',
      currentTier: 1,
      currentQuestionIndex: 0,
      currentQuestion: questionResponse.questions[0] || null,
      allQuestions: questionResponse.questions,
      answers: new Map(),
      confidenceScores: new Map(),
      startedAt: new Date(),
      lastActivityAt: new Date(),
      estimatedDurationMinutes: estimatedDuration,
      actualTimeElapsedMinutes: 0,
      totalQuestionsCount: totalQuestions,
      questionsAnsweredCount: 0,
      progressPercentage: 0,
      standardsCovered,
      autoPopulatedFields: new Map(),
    }
  }

  /**
   * Record an answer to the current question
   */
  static recordAnswer(
    state: InterviewSessionState,
    answer: any,
    confidence?: number
  ): { success: boolean; nextQuestion: Question | null; error?: string } {
    if (!state.currentQuestion) {
      return {
        success: false,
        nextQuestion: null,
        error: 'No current question',
      }
    }

    const questionId = state.currentQuestion.id

    // Store the answer
    state.answers.set(questionId, answer)
    state.confidenceScores.set(questionId, confidence || 100)

    // Update progress
    state.questionsAnsweredCount += 1
    state.lastActivityAt = new Date()
    state.status = 'IN_PROGRESS'

    // Calculate field mappings for this answer
    this.processFieldMappings(state, state.currentQuestion, answer, confidence)

    // Get next question
    const nextQuestion = this.getNextQuestion(state)

    if (nextQuestion) {
      state.currentQuestionIndex = state.allQuestions.findIndex(
        (q) => q.id === nextQuestion.id
      )
      state.currentQuestion = nextQuestion

      // Update tier if moved to different tier
      this.updateCurrentTier(state)
    } else {
      // Interview completed
      state.status = 'COMPLETED'
      state.currentQuestion = null
    }

    // Update progress percentage
    this.updateProgressPercentage(state)

    return {
      success: true,
      nextQuestion: state.currentQuestion,
    }
  }

  /**
   * Get the next question respecting skip logic and conditionals
   */
  private static getNextQuestion(state: InterviewSessionState): Question | null {
    const currentIndex = state.currentQuestionIndex

    // Check skip logic for current question
    if (state.currentQuestion?.skipLogic) {
      const currentAnswer = state.answers.get(state.currentQuestion.id)
      const nextQuestionId = QuestionGenerationEngine.getNextQuestionId(
        state.currentQuestion,
        currentAnswer,
        state.allQuestions
      )

      if (nextQuestionId) {
        const skipToQuestion = state.allQuestions.find((q) => q.id === nextQuestionId)
        if (skipToQuestion) {
          return skipToQuestion
        }
      }
    }

    // Get next question respecting conditionals
    const nextQuestion = QuestionGenerationEngine.getNextQuestion(
      currentIndex,
      state.allQuestions,
      state.answers
    )

    return nextQuestion || null
  }

  /**
   * Move to the previous question (back button)
   */
  static goToPreviousQuestion(state: InterviewSessionState): {
    success: boolean
    previousQuestion: Question | null
    error?: string
  } {
    if (state.currentQuestionIndex <= 0) {
      return {
        success: false,
        previousQuestion: null,
        error: 'Already at first question',
      }
    }

    // Move back through questions, respecting conditionals
    for (let i = state.currentQuestionIndex - 1; i >= 0; i--) {
      const question = state.allQuestions[i]

      // Check if this question should be shown
      if (QuestionGenerationEngine.evaluateConditionalShow(question, state.answers)) {
        state.currentQuestionIndex = i
        state.currentQuestion = question
        state.lastActivityAt = new Date()
        this.updateCurrentTier(state)
        this.updateProgressPercentage(state)

        return {
          success: true,
          previousQuestion: question,
        }
      }
    }

    return {
      success: false,
      previousQuestion: null,
      error: 'No previous question available',
    }
  }

  /**
   * Jump to a specific question (from progress ring)
   */
  static jumpToQuestion(
    state: InterviewSessionState,
    questionId: string
  ): {
    success: boolean
    question: Question | null
    error?: string
  } {
    const questionIndex = state.allQuestions.findIndex((q) => q.id === questionId)

    if (questionIndex === -1) {
      return {
        success: false,
        question: null,
        error: 'Question not found',
      }
    }

    const question = state.allQuestions[questionIndex]

    // Can only jump to questions we've already passed or already answered
    if (questionIndex > state.currentQuestionIndex) {
      return {
        success: false,
        question: null,
        error: 'Cannot jump ahead to unanswered questions',
      }
    }

    state.currentQuestionIndex = questionIndex
    state.currentQuestion = question
    state.lastActivityAt = new Date()
    this.updateCurrentTier(state)
    this.updateProgressPercentage(state)

    return {
      success: true,
      question,
    }
  }

  /**
   * Process field mappings for an answer
   * Populates auto-populated fields based on question answer
   */
  private static processFieldMappings(
    state: InterviewSessionState,
    question: Question,
    answer: any,
    confidence?: number
  ): void {
    question.fieldMappings.forEach((mapping) => {
      let value = mapping.value
      let mappingConfidence = mapping.confidence

      // Apply transformer if present
      if (mapping.transformer) {
        try {
          value = mapping.transformer(answer, { answers: state.answers })
        } catch (e) {
          console.error(`Transformer error for field ${mapping.formFieldId}:`, e)
          return
        }
      } else if (mapping.value === undefined) {
        // Use the answer directly if no value or transformer specified
        value = answer
      }

      // Calculate final confidence
      const finalConfidence = QuestionGenerationEngine.calculateFieldConfidence(
        answer,
        mapping
      )

      // Store auto-populated field
      state.autoPopulatedFields.set(mapping.formFieldId, {
        value,
        confidence: finalConfidence,
      })
    })
  }

  /**
   * Update current tier based on question index
   */
  private static updateCurrentTier(state: InterviewSessionState): void {
    const question = state.currentQuestion
    if (!question?.sequenceNumber) {
      state.currentTier = 4
      return
    }

    if (question.sequenceNumber <= 5) {
      state.currentTier = 1
    } else if (question.sequenceNumber <= 8) {
      state.currentTier = 2
    } else if (question.sequenceNumber <= 13) {
      state.currentTier = 3
    } else {
      state.currentTier = 4
    }
  }

  /**
   * Update progress percentage
   */
  private static updateProgressPercentage(state: InterviewSessionState): void {
    const actualTimeMinutes = Math.round(
      (new Date().getTime() - state.startedAt.getTime()) / 60000
    )
    state.actualTimeElapsedMinutes = actualTimeMinutes

    state.progressPercentage = state.totalQuestionsCount > 0
      ? Math.round((state.questionsAnsweredCount / state.totalQuestionsCount) * 100)
      : 0
  }

  /**
   * Calculate IICRC classification based on answers
   * Returns water category (1/2/3) and water class (1/2/3/4)
   */
  static calculateIICRCClassification(
    state: InterviewSessionState
  ): {
    category: number
    class: number
    reasoning: string
    recommendedActions: string[]
  } {
    // Get relevant answers
    const waterSource = state.answers.get('water_source')
    const timeSinceLoss = state.answers.get('time_since_loss_hours') || 0
    const affectedArea = state.answers.get('affected_area_percentage') || 10
    const hasMold = state.answers.get('microbial_growth') === true

    // Determine category (1 = Clean, 2 = Grey, 3 = Black)
    let category = 1
    if (waterSource === 'grey_water' || waterSource === 'slightly_contaminated') {
      category = 2
    } else if (waterSource === 'black_water' || waterSource === 'heavily_contaminated' || hasMold) {
      category = 3
    }

    // Upgrade category if >72 hours since loss (contamination risk)
    if (timeSinceLoss > 72) {
      category = Math.min(3, category + 1)
    }

    // Determine class (1-4 based on affected area and materials)
    let waterClass = 1
    if (affectedArea > 10 && affectedArea <= 30) {
      waterClass = 2
    } else if (affectedArea > 30 && affectedArea <= 50) {
      waterClass = 3
    } else if (affectedArea > 50) {
      waterClass = 4
    }

    // Generate reasoning
    const reasons: string[] = []
    reasons.push(`Category ${category}: ${this.getCategoryName(category)}`)
    reasons.push(`Class ${waterClass}: ${this.getClassName(waterClass)} area affected (${affectedArea}%)`)
    if (timeSinceLoss > 72) {
      reasons.push('Category upgraded due to >72 hours since loss')
    }
    if (hasMold) {
      reasons.push('Microbial growth detected')
    }

    // Generate recommended actions
    const actions = this.generateRecommendedActions(category, waterClass, state)

    return {
      category,
      class: waterClass,
      reasoning: reasons.join(' → '),
      recommendedActions: actions,
    }
  }

  /**
   * Get category name
   */
  private static getCategoryName(category: number): string {
    const names: { [key: number]: string } = {
      1: 'Clean Water',
      2: 'Grey Water',
      3: 'Black Water',
    }
    return names[category] || 'Unknown'
  }

  /**
   * Get class name
   */
  private static getClassName(waterClass: number): string {
    const names: { [key: number]: string } = {
      1: 'Small (0-10%)',
      2: 'Medium (10-30%)',
      3: 'Large (30-50%)',
      4: 'Extreme (>50%)',
    }
    return names[waterClass] || 'Unknown'
  }

  /**
   * Generate recommended actions based on classification
   */
  private static generateRecommendedActions(
    category: number,
    waterClass: number,
    state: InterviewSessionState
  ): string[] {
    const actions: string[] = []

    // Safety actions
    if (category >= 2) {
      actions.push('Use appropriate PPE (gloves, respiratory protection)')
      actions.push('Implement antimicrobial treatment')
    }

    // Equipment recommendations
    if (waterClass >= 2) {
      actions.push(`Deploy ${waterClass} air movers for affected area`)
      actions.push(`Deploy ${waterClass} dehumidifier(s)`)
    }

    if (waterClass >= 3) {
      actions.push('Deploy air scrubbers for contamination control')
      actions.push('Monitor for secondary damage')
    }

    // Material-specific actions
    const materialsAffected = state.answers.get('materials_affected') || []
    if (materialsAffected.includes('drywall')) {
      actions.push('Plan for drywall removal if saturated >24 hours')
    }
    if (materialsAffected.includes('carpet')) {
      actions.push('Assess carpet salvageability (typically removed if wet >12h)')
    }
    if (materialsAffected.includes('wood')) {
      actions.push('Monitor wood warping and cupping')
    }

    // Structural actions
    const structuralDamage = state.answers.get('structural_damage')
    if (structuralDamage === true) {
      actions.push('Engage structural engineer for assessment')
    }

    // Building code compliance
    const buildingAge = state.answers.get('building_age')
    if (buildingAge === 'pre_1980') {
      actions.push('Survey for asbestos (potentially present)')
    }

    if (state.answers.get('electrical_affected') === true) {
      actions.push('Electrical system must be de-energized and inspected')
      actions.push('Engage licensed electrician')
    }

    return actions
  }

  /**
   * Get interview summary for database persistence
   */
  static getInterviewSummary(state: InterviewSessionState): InterviewState {
    return {
      sessionId: state.sessionId,
      userId: state.userId,
      formTemplateId: state.formTemplateId,
      status: state.status,
      startedAt: state.startedAt,
      completedAt: state.status === 'COMPLETED' ? new Date() : undefined,
      totalQuestionsAsked: state.totalQuestionsCount,
      totalAnswersGiven: state.questionsAnsweredCount,
      estimatedTimeMinutes: state.estimatedDurationMinutes,
      actualTimeMinutes: state.actualTimeElapsedMinutes,
      answers: Object.fromEntries(state.answers),
      autoPopulatedFields: Object.fromEntries(
        Array.from(state.autoPopulatedFields.entries()).map(([key, val]) => [
          key,
          { value: val.value, confidence: val.confidence },
        ])
      ),
      standardsReferences: state.standardsCovered,
    }
  }

  /**
   * Restore interview session from saved state
   */
  static restoreSession(
    sessionId: string,
    userId: string,
    formTemplateId: string,
    context: QuestionGenerationContext,
    savedAnswers: { [key: string]: any },
    startedAt: Date
  ): InterviewSessionState {
    const questionResponse = QuestionGenerationEngine.generateQuestions(context)
    const state: InterviewSessionState = {
      sessionId,
      userId,
      formTemplateId,
      status: 'IN_PROGRESS',
      currentTier: 1,
      currentQuestionIndex: 0,
      currentQuestion: null,
      allQuestions: questionResponse.questions,
      answers: new Map(Object.entries(savedAnswers)),
      confidenceScores: new Map(),
      startedAt,
      lastActivityAt: new Date(),
      estimatedDurationMinutes: questionResponse.estimatedDurationMinutes,
      actualTimeElapsedMinutes: Math.round(
        (new Date().getTime() - startedAt.getTime()) / 60000
      ),
      totalQuestionsCount: questionResponse.totalQuestionsCount,
      questionsAnsweredCount: Object.keys(savedAnswers).length,
      progressPercentage: 0,
      standardsCovered: questionResponse.standardsCovered,
      autoPopulatedFields: new Map(),
    }

    // Re-process field mappings for all answers
    Object.entries(savedAnswers).forEach(([questionId, answer]) => {
      const question = state.allQuestions.find((q) => q.id === questionId)
      if (question) {
        this.processFieldMappings(state, question, answer, 100)
      }
    })

    // Find current question (next unanswered)
    const currentQuestion = questionResponse.questions.find((q) => !savedAnswers[q.id])
    if (currentQuestion) {
      state.currentQuestionIndex = questionResponse.questions.findIndex(
        (q) => q.id === currentQuestion.id
      )
      state.currentQuestion = currentQuestion
    }

    this.updateCurrentTier(state)
    this.updateProgressPercentage(state)

    return state
  }

  /**
   * Validate interview completion (all required questions answered)
   */
  static validateCompletion(state: InterviewSessionState): {
    isComplete: boolean
    missingQuestions: Question[]
  } {
    const answeredQuestionIds = new Set(state.answers.keys())
    const missingQuestions = state.allQuestions.filter((q) => !answeredQuestionIds.has(q.id))

    return {
      isComplete: missingQuestions.length === 0,
      missingQuestions,
    }
  }

  /**
   * Abandon interview
   */
  static abandonInterview(state: InterviewSessionState): void {
    state.status = 'ABANDONED'
    state.lastActivityAt = new Date()
  }

  /**
   * Get interview diagnostics (for debugging)
   */
  static getDiagnostics(state: InterviewSessionState): {
    totalQuestions: number
    answeredQuestions: number
    unansweredQuestions: number
    currentTier: number
    progressPercent: number
    timeElapsedMinutes: number
    sessionStatus: string
    nextQuestionId: string | null
  } {
    return {
      totalQuestions: state.totalQuestionsCount,
      answeredQuestions: state.questionsAnsweredCount,
      unansweredQuestions: state.totalQuestionsCount - state.questionsAnsweredCount,
      currentTier: state.currentTier,
      progressPercent: state.progressPercentage,
      timeElapsedMinutes: state.actualTimeElapsedMinutes,
      sessionStatus: state.status,
      nextQuestionId: state.currentQuestion?.id || null,
    }
  }
}
