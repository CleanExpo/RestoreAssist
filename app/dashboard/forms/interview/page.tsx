'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle2, Loader2, FileText, Gift, Shield } from 'lucide-react'
import {
  GuidedInterviewPanel,
  EquipmentRecommendations,
  IICRCClassificationVisualizer,
  InterviewCompletionSummary,
} from '@/components/forms/guided-interview'
import { useInterviewFormSubmission } from '@/lib/forms/hooks'
import { InterviewFormMerger } from '@/lib/forms/interview-form-merger'
import type { InterviewPopulatedField, MergeResult } from '@/lib/forms/interview-form-merger'

/**
 * Guided Interview Page
 * Integrated page for conducting interviews and auto-populating form fields
 * Route: /dashboard/forms/interview?formTemplateId=<id>&reportId=<id>
 */
export default function InterviewPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const formTemplateId = searchParams.get('formTemplateId') || ''
  const reportId = searchParams.get('reportId')
  const jobType = searchParams.get('jobType') || 'WATER_DAMAGE'
  const postcode = searchParams.get('postcode') || undefined
  const experienceLevel = searchParams.get('experienceLevel') || undefined
  const sessionId = searchParams.get('sessionId') || undefined

  const [interviewStatus, setInterviewStatus] = useState<'in_progress' | 'completed' | 'error'>(
    'in_progress'
  )
  const [autoPopulatedFields, setAutoPopulatedFields] = useState<
    Map<string, InterviewPopulatedField> | null
  >(null)
  const [mergeResult, setMergeResult] = useState(null)
  const [showSummary, setShowSummary] = useState(false)

  const { submitForm, isLoading: isSubmitting, error: submitError } = useInterviewFormSubmission({
    formTemplateId,
    reportId: reportId || undefined,
    jobType,
    postcode,
  })

  /**
   * Handle interview completion
   */
  const handleInterviewComplete = useCallback(
    (autoPopulatedData: Map<string, any>) => {
      // Convert to proper interview field format
      const interviewFields = new Map<string, InterviewPopulatedField>()
      autoPopulatedData.forEach((value, fieldId) => {
        interviewFields.set(fieldId, {
          value,
          confidence: 85, // Default confidence for auto-populated fields
          source: 'direct',
        })
      })

      // Calculate merge result immediately for summary display
      const mergeResult = InterviewFormMerger.mergeInterviewWithForm({}, interviewFields, {
        overwriteExisting: false,
        minimumConfidence: 70,
        prioritizeInterview: false,
      })

      setAutoPopulatedFields(interviewFields)
      setMergeResult(mergeResult)
      setInterviewStatus('completed')
      setShowSummary(true)
    },
    []
  )

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    if (confirm('Are you sure you want to cancel this interview? Progress will be lost.')) {
      router.back()
    }
  }, [router])

  /**
   * Submit interview data and auto-populated fields
   */
  const handleSubmitData = useCallback(async () => {
    if (!autoPopulatedFields) return

    const result = await submitForm(autoPopulatedFields)

    if (result.success && result.submissionId) {
      // Redirect to form with pre-filled data
      router.push(
        `/dashboard/forms/predefined/${formTemplateId}?submissionId=${result.submissionId}&reportId=${reportId || ''}`
      )
    }
  }, [autoPopulatedFields, submitForm, formTemplateId, reportId, router])

  /**
   * Continue to form without interview
   */
  const handleSkipInterview = useCallback(() => {
    router.push(
      `/dashboard/forms/predefined/${formTemplateId}?reportId=${reportId || ''}`
    )
  }, [formTemplateId, reportId, router])

  if (!formTemplateId) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Form template ID is required to start an interview.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Guided Interview</h1>
        <p className="mt-2 text-gray-600">
          Answer quick questions to auto-populate your form fields in seconds
        </p>
        {reportId && (
          <p className="mt-1 text-sm text-gray-500">
            Linked to Report: <span className="font-medium">{reportId}</span>
          </p>
        )}
      </div>

      {/* Interview In Progress */}
      {interviewStatus === 'in_progress' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow">
            <GuidedInterviewPanel
              formTemplateId={formTemplateId}
              jobType={jobType}
              postcode={postcode}
              experienceLevel={experienceLevel as "novice" | "experienced" | "expert" | undefined}
              sessionId={sessionId}
              onComplete={handleInterviewComplete}
              onCancel={handleCancel}
              showAutoPopulatedFields={true}
            />
          </div>

          {/* Skip Interview Option */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={handleSkipInterview}
              className="text-gray-600"
            >
              Skip Interview
            </Button>
          </div>
        </div>
      )}

      {/* Interview Completed */}
      {interviewStatus === 'completed' && autoPopulatedFields && showSummary && mergeResult && (
        <div className="space-y-6">
          {/* Success Banner */}
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Interview completed successfully!</strong> Your form has been auto-populated
              with {autoPopulatedFields.size} fields.
            </AlertDescription>
          </Alert>

          {/* Completion Summary with Merge Details */}
          <InterviewCompletionSummary
            mergeResult={mergeResult}
            onContinue={handleSubmitData}
            showActions={true}
          />

          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Error State */}
      {interviewStatus === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            An error occurred during the interview. Please try again.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
