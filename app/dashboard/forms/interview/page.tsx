'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { GuidedInterviewPanel, InterviewQuestionAnswerSummary } from '@/components/forms/guided-interview'
import type { InterviewQuestionAnswer } from '@/components/forms/guided-interview'

/**
 * Guided Interview Page
 * Conduct interview and review question & answer summary (no auto-population).
 * Route: /dashboard/forms/interview?formTemplateId=<id>&reportId=<id>&sessionId=<id>
 * View-only summary: ?sessionId=<id> (no formTemplateId) shows completed interview Q&A.
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

  const [interviewStatus, setInterviewStatus] = useState<'in_progress' | 'completed' | 'error' | 'loading'>(
    'in_progress'
  )
  const [questionsAndAnswers, setQuestionsAndAnswers] = useState<InterviewQuestionAnswer[] | null>(
    null
  )
  const [viewOnlyReportId, setViewOnlyReportId] = useState<string | null>(null)

  // View-only summary: when opened with sessionId only (e.g. from reports "View summary")
  useEffect(() => {
    if (!sessionId || formTemplateId) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/interviews/${sessionId}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        const session = data.session
        if (!session || session.status !== 'COMPLETED' || cancelled) {
          if (!cancelled) router.push('/dashboard/reports')
          return
        }
        const qa: InterviewQuestionAnswer[] = (session.responses || []).map((r: { questionId: string; questionText: string; answerValue: string | null }) => ({
          questionId: r.questionId,
          questionText: r.questionText || '',
          answer: r.answerValue != null ? (() => { try { return JSON.parse(r.answerValue) } catch { return r.answerValue } })() : null,
        }))
        if (!cancelled) {
          setQuestionsAndAnswers(qa)
          setViewOnlyReportId(session.reportId ?? null)
          setInterviewStatus('completed')
        }
      } catch {
        if (!cancelled) setInterviewStatus('error')
      }
    }
    setInterviewStatus('loading')
    load()
    return () => { cancelled = true }
  }, [sessionId, formTemplateId, router])

  const handleInterviewComplete = useCallback(
    async (qa: InterviewQuestionAnswer[]) => {
      setQuestionsAndAnswers(qa)
      setInterviewStatus('completed')

      const sessionIdForSave = searchParams.get('sessionId')
      if (sessionIdForSave) {
        try {
          await fetch(`/api/interviews/${sessionIdForSave}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'COMPLETED' }),
          })
        } catch {
          // Non-blocking: summary still shown
        }
      }
    },
    [searchParams]
  )

  const handleCancel = useCallback(() => {
    if (confirm('Are you sure you want to cancel this interview? Progress will be lost.')) {
      router.back()
    }
  }, [router])

  const handleBackToReports = useCallback(() => {
    router.push('/dashboard/reports')
  }, [router])

  const handleGoToReport = useCallback(
    (id: string) => {
      router.push(`/dashboard/reports/${id}`)
    },
    [router]
  )

  const handleExportSummary = useCallback(() => {
    if (!questionsAndAnswers) return
    try {
      const exportData = {
        interviewSummary: questionsAndAnswers.map((qa) => ({
          question: qa.questionText,
          answer:
            typeof qa.answer === 'string'
              ? qa.answer
              : Array.isArray(qa.answer)
                ? qa.answer.join(', ')
                : JSON.stringify(qa.answer),
        })),
        timestamp: new Date().toISOString(),
        reportId: reportId || null,
      }
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
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [questionsAndAnswers, reportId])

  const handleSkipInterview = useCallback(() => {
    if (reportId) {
      router.push(`/dashboard/reports/${reportId}`)
    } else {
      router.push('/dashboard/reports')
    }
  }, [reportId, router])

  const reportIdOrViewOnly = reportId || viewOnlyReportId
  if (!formTemplateId && !sessionId) {
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
      <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Guided Interview</h1>
        <p className="mt-2 text-gray-600 dark:text-slate-400">
          Answer questions to capture details for this report
        </p>
        {reportId && (
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">
            Linked to Report: <span className="font-medium">{reportId}</span>
          </p>
        )}
      </div>

      {interviewStatus === 'in_progress' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-6xl mx-auto">
              <GuidedInterviewPanel
                formTemplateId={formTemplateId}
                jobType={jobType}
                postcode={postcode}
                experienceLevel={experienceLevel as 'novice' | 'experienced' | 'expert' | undefined}
                sessionId={sessionId}
                reportId={reportId || undefined}
                onComplete={handleInterviewComplete}
                onCancel={handleCancel}
                showAutoPopulatedFields={false}
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="max-w-6xl mx-auto flex justify-center">
              <button
                type="button"
                onClick={handleSkipInterview}
                className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white underline"
              >
                Skip interview
              </button>
            </div>
          </div>
        </div>
      )}

      {interviewStatus === 'completed' && questionsAndAnswers && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-300">
                <strong>Interview completed.</strong> Review your answers below.
              </AlertDescription>
            </Alert>
            <InterviewQuestionAnswerSummary
              questionsAndAnswers={questionsAndAnswers}
              onBackToReports={handleBackToReports}
              onGoToReport={reportIdOrViewOnly ? handleGoToReport : undefined}
              onExport={handleExportSummary}
              reportId={reportIdOrViewOnly}
            />
          </div>
        </div>
      )}

      {interviewStatus === 'loading' && (
        <div className="flex-1 flex items-center justify-center px-6 py-6">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Loading interview summary...</p>
          </div>
        </div>
      )}

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
