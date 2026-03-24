/**
 * Interview Question & Answer Summary
 * Displays a read-only review of all questions and answers after interview completion
 */

'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Download } from 'lucide-react'
import type { InterviewQuestionAnswer } from './GuidedInterviewPanel'

interface InterviewQuestionAnswerSummaryProps {
  questionsAndAnswers: InterviewQuestionAnswer[]
  onBackToReports?: () => void
  onGoToReport?: (reportId: string) => void
  onExport?: () => void
  reportId?: string | null
}

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export function InterviewQuestionAnswerSummary({
  questionsAndAnswers,
  onBackToReports,
  onGoToReport,
  onExport,
  reportId,
}: InterviewQuestionAnswerSummaryProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-gray-900 dark:text-white">Interview Summary</CardTitle>
          </div>
          <CardDescription className="text-gray-600 dark:text-slate-400">
            Review your questions and answers below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {questionsAndAnswers.map((qa, index) => (
              <div
                key={qa.questionId}
                className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/30 p-4"
              >
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Question {index + 1}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  {qa.questionText}
                </p>
                <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                  {formatAnswer(qa.answer)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        {onExport && (
          <Button
            variant="outline"
            onClick={onExport}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export summary
          </Button>
        )}
        {reportId && onGoToReport && (
          <Button
            onClick={() => onGoToReport(reportId)}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Go to report
          </Button>
        )}
        {onBackToReports && (
          <Button
            variant={reportId && onGoToReport ? 'outline' : 'default'}
            onClick={onBackToReports}
          >
            Back to reports
          </Button>
        )}
      </div>
    </div>
  )
}
