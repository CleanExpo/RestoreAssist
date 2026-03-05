'use client'

import { useState, useCallback } from 'react'
import { InterviewFormMerger } from '../interview-form-merger'
import type { FormField, InterviewPopulatedField, MergeResult } from '../interview-form-merger'

/**
 * Interview Form Submission Hook
 * Handles form submission with interview auto-populated data
 */
interface UseInterviewFormSubmissionOptions {
  formTemplateId: string
  reportId?: string
  jobType?: string
  postcode?: string
}

interface SubmissionState {
  isLoading: boolean
  isSuccess: boolean
  error: string | null
  submissionId?: string
  mergeResult?: MergeResult
}

export function useInterviewFormSubmission(options: UseInterviewFormSubmissionOptions) {
  const { formTemplateId, reportId, jobType = 'WATER_DAMAGE', postcode } = options

  const [state, setState] = useState<SubmissionState>({
    isLoading: false,
    isSuccess: false,
    error: null,
  })

  /**
   * Submit interview-populated form data
   */
  const submitForm = useCallback(
    async (
      autoPopulatedFields: Map<string, InterviewPopulatedField>,
      additionalFormData?: Record<string, any>
    ) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }))

        // Convert interview fields to form field format
        const formState: { [fieldId: string]: FormField } = {}

        // Add any additional form data
        if (additionalFormData) {
          Object.entries(additionalFormData).forEach(([fieldId, value]) => {
            formState[fieldId] = {
              id: fieldId,
              value,
              source: 'manual',
            }
          })
        }

        // Merge interview data with form state
        const mergeResult = InterviewFormMerger.mergeInterviewWithForm(
          formState,
          autoPopulatedFields,
          {
            overwriteExisting: false,
            minimumConfidence: 70,
            prioritizeInterview: false,
          }
        )

        // Export as form submission
        const exportedData = InterviewFormMerger.exportAsFormSubmission(
          mergeResult.mergedFields,
          {
            interviewSessionId: `interview-${Date.now()}`,
            submittedBy: 'interview_system',
            submittedAt: new Date(),
          }
        )

        // Validate merged form
        const validation = InterviewFormMerger.validateMergedForm(mergeResult.mergedFields)

        if (!validation.isValid && validation.missingRequiredFields.length > 0) {
          throw new Error(
            `Form validation failed. Missing required fields: ${validation.missingRequiredFields.join(', ')}`
          )
        }

        // Submit to API
        const response = await fetch('/api/forms/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: formTemplateId,
            formData: exportedData.formData,
            reportId,
            saveDraft: true,
            metadata: {
              interviewMetadata: exportedData.interviewMetadata,
              jobType,
              postcode,
              mergeStatistics: mergeResult.statistics,
              validationWarnings: validation.warnings,
            },
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
        }

        const result = await response.json()

        if (!result.success) {
          throw new Error(result.errors?.[0] || 'Form submission failed')
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isSuccess: true,
          submissionId: result.submissionId,
          mergeResult,
        }))

        return {
          success: true,
          submissionId: result.submissionId,
          mergeResult,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }))

        return {
          success: false,
          error: errorMessage,
        }
      }
    },
    [formTemplateId, reportId, jobType, postcode]
  )

  /**
   * Reset submission state
   */
  const reset = useCallback(() => {
    setState({
      isLoading: false,
      isSuccess: false,
      error: null,
    })
  }, [])

  return {
    ...state,
    submitForm,
    reset,
  }
}
