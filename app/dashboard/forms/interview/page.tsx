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
   * Convert interview fields to report/inspection form data format.
   * Maps question-library field IDs (e.g. temperatureCurrent, humidityCurrent) to keys
   * expected by the inspection NIR form (ambientTemperature, humidityLevel).
   */
  const convertInterviewFieldsToReportData = useCallback((fields: Map<string, InterviewPopulatedField>) => {
    const reportData: Record<string, any> = {}
    
    // Map interview/question-library field IDs to inspection/report field names
    const fieldMapping: Record<string, string> = {
      'sourceOfWater': 'sourceOfWater',
      'waterCategory': 'waterCategory',
      'waterClass': 'waterClass',
      'propertyAddress': 'propertyAddress',
      'propertyPostcode': 'propertyPostcode',
      'clientName': 'clientName',
      'clientContactDetails': 'clientContactDetails',
      'incidentDate': 'incidentDate',
      'technicianAttendanceDate': 'technicianAttendanceDate',
      'technicianName': 'technicianName',
      'affectedArea': 'affectedArea',
      'affectedAreaPercentage': 'affectedArea',
      'claimReferenceNumber': 'claimReferenceNumber',
      'buildingAge': 'buildingAge',
      'structureType': 'structureType',
      'hazardType': 'hazardType',
      'insuranceType': 'insuranceType',
      // Question library uses these; inspection NIR expects ambient/humidity
      'temperatureCurrent': 'ambientTemperature',
      'humidityCurrent': 'humidityLevel',
      'timeSinceLoss': 'timeSinceLoss',
    }

    fields.forEach((field, fieldId) => {
      const reportFieldName = fieldMapping[fieldId] || fieldId
      
      // Handle date fields - convert to YYYY-MM-DD format if needed
      if (reportFieldName.includes('Date') && field.value) {
        try {
          const date = new Date(field.value)
          if (!isNaN(date.getTime())) {
            reportData[reportFieldName] = date.toISOString().split('T')[0]
          } else {
            reportData[reportFieldName] = field.value
          }
        } catch {
          reportData[reportFieldName] = field.value
        }
      } else {
        reportData[reportFieldName] = field.value
      }
    })

    return reportData
  }, [])

  /**
   * Submit interview data and auto-populated fields - redirects to NEW inspection page
   */
  const handleSubmitData = useCallback(async () => {
    if (!autoPopulatedFields) {
      console.error('No auto-populated fields to submit')
      return
    }

    try {
      console.log('Preparing to open new inspection with interview data...', { 
        fieldsCount: autoPopulatedFields.size,
        formTemplateId 
      })
      
      // Convert interview fields to report data format
      const reportData = convertInterviewFieldsToReportData(autoPopulatedFields)
      
      // Encode the data as URL params for the new inspection page
      const encodedData = encodeURIComponent(JSON.stringify(reportData))
      const encodedMetadata = encodeURIComponent(JSON.stringify({
        fromInterview: true,
        interviewSessionId: searchParams.get('sessionId'),
        fieldsCount: autoPopulatedFields.size,
        averageConfidence: mergeResult?.statistics.averageConfidence || 85,
        timestamp: new Date().toISOString(),
      }))

      // Redirect to NEW inspection page with auto-populated data
      console.log('Redirecting to new inspection page with interview data')
      router.push(
        `/dashboard/inspections/new?interviewData=${encodedData}&interviewMetadata=${encodedMetadata}`
      )
    } catch (error) {
      console.error('Error preparing interview data:', error)
      alert(`Error preparing data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [autoPopulatedFields, convertInterviewFieldsToReportData, formTemplateId, router, searchParams, mergeResult])

  /**
   * Export interview summary
   */
  const handleExportSummary = useCallback(() => {
    if (!autoPopulatedFields || !mergeResult) {
      alert('No data to export')
      return
    }

    try {
      // Create export data
      const exportData = {
        interviewSummary: {
          fieldsMerged: mergeResult.statistics.totalFieldsMerged,
          newFieldsAdded: mergeResult.statistics.newFieldsAdded,
          fieldsUpdated: mergeResult.statistics.fieldsUpdated,
          averageConfidence: mergeResult.statistics.averageConfidence,
          formCompletion: Math.round(
            (mergeResult.statistics.totalFieldsMerged / (mergeResult.statistics.totalFieldsMerged + 5)) * 100
          ),
        },
        autoPopulatedFields: Object.fromEntries(autoPopulatedFields),
        mergedFields: mergeResult.mergedFields,
        timestamp: new Date().toISOString(),
        formTemplateId,
        reportId: reportId || null,
      }

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `interview-summary-${Date.now()}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting summary:', error)
      alert(`Error exporting summary: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [autoPopulatedFields, mergeResult, formTemplateId, reportId])

  /**
   * Continue to form without interview
   */
  const handleSkipInterview = useCallback(() => {
    if (reportId) {
      // Go back to the linked report form without interview auto-fill
      router.push(`/dashboard/reports/${reportId}/edit`)
    } else {
      // Fallback: go to reports list if no report context
      router.push('/dashboard/reports')
    }
  }, [reportId, router])

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
    <div className="min-h-screen h-full w-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Guided Interview</h1>
        <p className="mt-2 text-gray-600 dark:text-slate-400">
          Answer quick questions to auto-populate your form fields in seconds
        </p>
        {reportId && (
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">
            Linked to Report: <span className="font-medium">{reportId}</span>
          </p>
        )}
      </div>

      {/* Interview In Progress - Full Height Content */}
      {interviewStatus === 'in_progress' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-6xl mx-auto">
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
          </div>

          {/* Skip Interview Option - Fixed at bottom */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="max-w-6xl mx-auto flex justify-center">
              <Button
                variant="outline"
                onClick={handleSkipInterview}
                className="text-gray-600 dark:text-slate-400 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Skip Interview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Interview Completed - Full Height Content */}
      {interviewStatus === 'completed' && autoPopulatedFields && showSummary && mergeResult && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Success Banner */}
              <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-300">
                  <strong>Interview completed successfully!</strong> Your form has been auto-populated
                  with {autoPopulatedFields.size} fields.
                </AlertDescription>
              </Alert>

              {/* Completion Summary with Merge Details */}
              <InterviewCompletionSummary
                mergeResult={mergeResult}
                onContinue={handleSubmitData}
                onExport={handleExportSummary}
                showActions={true}
              />

              {submitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error State - Full Height */}
      {interviewStatus === 'error' && (
        <div className="flex-1 flex items-center justify-center px-6 py-6">
          <div className="max-w-2xl w-full">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                An error occurred during the interview. Please try again.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}
    </div>
  )
}
