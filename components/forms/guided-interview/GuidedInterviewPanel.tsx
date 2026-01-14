/**
 * Guided Interview Panel
 * Main component for premium guided interview flow
 * Orchestrates question progression, answer recording, and field auto-population
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { QuestionCard } from './QuestionCard'
import { ProgressRing } from './ProgressRing'
import { BottomActionBar } from './BottomActionBar'
import { AutoPopulatedFieldsDisplay } from './AutoPopulatedFieldsDisplay'
import type { Question } from '@/lib/interview'

/**
 * Interview state management
 */
interface InterviewState {
  sessionId: string
  currentTier: number
  currentQuestion: Question | null
  allQuestions: Question[]
  tieredQuestions: { tier1: Question[]; tier2: Question[]; tier3: Question[]; tier4: Question[] }
  answers: Map<string, any>
  autoPopulatedFields: Map<string, { value: any; confidence: number }>
  totalQuestions: number
  answeredQuestions: number
  progressPercentage: number
  estimatedDurationMinutes: number
  standardsCovered: string[]
  isLoading: boolean
  error: string | null
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR'
}

interface GuidedInterviewPanelProps {
  formTemplateId: string
  jobType?: string
  postcode?: string
  onComplete?: (autoPopulatedFields: Map<string, any>) => void
  onCancel?: () => void
  showAutoPopulatedFields?: boolean
}

/**
 * Main Interview Panel Component
 */
export function GuidedInterviewPanel({
  formTemplateId,
  jobType = 'WATER_DAMAGE',
  postcode,
  onComplete,
  onCancel,
  showAutoPopulatedFields = true,
}: GuidedInterviewPanelProps) {
  const [interviewState, setInterviewState] = useState<InterviewState>({
    sessionId: '',
    currentTier: 1,
    currentQuestion: null,
    allQuestions: [],
    tieredQuestions: { tier1: [], tier2: [], tier3: [], tier4: [] },
    answers: new Map(),
    autoPopulatedFields: new Map(),
    totalQuestions: 0,
    answeredQuestions: 0,
    progressPercentage: 0,
    estimatedDurationMinutes: 0,
    standardsCovered: [],
    isLoading: true,
    error: null,
    status: 'STARTED',
  })

  const [startTime] = useState(Date.now())

  /**
   * Initialize interview on mount
   */
  useEffect(() => {
    initializeInterview()
  }, [formTemplateId, jobType, postcode])

  /**
   * Start interview - fetch initial questions
   */
  const initializeInterview = useCallback(async () => {
    try {
      setInterviewState((prev) => ({ ...prev, isLoading: true, error: null }))

      const response = await fetch('/api/forms/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formTemplateId,
          jobType,
          postcode,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to start interview: ${response.statusText}`)
      }

      const data = await response.json()

      setInterviewState((prev) => ({
        ...prev,
        sessionId: data.sessionId,
        currentTier: 1,
        currentQuestion: data.questions[0],
        allQuestions: data.questions,
        tieredQuestions: data.tieredQuestions,
        totalQuestions: data.totalQuestions,
        estimatedDurationMinutes: data.estimatedDuration,
        standardsCovered: data.standardsCovered,
        isLoading: false,
        status: 'IN_PROGRESS',
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start interview'
      setInterviewState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        status: 'ERROR',
      }))
    }
  }, [formTemplateId, jobType, postcode])

  /**
   * Record answer and get next question
   */
  const handleAnswer = useCallback(
    async (answer: any) => {
      if (!interviewState.currentQuestion || !interviewState.sessionId) {
        return
      }

      try {
        setInterviewState((prev) => ({ ...prev, isLoading: true }))

        const questionId = interviewState.currentQuestion.id
        const newAnswers = new Map(interviewState.answers)
        newAnswers.set(questionId, answer)

        // Record answer in database
        const response = await fetch('/api/forms/interview/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: interviewState.sessionId,
            questionId,
            answer,
            confidence: 100,
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to submit answer: ${response.statusText}`)
        }

        const progressData = await response.json()

        // Process field mappings from this question
        const newAutoPopulated = new Map(interviewState.autoPopulatedFields)
        interviewState.currentQuestion.fieldMappings?.forEach((mapping) => {
          let value = mapping.value
          if (mapping.transformer) {
            try {
              value = mapping.transformer(answer, {})
            } catch (e) {
              console.error('Transformer error:', e)
            }
          } else if (value === undefined) {
            value = answer
          }

          newAutoPopulated.set(mapping.formFieldId, {
            value,
            confidence: mapping.confidence,
          })
        })

        // Find next question
        let nextQuestion: Question | null = null

        // Check skip logic
        if (interviewState.currentQuestion.skipLogic) {
          for (const rule of interviewState.currentQuestion.skipLogic) {
            if (answer === rule.answerValue) {
              nextQuestion = interviewState.allQuestions.find((q) => q.id === rule.nextQuestionId) || null
              break
            }
          }
        }

        // If no skip, find next question respecting conditionals
        if (!nextQuestion) {
          const currentIndex = interviewState.allQuestions.findIndex(
            (q) => q.id === interviewState.currentQuestion!.id
          )

          for (let i = currentIndex + 1; i < interviewState.allQuestions.length; i++) {
            const q = interviewState.allQuestions[i]

            // Check conditional shows
            if (q.conditionalShows && q.conditionalShows.length > 0) {
              const allConditionsMet = q.conditionalShows.every((cond) => {
                const answer = newAnswers.get(cond.field)
                return evaluateCondition(answer, cond)
              })

              if (allConditionsMet) {
                nextQuestion = q
                break
              }
            } else {
              nextQuestion = q
              break
            }
          }
        }

        // Update tier based on next question
        let newTier = 1
        if (nextQuestion?.sequenceNumber) {
          if (nextQuestion.sequenceNumber <= 5) newTier = 1
          else if (nextQuestion.sequenceNumber <= 8) newTier = 2
          else if (nextQuestion.sequenceNumber <= 13) newTier = 3
          else newTier = 4
        }

        const newAnsweredCount = interviewState.answeredQuestions + 1
        const newProgressPercentage = Math.round(
          (newAnsweredCount / interviewState.totalQuestions) * 100
        )

        setInterviewState((prev) => ({
          ...prev,
          answers: newAnswers,
          autoPopulatedFields: newAutoPopulated,
          currentQuestion: nextQuestion,
          currentTier: newTier,
          answeredQuestions: newAnsweredCount,
          progressPercentage: newProgressPercentage,
          status: nextQuestion ? 'IN_PROGRESS' : 'COMPLETED',
          isLoading: false,
        }))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to submit answer'
        setInterviewState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }))
      }
    },
    [interviewState]
  )

  /**
   * Navigate to previous question
   */
  const handlePrevious = useCallback(() => {
    if (!interviewState.currentQuestion) return

    const currentIndex = interviewState.allQuestions.findIndex(
      (q) => q.id === interviewState.currentQuestion!.id
    )

    if (currentIndex > 0) {
      // Find previous question respecting conditionals
      for (let i = currentIndex - 1; i >= 0; i--) {
        const q = interviewState.allQuestions[i]

        // Check if this question should be shown
        if (q.conditionalShows && q.conditionalShows.length > 0) {
          const allConditionsMet = q.conditionalShows.every((cond) => {
            const answer = interviewState.answers.get(cond.field)
            return evaluateCondition(answer, cond)
          })

          if (allConditionsMet) {
            let newTier = 1
            if (q.sequenceNumber) {
              if (q.sequenceNumber <= 5) newTier = 1
              else if (q.sequenceNumber <= 8) newTier = 2
              else if (q.sequenceNumber <= 13) newTier = 3
              else newTier = 4
            }

            setInterviewState((prev) => ({
              ...prev,
              currentQuestion: q,
              currentTier: newTier,
            }))
            break
          }
        } else {
          let newTier = 1
          if (q.sequenceNumber) {
            if (q.sequenceNumber <= 5) newTier = 1
            else if (q.sequenceNumber <= 8) newTier = 2
            else if (q.sequenceNumber <= 13) newTier = 3
            else newTier = 4
          }

          setInterviewState((prev) => ({
            ...prev,
            currentQuestion: q,
            currentTier: newTier,
          }))
          break
        }
      }
    }
  }, [interviewState])

  /**
   * Jump to specific question (from progress ring)
   */
  const handleJumpToQuestion = useCallback((questionId: string) => {
    const question = interviewState.allQuestions.find((q) => q.id === questionId)
    const questionIndex = interviewState.allQuestions.findIndex((q) => q.id === questionId)
    const currentIndex = interviewState.allQuestions.findIndex(
      (q) => q.id === interviewState.currentQuestion!.id
    )

    // Can only jump to questions we've passed or already answered
    if (question && questionIndex <= currentIndex) {
      let newTier = 1
      if (question.sequenceNumber) {
        if (question.sequenceNumber <= 5) newTier = 1
        else if (question.sequenceNumber <= 8) newTier = 2
        else if (question.sequenceNumber <= 13) newTier = 3
        else newTier = 4
      }

      setInterviewState((prev) => ({
        ...prev,
        currentQuestion: question,
        currentTier: newTier,
      }))
    }
  }, [interviewState])

  /**
   * Complete interview
   */
  const handleComplete = useCallback(() => {
    if (onComplete) {
      onComplete(interviewState.autoPopulatedFields)
    }
  }, [interviewState.autoPopulatedFields, onComplete])

  /**
   * Evaluate condition for conditional shows
   */
  const evaluateCondition = (answer: any, condition: any): boolean => {
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

  // Render loading state
  if (interviewState.isLoading && !interviewState.currentQuestion) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="pt-8">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Starting interview...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render error state
  if (interviewState.status === 'ERROR') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="pt-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{interviewState.error}</AlertDescription>
          </Alert>
          <Button onClick={initializeInterview} className="mt-4 w-full">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Render completion state
  if (interviewState.status === 'COMPLETED') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <CardTitle>Interview Complete</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Questions Answered</p>
              <p className="text-2xl font-bold">{interviewState.answeredQuestions}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fields Auto-Populated</p>
              <p className="text-2xl font-bold">{interviewState.autoPopulatedFields.size}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average Confidence</p>
              <p className="text-2xl font-bold">
                {interviewState.autoPopulatedFields.size > 0
                  ? Math.round(
                      Array.from(interviewState.autoPopulatedFields.values()).reduce(
                        (sum, f) => sum + f.confidence,
                        0
                      ) / interviewState.autoPopulatedFields.size
                    )
                  : 0}
                %
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Time Spent</p>
              <p className="text-2xl font-bold">
                {Math.round((Date.now() - startTime) / 60000)} min
              </p>
            </div>
          </div>

          {showAutoPopulatedFields && interviewState.autoPopulatedFields.size > 0 && (
            <AutoPopulatedFieldsDisplay fields={interviewState.autoPopulatedFields} />
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={handleComplete} className="flex-1">
              Apply Auto-Populated Fields
            </Button>
            <Button onClick={onCancel} variant="outline" className="flex-1">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render active interview
  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle>Guided Interview - Tier {interviewState.currentTier}</CardTitle>
              <CardDescription>
                {interviewState.answeredQuestions} of {interviewState.totalQuestions} questions
                answered (~{interviewState.estimatedDurationMinutes} min total)
              </CardDescription>
            </div>
            <ProgressRing
              current={interviewState.answeredQuestions}
              total={interviewState.totalQuestions}
              tier={interviewState.currentTier}
              onQuestionSelect={handleJumpToQuestion}
              allQuestions={interviewState.allQuestions}
            />
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <Progress value={interviewState.progressPercentage} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {interviewState.progressPercentage}% complete
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Current question */}
          {interviewState.currentQuestion && (
            <QuestionCard
              question={interviewState.currentQuestion}
              onAnswer={handleAnswer}
              isLoading={interviewState.isLoading}
              answeredQuestions={interviewState.answeredQuestions}
              totalQuestions={interviewState.totalQuestions}
            />
          )}

          {/* Auto-populated fields display */}
          {showAutoPopulatedFields && interviewState.autoPopulatedFields.size > 0 && (
            <div className="border-t pt-4">
              <AutoPopulatedFieldsDisplay fields={interviewState.autoPopulatedFields} />
            </div>
          )}

          {/* Standards coverage */}
          {interviewState.standardsCovered.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-blue-900 mb-2">Standards Covered:</p>
              <div className="flex flex-wrap gap-2">
                {interviewState.standardsCovered.map((std) => (
                  <span
                    key={std}
                    className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded"
                  >
                    {std}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom navigation */}
      <BottomActionBar
        onPrevious={handlePrevious}
        onNext={() => {}} // Handled by QuestionCard
        onComplete={
          interviewState.status === 'COMPLETED' ? handleComplete : undefined
        }
        canGoPrevious={
          interviewState.allQuestions.findIndex((q) => q.id === interviewState.currentQuestion?.id) >
          0
        }
        canGoNext={!!interviewState.currentQuestion}
        isComplete={interviewState.status === 'COMPLETED'}
        onCancel={onCancel}
      />
    </div>
  )
}
