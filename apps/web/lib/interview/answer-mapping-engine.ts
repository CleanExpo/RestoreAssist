/**
 * Answer Mapping Engine
 * Transforms interview answers into form field values with confidence scoring
 * Applies field transformers, handles multi-field population, and tracks IICRC classifications
 */

import { QuestionGenerationEngine } from './question-generation-engine'
import {
  Question,
  FieldMapping,
  AnswerMappingResult,
  FieldPopulation,
} from './types'

/**
 * Represents a single field population result
 */
export interface FieldPopulationDetail {
  formFieldId: string
  value: any
  confidence: number
  source: 'direct' | 'derived' | 'calculated'
  standardsReference?: string[]
  techniciansNote?: string
  isOverrideable: boolean
  originalValue?: any
}

/**
 * Answer Mapping Engine
 * Core service for transforming interview answers to form field values
 */
export class AnswerMappingEngine {
  /**
   * Map a single answer to form fields
   * Returns all fields that should be populated based on this answer
   */
  static mapAnswerToFields(
    question: Question,
    answer: any
  ): {
    fieldPopulations: FieldPopulationDetail[]
    appliedStandards: string[]
    derivationNotes: { [fieldId: string]: string }
  } {
    const fieldPopulations: FieldPopulationDetail[] = []
    const appliedStandards = new Set<string>()
    const derivationNotes: { [fieldId: string]: string } = {}

    // Add standards from question
    question.standardsReference.forEach((std) => appliedStandards.add(std))

    // Process each field mapping
    question.fieldMappings.forEach((mapping) => {
      const populatedField = this.mapFieldMapping(question, mapping, answer)
      if (populatedField) {
        fieldPopulations.push(populatedField)

        // Track derivation notes
        if (mapping.transformer) {
          derivationNotes[mapping.formFieldId] = `Derived from question "${question.text}" using field transformer`
        } else if (mapping.value !== undefined && mapping.value !== answer) {
          derivationNotes[mapping.formFieldId] = `Static value from field mapping`
        } else {
          derivationNotes[mapping.formFieldId] = `Direct answer to question "${question.text}"`
        }
      }
    })

    return {
      fieldPopulations,
      appliedStandards: Array.from(appliedStandards),
      derivationNotes,
    }
  }

  /**
   * Map a single field mapping
   */
  private static mapFieldMapping(
    question: Question,
    mapping: FieldMapping,
    answer: any
  ): FieldPopulationDetail | null {
    try {
      let value = mapping.value
      let source: 'direct' | 'derived' | 'calculated' = 'direct'

      // Determine value and source
      if (mapping.transformer) {
        // Apply transformer for derived values
        value = mapping.transformer(answer, {})
        source = 'derived'
      } else if (mapping.value !== undefined) {
        // Use static value
        value = mapping.value
        source = 'calculated'
      } else {
        // Use answer directly
        value = answer
        source = 'direct'
      }

      // Calculate confidence
      const baseConfidence = mapping.confidence
      const answerConfidence = this.getAnswerConfidence(answer)
      const finalConfidence = Math.round((baseConfidence * answerConfidence) / 100)

      return {
        formFieldId: mapping.formFieldId,
        value,
        confidence: finalConfidence,
        source,
        standardsReference: question.standardsReference,
        isOverrideable: true,
        originalValue: answer,
      }
    } catch (error) {
      console.error(
        `Error mapping field ${mapping.formFieldId} for question ${question.id}:`,
        error
      )
      return null
    }
  }

  /**
   * Calculate confidence score based on answer certainty
   * Returns 0-100 confidence
   */
  private static getAnswerConfidence(answer: any): number {
    if (answer === null || answer === undefined) {
      return 0
    }

    // Handle string answers
    if (typeof answer === 'string') {
      const lower = answer.toLowerCase()
      if (lower === 'unsure' || lower === 'maybe' || lower === 'unknown') {
        return 50
      }
      if (lower === 'n/a' || lower === 'not applicable') {
        return 30
      }
      return 100
    }

    // Handle boolean answers
    if (typeof answer === 'boolean') {
      return 100
    }

    // Handle numeric answers
    if (typeof answer === 'number') {
      return 100
    }

    // Handle array answers
    if (Array.isArray(answer)) {
      if (answer.length === 0) {
        return 50
      }
      // Check for uncertain values in array
      const uncertainCount = answer.filter(
        (a) =>
          typeof a === 'string' &&
          ['unsure', 'maybe', 'unknown'].includes(a.toLowerCase())
      ).length
      const confidence = 100 - (uncertainCount / answer.length) * 30
      return Math.max(70, confidence) // Min 70% for partial uncertainty
    }

    // Default to high confidence for other types
    return 90
  }

  /**
   * Batch map multiple answers to form fields
   * Used when processing complete interview
   */
  static mapMultipleAnswers(
    questionsWithAnswers: Array<{ question: Question; answer: any }>
  ): {
    allFieldPopulations: { [fieldId: string]: FieldPopulationDetail }
    appliedStandards: Map<string, { code: string; questions: string[] }>
    mappingSummary: {
      totalFieldsPopulated: number
      averageConfidence: number
      highConfidenceFields: number
      lowConfidenceFields: number
    }
  } {
    const allFieldPopulations: { [fieldId: string]: FieldPopulationDetail } = {}
    const standardsMap = new Map<string, { code: string; questions: Set<string> }>()
    let totalConfidence = 0
    let fieldCount = 0

    questionsWithAnswers.forEach(({ question, answer }) => {
      const { fieldPopulations, appliedStandards } = this.mapAnswerToFields(
        question,
        answer
      )

      // Merge field populations (later answers override earlier ones)
      fieldPopulations.forEach((pop) => {
        allFieldPopulations[pop.formFieldId] = pop
        totalConfidence += pop.confidence
        fieldCount += 1
      })

      // Track standards usage
      appliedStandards.forEach((std) => {
        if (!standardsMap.has(std)) {
          standardsMap.set(std, { code: std, questions: new Set() })
        }
        standardsMap.get(std)!.questions.add(question.id)
      })
    })

    // Calculate mapping summary
    const confidenceValues = Object.values(allFieldPopulations).map((p) => p.confidence)
    const averageConfidence = confidenceValues.length > 0
      ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)
      : 0

    const highConfidenceCount = confidenceValues.filter((c) => c >= 90).length
    const lowConfidenceCount = confidenceValues.filter((c) => c < 70).length

    // Convert standards map to desired format
    const appliedStandardsFormatted = new Map<
      string,
      { code: string; questions: string[] }
    >()
    standardsMap.forEach((val, key) => {
      appliedStandardsFormatted.set(key, {
        code: val.code,
        questions: Array.from(val.questions),
      })
    })

    return {
      allFieldPopulations,
      appliedStandards: appliedStandardsFormatted,
      mappingSummary: {
        totalFieldsPopulated: fieldCount,
        averageConfidence,
        highConfidenceFields: highConfidenceCount,
        lowConfidenceFields: lowConfidenceCount,
      },
    }
  }

  /**
   * Generate quality check report for field population
   * Identifies gaps and low-confidence fields
   */
  static generateQualityReport(fieldPopulations: {
    [fieldId: string]: FieldPopulationDetail
  }): {
    completeness: number // 0-100
    averageConfidence: number // 0-100
    lowConfidenceFields: Array<{ fieldId: string; confidence: number }>
    recommendations: string[]
  } {
    const popArray = Object.values(fieldPopulations)

    // Calculate completeness (assuming typical form has ~40 fields)
    const estimatedTotalFields = 40
    const completeness = Math.min(100, (popArray.length / estimatedTotalFields) * 100)

    // Average confidence
    const averageConfidence = popArray.length > 0
      ? Math.round(popArray.reduce((sum, p) => sum + p.confidence, 0) / popArray.length)
      : 0

    // Low confidence fields
    const lowConfidenceFields = popArray
      .filter((p) => p.confidence < 70)
      .map((p) => ({ fieldId: p.formFieldId, confidence: p.confidence }))

    // Generate recommendations
    const recommendations: string[] = []

    if (completeness < 50) {
      recommendations.push('Only 50% of form fields auto-populated. Review interview for completeness.')
    }

    if (averageConfidence < 80) {
      recommendations.push(
        `Average confidence is ${averageConfidence}%. Review low-confidence fields for accuracy.`
      )
    }

    if (lowConfidenceFields.length > 0) {
      recommendations.push(
        `${lowConfidenceFields.length} fields have confidence <70%. Consider manual review or re-asking clarifying questions.`
      )
    }

    if (completeness >= 90 && averageConfidence >= 85) {
      recommendations.push('✓ High quality auto-population. Ready for form submission.')
    }

    return {
      completeness: Math.round(completeness),
      averageConfidence,
      lowConfidenceFields,
      recommendations,
    }
  }

  /**
   * Apply IICRC classification to relevant form fields
   * Maps water category/class to standard form fields
   */
  static applyIICRCClassification(
    fieldPopulations: { [fieldId: string]: FieldPopulationDetail },
    iicrcCategory: number,
    iicrcClass: number
  ): void {
    // Map IICRC category to water source field
    const categoryMapping: { [key: number]: string } = {
      1: 'clean_water',
      2: 'grey_water',
      3: 'black_water',
    }

    if (fieldPopulations['water_source']) {
      fieldPopulations['water_source'].value = categoryMapping[iicrcCategory]
      fieldPopulations['water_source'].source = 'calculated'
      fieldPopulations['water_source'].confidence = 95
      fieldPopulations['water_source'].standardsReference = ['IICRC S500 s2']
    }

    // Map IICRC class to affected area class
    const classMapping: { [key: number]: string } = {
      1: 'class_1_small',
      2: 'class_2_medium',
      3: 'class_3_large',
      4: 'class_4_extreme',
    }

    if (fieldPopulations['water_class']) {
      fieldPopulations['water_class'].value = classMapping[iicrcClass]
      fieldPopulations['water_class'].source = 'calculated'
      fieldPopulations['water_class'].confidence = 95
      fieldPopulations['water_class'].standardsReference = ['IICRC S500 s3-4']
    }
  }

  /**
   * Handle field mapping conflicts
   * When multiple questions map to the same field with different values
   */
  static resolveConflicts(
    fieldPopulationsByQuestion: Array<{
      questionId: string
      fieldPopulations: FieldPopulationDetail[]
    }>
  ): { [fieldId: string]: FieldPopulationDetail } {
    const conflictMap: {
      [fieldId: string]: FieldPopulationDetail[]
    } = {}

    // Group by field ID
    fieldPopulationsByQuestion.forEach(({ fieldPopulations }) => {
      fieldPopulations.forEach((pop) => {
        if (!conflictMap[pop.formFieldId]) {
          conflictMap[pop.formFieldId] = []
        }
        conflictMap[pop.formFieldId].push(pop)
      })
    })

    // Resolve conflicts using confidence-based selection
    const resolved: { [fieldId: string]: FieldPopulationDetail } = {}

    Object.entries(conflictMap).forEach(([fieldId, populations]) => {
      if (populations.length === 1) {
        // No conflict
        resolved[fieldId] = populations[0]
      } else {
        // Multiple populations - use highest confidence
        let selected = populations[0]
        populations.forEach((pop) => {
          if (pop.confidence > selected.confidence) {
            selected = pop
          }
        })
        resolved[fieldId] = selected

        // Add note about conflict resolution
        const conflictNote = `Resolved conflict between ${populations.length} sources. Using highest confidence (${selected.confidence}%).`
        if (selected.techniciansNote) {
          selected.techniciansNote += ` ${conflictNote}`
        } else {
          selected.techniciansNote = conflictNote
        }
      }
    })

    return resolved
  }

  /**
   * Export field population as form submission payload
   * Formats data ready for form submission
   */
  static exportAsFormPayload(fieldPopulations: {
    [fieldId: string]: FieldPopulationDetail
  }): {
    formData: { [fieldId: string]: any }
    metadata: {
      populatedFields: number
      averageConfidence: number
      sources: { direct: number; derived: number; calculated: number }
      appliedStandards: string[]
    }
  } {
    const popArray = Object.values(fieldPopulations)

    // Extract just the values for form submission
    const formData: { [fieldId: string]: any } = {}
    let totalConfidence = 0
    const sourceCounts = { direct: 0, derived: 0, calculated: 0 }
    const allStandards = new Set<string>()

    popArray.forEach((pop) => {
      formData[pop.formFieldId] = pop.value
      totalConfidence += pop.confidence
      sourceCounts[pop.source]++

      pop.standardsReference?.forEach((std) => allStandards.add(std))
    })

    const avgConfidence = popArray.length > 0
      ? Math.round(totalConfidence / popArray.length)
      : 0

    return {
      formData,
      metadata: {
        populatedFields: popArray.length,
        averageConfidence: avgConfidence,
        sources: sourceCounts,
        appliedStandards: Array.from(allStandards),
      },
    }
  }
}
