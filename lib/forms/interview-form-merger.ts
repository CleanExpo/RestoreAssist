/**
 * Interview Form Merger Service
 * Merges interview auto-populated fields with existing form state
 * Handles field mapping, conflict resolution, and data transformation
 */

/**
 * Represents a form field with its value and metadata
 */
export interface FormField {
  id: string
  value: any
  type?: string
  required?: boolean
  lastModified?: Date
  source?: 'manual' | 'interview' | 'auto' | 'api'
  metadata?: Record<string, any>
}

/**
 * Represents an auto-populated field from interview
 */
export interface InterviewPopulatedField {
  value: any
  confidence: number
  source?: 'direct' | 'derived' | 'calculated'
  standardsReference?: string[]
  techniciansNote?: string
}

/**
 * Result of merging interview data with form
 */
export interface MergeResult {
  mergedFields: { [fieldId: string]: FormField }
  addedFields: string[] // Fields that didn't exist before
  updatedFields: string[] // Fields that were already filled
  conflictedFields: Array<{
    fieldId: string
    existingValue: any
    interviewValue: any
    resolution: 'kept' | 'replaced'
  }>
  statistics: {
    totalFieldsMerged: number
    newFieldsAdded: number
    fieldsUpdated: number
    conflictsResolved: number
    averageConfidence: number
  }
}

/**
 * Interview Form Merger Service
 * Intelligently merges interview data with form state
 */
export class InterviewFormMerger {
  /**
   * Merge interview auto-populated fields with existing form state
   * Handles conflicts intelligently based on confidence scores
   */
  static mergeInterviewWithForm(
    formState: { [fieldId: string]: FormField },
    interviewFields: Map<string, InterviewPopulatedField>,
    options?: {
      overwriteExisting?: boolean // Replace existing values (default: false)
      minimumConfidence?: number // Skip fields below this confidence (default: 70)
      prioritizeInterview?: boolean // Prefer interview values on conflict (default: false)
    }
  ): MergeResult {
    const {
      overwriteExisting = false,
      minimumConfidence = 70,
      prioritizeInterview = false,
    } = options || {}

    const mergedFields: { [fieldId: string]: FormField } = { ...formState }
    const addedFields: string[] = []
    const updatedFields: string[] = []
    const conflictedFields: MergeResult['conflictedFields'] = []

    let totalConfidence = 0
    let fieldCount = 0

    // Process each interview field
    interviewFields.forEach((interviewField, fieldId) => {
      // Skip fields below minimum confidence
      if (interviewField.confidence < minimumConfidence) {
        return
      }

      const existingField = formState[fieldId]
      const value = interviewField.value

      if (existingField) {
        // Field already exists in form
        const hasExistingValue =
          existingField.value !== null &&
          existingField.value !== undefined &&
          existingField.value !== ''

        if (hasExistingValue && !overwriteExisting) {
          // Keep existing value, track conflict
          conflictedFields.push({
            fieldId,
            existingValue: existingField.value,
            interviewValue: value,
            resolution: 'kept',
          })
        } else if (hasExistingValue && prioritizeInterview && interviewField.confidence >= 85) {
          // High-confidence interview value overrides
          mergedFields[fieldId] = {
            ...existingField,
            value,
            source: 'interview',
            lastModified: new Date(),
            metadata: {
              ...existingField.metadata,
              interviewConfidence: interviewField.confidence,
              interviewSource: interviewField.source,
              standards: interviewField.standardsReference,
            },
          }
          updatedFields.push(fieldId)
          totalConfidence += interviewField.confidence
          fieldCount += 1
        } else if (!hasExistingValue) {
          // No existing value, fill with interview data
          mergedFields[fieldId] = {
            ...existingField,
            value,
            source: 'interview',
            lastModified: new Date(),
            metadata: {
              ...existingField.metadata,
              interviewConfidence: interviewField.confidence,
              interviewSource: interviewField.source,
              standards: interviewField.standardsReference,
            },
          }
          updatedFields.push(fieldId)
          totalConfidence += interviewField.confidence
          fieldCount += 1
        } else {
          // Existing value, not overwriting
          totalConfidence += interviewField.confidence
          fieldCount += 1
        }
      } else {
        // Field doesn't exist, add it
        mergedFields[fieldId] = {
          id: fieldId,
          value,
          source: 'interview',
          lastModified: new Date(),
          metadata: {
            interviewConfidence: interviewField.confidence,
            interviewSource: interviewField.source,
            standards: interviewField.standardsReference,
            techniciansNote: interviewField.techniciansNote,
          },
        }
        addedFields.push(fieldId)
        totalConfidence += interviewField.confidence
        fieldCount += 1
      }
    })

    const averageConfidence = fieldCount > 0 ? Math.round(totalConfidence / fieldCount) : 0

    return {
      mergedFields,
      addedFields,
      updatedFields,
      conflictedFields,
      statistics: {
        totalFieldsMerged: fieldCount,
        newFieldsAdded: addedFields.length,
        fieldsUpdated: updatedFields.length,
        conflictsResolved: conflictedFields.length,
        averageConfidence,
      },
    }
  }

  /**
   * Get recommended field mapping for common form layouts
   * Maps interview fields to standard inspection form fields
   */
  static getStandardFieldMapping(): { [interviewField: string]: string[] } {
    return {
      // Water damage fields
      water_source: ['sourceOfWater', 'waterSource', 'water_source'],
      water_category: ['waterCategory', 'waterType', 'water_type'],
      water_class: ['waterClass', 'affectationClass', 'damage_class'],
      affected_area_percentage: [
        'affectedAreaPercentage',
        'damagePercentage',
        'affected_area_percent',
      ],
      time_since_loss_hours: ['timeSinceLoss', 'hoursElapsed', 'time_elapsed'],

      // Material fields
      materials_affected: ['affectedMaterials', 'damagedMaterials', 'materials_affected'],
      structural_damage: ['structuralDamage', 'hasStructuralDamage', 'structure_damaged'],

      // Environmental fields
      temperature_current: ['temperature', 'currentTemperature', 'temp_celsius'],
      humidity_current: ['humidity', 'currentHumidity', 'humidity_percent'],

      // Building fields
      building_age: ['buildingAge', 'yearBuilt', 'construction_year'],
      electrical_affected: ['electricalAffected', 'hasElectrical', 'electrical_damage'],
      plumbing_affected: ['plumbingAffected', 'hasPlumbing', 'plumbing_damage'],

      // Safety fields
      safety_hazards: ['safetyHazards', 'hasSafetyHazards', 'hazards_identified'],
      biological_mould_detected: ['moldDetected', 'hasMold', 'mould_present'],
    }
  }

  /**
   * Transform interview field to form field format
   * Handles type conversions, formatting, etc.
   */
  static transformFieldValue(
    fieldId: string,
    value: any,
    targetType?: string
  ): any {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return null
    }

    // Handle boolean
    if (typeof value === 'boolean') {
      if (targetType === 'string') {
        return value ? 'yes' : 'no'
      }
      return value
    }

    // Handle numeric
    if (typeof value === 'number') {
      if (targetType === 'string') {
        return String(value)
      }
      if (targetType === 'boolean') {
        return value !== 0
      }
      return value
    }

    // Handle string
    if (typeof value === 'string') {
      if (targetType === 'number') {
        const parsed = parseFloat(value)
        return isNaN(parsed) ? null : parsed
      }
      if (targetType === 'boolean') {
        return ['true', 'yes', 'y', '1'].includes(value.toLowerCase())
      }
      return value
    }

    // Handle array
    if (Array.isArray(value)) {
      if (targetType === 'string') {
        return value.join(', ')
      }
      if (targetType === 'single') {
        return value.length > 0 ? value[0] : null
      }
      return value
    }

    // Handle object
    if (typeof value === 'object') {
      if (targetType === 'string') {
        return JSON.stringify(value)
      }
      return value
    }

    return value
  }

  /**
   * Validate merged form for completeness
   * Checks required fields and confidence levels
   */
  static validateMergedForm(
    mergedFields: { [fieldId: string]: FormField },
    requiredFields?: string[],
    minimumConfidence?: number
  ): {
    isValid: boolean
    missingRequiredFields: string[]
    lowConfidenceFields: string[]
    warnings: string[]
  } {
    const missingRequiredFields: string[] = []
    const lowConfidenceFields: string[] = []
    const warnings: string[] = []

    // Check required fields
    if (requiredFields) {
      requiredFields.forEach((fieldId) => {
        const field = mergedFields[fieldId]
        if (!field || field.value === null || field.value === undefined || field.value === '') {
          missingRequiredFields.push(fieldId)
        }
      })
    }

    // Check confidence levels
    if (minimumConfidence) {
      Object.entries(mergedFields).forEach(([fieldId, field]) => {
        const confidence = field.metadata?.interviewConfidence
        if (confidence && confidence < minimumConfidence) {
          lowConfidenceFields.push(fieldId)
        }
      })
    }

    // Generate warnings
    if (missingRequiredFields.length > 0) {
      warnings.push(
        `${missingRequiredFields.length} required field(s) missing: ${missingRequiredFields.join(', ')}`
      )
    }

    if (lowConfidenceFields.length > 0) {
      warnings.push(
        `${lowConfidenceFields.length} field(s) have low confidence (<${minimumConfidence}%)`
      )
    }

    return {
      isValid: missingRequiredFields.length === 0 && lowConfidenceFields.length === 0,
      missingRequiredFields,
      lowConfidenceFields,
      warnings,
    }
  }

  /**
   * Export merged form as submission payload
   * Formats data for form submission to API
   */
  static exportAsFormSubmission(
    mergedFields: { [fieldId: string]: FormField },
    metadata?: {
      interviewSessionId?: string
      submittedAt?: Date
      submittedBy?: string
      notes?: string
    }
  ): {
    formData: { [fieldId: string]: any }
    metadata: any
    interviewMetadata: Array<{
      fieldId: string
      confidence: number
      source: string
      standards: string[]
    }>
  } {
    const formData: { [fieldId: string]: any } = {}
    const interviewMetadata: Array<{
      fieldId: string
      confidence: number
      source: string
      standards: string[]
    }> = []

    Object.entries(mergedFields).forEach(([fieldId, field]) => {
      formData[fieldId] = field.value

      // Track interview-sourced fields
      if (field.source === 'interview' && field.metadata?.interviewConfidence) {
        interviewMetadata.push({
          fieldId,
          confidence: field.metadata.interviewConfidence,
          source: field.metadata.interviewSource || 'unknown',
          standards: field.metadata.standards || [],
        })
      }
    })

    return {
      formData,
      metadata: {
        ...metadata,
        mergedAt: new Date(),
        interviewFieldCount: interviewMetadata.length,
        averageConfidence:
          interviewMetadata.length > 0
            ? Math.round(
                interviewMetadata.reduce((sum, m) => sum + m.confidence, 0) /
                  interviewMetadata.length
              )
            : 0,
      },
      interviewMetadata,
    }
  }

  /**
   * Generate human-readable merge summary
   */
  static generateMergeSummary(result: MergeResult): string {
    const lines: string[] = []

    lines.push('Interview Form Merge Summary')
    lines.push('=' .repeat(40))
    lines.push('')

    // Statistics
    lines.push('Statistics:')
    lines.push(`  Total fields merged: ${result.statistics.totalFieldsMerged}`)
    lines.push(`  New fields added: ${result.statistics.newFieldsAdded}`)
    lines.push(`  Existing fields updated: ${result.statistics.fieldsUpdated}`)
    lines.push(`  Conflicts resolved: ${result.statistics.conflictsResolved}`)
    lines.push(`  Average confidence: ${result.statistics.averageConfidence}%`)
    lines.push('')

    // Added fields
    if (result.addedFields.length > 0) {
      lines.push('New Fields Added:')
      result.addedFields.forEach((field) => {
        lines.push(`  ✓ ${field}`)
      })
      lines.push('')
    }

    // Updated fields
    if (result.updatedFields.length > 0) {
      lines.push('Fields Updated:')
      result.updatedFields.forEach((field) => {
        lines.push(`  ✓ ${field}`)
      })
      lines.push('')
    }

    // Conflicts
    if (result.conflictedFields.length > 0) {
      lines.push('Conflicts Resolved:')
      result.conflictedFields.forEach((conflict) => {
        const resolution = conflict.resolution === 'kept' ? 'Kept existing' : 'Replaced'
        lines.push(
          `  ⚠ ${conflict.fieldId}: ${resolution} (Existing: ${conflict.existingValue}, Interview: ${conflict.interviewValue})`
        )
      })
      lines.push('')
    }

    return lines.join('\n')
  }
}
