/**
 * Guided Interview Panel
 * Main component for premium guided interview flow
 * Orchestrates question progression, answer recording, and field auto-population
 */

'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, Loader2, CheckCircle2, Lock, Crown } from 'lucide-react'
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
  experienceLevel?: "novice" | "experienced" | "expert"
  sessionId?: string
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
  experienceLevel,
  sessionId: resumeSessionId,
  onComplete,
  onCancel,
  showAutoPopulatedFields = true,
}: GuidedInterviewPanelProps) {
  const router = useRouter()
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)
  const [lockedTier, setLockedTier] = useState<number | null>(null)
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
  const isInitializingRef = useRef(false)
  const hasInitializedRef = useRef(false)

  /**
   * Initialize interview on mount - only once
   */
  useEffect(() => {
    console.log('[INIT] useEffect triggered', {
      hasInitialized: hasInitializedRef.current,
      isInitializing: isInitializingRef.current,
      resumeSessionId,
    })

    // Prevent multiple initializations - only check refs (not state, which is stale in closure)
    if (hasInitializedRef.current) {
      console.log('[INIT] Already initialized, skipping')
      return
    }

    if (isInitializingRef.current) {
      console.log('[INIT] Already initializing, skipping')
      return
    }

    console.log('[INIT] Starting initialization...')

    const init = async () => {
      try {
        console.log('[INIT] Init function called', { resumeSessionId })
        if (resumeSessionId) {
          console.log('[INIT] Restoring session:', resumeSessionId)
          await restoreSession(resumeSessionId)
        } else {
          console.log('[INIT] Starting new interview')
          await initializeInterview()
        }
      } catch (error) {
        console.error('[INIT] Error initializing interview:', error)
        console.error('[INIT] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
        // Reset refs on error so user can retry
        hasInitializedRef.current = false
        isInitializingRef.current = false
        setInterviewState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to initialize interview',
          status: 'ERROR',
        }))
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount - don't include state or callbacks to prevent re-runs

  /**
   * Start interview - fetch initial questions
   */
  const initializeInterview = useCallback(async () => {
    console.log('[INIT_INTERVIEW] Called', {
      isInitializing: isInitializingRef.current,
      hasInitialized: hasInitializedRef.current,
    })

    // Prevent multiple calls - only check refs, not state (state causes re-renders)
    if (isInitializingRef.current) {
      console.log('[INIT_INTERVIEW] Already initializing, aborting')
      return
    }

    if (hasInitializedRef.current) {
      console.log('[INIT_INTERVIEW] Already initialized, aborting')
      return
    }

    console.log('[INIT_INTERVIEW] Setting isInitializingRef to true')
    isInitializingRef.current = true

    try {
      console.log('[INIT_INTERVIEW] Setting loading state')
      setInterviewState((prev) => {
        console.log('[INIT_INTERVIEW] Previous state:', { isLoading: prev.isLoading, sessionId: prev.sessionId })
        return { ...prev, isLoading: true, error: null }
      })

      console.log('[INIT_INTERVIEW] Starting interview with:', { formTemplateId, jobType, postcode, experienceLevel })

      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        console.error('Interview start request timed out after 30 seconds')
        controller.abort()
      }, 30000) // 30 second timeout

      console.log('[INIT_INTERVIEW] Making API request to /api/forms/interview/start')
      const response = await fetch('/api/forms/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formTemplateId,
          jobType,
          postcode,
          experienceLevel,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      
      console.log('[INIT_INTERVIEW] API response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || errorData.details || response.statusText
        console.error('[INIT_INTERVIEW] API error:', { status: response.status, error: errorMessage, errorData })
        throw new Error(`Failed to start interview: ${errorMessage}`)
      }

      console.log('[INIT_INTERVIEW] Parsing response JSON...')
      const data = await response.json()
      
      console.log('[INIT_INTERVIEW] Response data parsed:', {
        hasSessionId: !!data.sessionId,
        sessionId: data.sessionId,
        questionsCount: data.questions?.length || 0,
        totalQuestions: data.totalQuestions,
        hasTieredQuestions: !!data.tieredQuestions,
        tier1Count: data.tieredQuestions?.tier1?.length || 0,
        tier2Count: data.tieredQuestions?.tier2?.length || 0,
        tier3Count: data.tieredQuestions?.tier3?.length || 0,
        tier4Count: data.tieredQuestions?.tier4?.length || 0,
        fullData: data,
      })

      // Validate response data
      if (!data || !data.sessionId) {
        console.error('[INIT_INTERVIEW] Invalid response: missing sessionId', data)
        throw new Error('Invalid response from server: missing sessionId')
      }

      console.log('[INIT_INTERVIEW] Validating questions...', {
        hasQuestions: !!data.questions,
        isArray: Array.isArray(data.questions),
        length: data.questions?.length || 0,
      })

      if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
        console.error('[INIT_INTERVIEW] No questions in response:', {
          questions: data.questions,
          tieredQuestions: data.tieredQuestions,
          allData: data,
        })
        throw new Error('No questions returned from server. Please check your subscription tier.')
      }

      // Push sessionId to URL for resume capability
      if (typeof window !== 'undefined' && data.sessionId) {
        const url = new URL(window.location.href)
        url.searchParams.set('sessionId', data.sessionId)
        window.history.replaceState({}, '', url.toString())
      }

      // Flatten all questions from all tiers for allQuestions
      const allQuestionsFlat = [
        ...(data.tieredQuestions?.tier1 || []),
        ...(data.tieredQuestions?.tier2 || []),
        ...(data.tieredQuestions?.tier3 || []),
        ...(data.tieredQuestions?.tier4 || []),
      ]

      // Use questions from response, or fallback to flattened questions
      const questionsToUse = data.questions && data.questions.length > 0 
        ? data.questions 
        : allQuestionsFlat

      const firstQuestion = questionsToUse[0] || allQuestionsFlat[0] || null

      if (!firstQuestion) {
        throw new Error('No questions available to start the interview')
      }

      console.log('[INIT_INTERVIEW] Preparing state update:', {
        sessionId: data.sessionId,
        firstQuestionId: firstQuestion.id,
        firstQuestionText: firstQuestion.text?.substring(0, 50),
        totalQuestions: data.totalQuestions || allQuestionsFlat.length,
        questionsCount: questionsToUse.length,
        allQuestionsFlatCount: allQuestionsFlat.length,
      })

      console.log('[INIT_INTERVIEW] Calling setInterviewState...')
      setInterviewState((prev) => {
        const newState = {
          ...prev,
          sessionId: data.sessionId,
          currentTier: data.currentTier || 1,
          currentQuestion: firstQuestion,
          allQuestions: allQuestionsFlat.length > 0 ? allQuestionsFlat : questionsToUse,
          tieredQuestions: data.tieredQuestions || { tier1: [], tier2: [], tier3: [], tier4: [] },
          totalQuestions: data.totalQuestions || allQuestionsFlat.length || questionsToUse.length,
          estimatedDurationMinutes: data.estimatedDuration || 10,
          standardsCovered: data.standardsCovered || [],
          isLoading: false,
          status: 'IN_PROGRESS' as const,
        }
        console.log('[INIT_INTERVIEW] New state:', {
          sessionId: newState.sessionId,
          isLoading: newState.isLoading,
          status: newState.status,
          hasCurrentQuestion: !!newState.currentQuestion,
          totalQuestions: newState.totalQuestions,
        })
        return newState
      })
      
      console.log('[INIT_INTERVIEW] Setting isInitializingRef to false')
      isInitializingRef.current = false
      hasInitializedRef.current = true
      console.log('[INIT_INTERVIEW] Interview initialized successfully')
    } catch (error) {
      let errorMessage = 'Failed to start interview'
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please try again.'
        } else {
          errorMessage = error.message
        }
      }
      
      console.error('[INIT_INTERVIEW] Error starting interview:', error)
      console.error('[INIT_INTERVIEW] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      isInitializingRef.current = false
      hasInitializedRef.current = false // Allow retry on error
      setInterviewState((prev) => {
        console.log('[INIT_INTERVIEW] Setting error state')
        return {
          ...prev,
          isLoading: false,
          error: errorMessage,
          status: 'ERROR',
        }
      })
    }
  }, [formTemplateId, jobType, postcode, experienceLevel]) // Removed interviewState dependencies to prevent re-creation

  /**
   * Restore session from saved answers
   */
  const restoreSession = useCallback(async (sessionId: string) => {
    console.log('[RESTORE_SESSION] Called', {
      sessionId,
      isInitializing: isInitializingRef.current,
      hasInitialized: hasInitializedRef.current,
    })

    // Prevent multiple calls - only check refs
    if (isInitializingRef.current) {
      console.log('[RESTORE_SESSION] Already initializing, aborting')
      return
    }

    if (hasInitializedRef.current) {
      console.log('[RESTORE_SESSION] Already initialized, aborting')
      return
    }

    isInitializingRef.current = true

    try {
      console.log('[RESTORE_SESSION] Setting loading state')
      setInterviewState((prev) => ({ ...prev, isLoading: true, error: null }))

      // Fetch session data with stored answers
      const sessionResponse = await fetch(`/api/interviews/${sessionId}`)
      if (!sessionResponse.ok) {
        // Session not found — start fresh
        console.warn(`Session ${sessionId} not found, starting fresh interview`)
        isInitializingRef.current = false
        await initializeInterview()
        return
      }
      
      const responseData = await sessionResponse.json()
      if (!responseData || !responseData.session) {
        console.warn(`Session ${sessionId} data invalid, starting fresh interview`)
        isInitializingRef.current = false
        await initializeInterview()
        return
      }
      
      const { session: savedSession } = responseData

      // Re-initialize questions via start API
      const startResponse = await fetch('/api/forms/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formTemplateId: savedSession.formTemplateId,
          jobType,
          postcode,
        }),
      })

      if (!startResponse.ok) {
        throw new Error('Failed to restore interview questions')
      }
      const startData = await startResponse.json()

      // Rebuild answers map from stored responses
      const restoredAnswers = new Map<string, any>()
      if (savedSession.responses && Array.isArray(savedSession.responses)) {
        for (const resp of savedSession.responses) {
          try {
            // Try to parse answerValue (JSON) or use answer directly
            const answerData = resp.answerValue || resp.answer
            if (answerData) {
              try {
                restoredAnswers.set(resp.questionId, JSON.parse(answerData))
              } catch {
                restoredAnswers.set(resp.questionId, answerData)
              }
            }
          } catch (err) {
            console.warn('Error parsing response:', resp, err)
          }
        }
      }

      // Find the next unanswered question
      let nextQuestion: Question | null = null
      for (const q of startData.questions) {
        if (!restoredAnswers.has(q.id)) {
          nextQuestion = q
          break
        }
      }

      // Calculate tier
      let currentTier = 1
      if (nextQuestion?.sequenceNumber) {
        if (nextQuestion.sequenceNumber <= 5) currentTier = 1
        else if (nextQuestion.sequenceNumber <= 8) currentTier = 2
        else if (nextQuestion.sequenceNumber <= 13) currentTier = 3
        else currentTier = 4
      }

      const answeredCount = restoredAnswers.size
      const totalQ = startData.totalQuestions
      const isComplete = !nextQuestion || answeredCount >= totalQ

      setInterviewState((prev) => ({
        ...prev,
        sessionId: savedSession.id,
        currentTier,
        currentQuestion: nextQuestion || startData.questions[startData.questions.length - 1],
        allQuestions: startData.questions,
        tieredQuestions: startData.tieredQuestions,
        answers: restoredAnswers,
        totalQuestions: totalQ,
        answeredQuestions: answeredCount,
        progressPercentage: totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0,
        estimatedDurationMinutes: startData.estimatedDuration,
        standardsCovered: startData.standardsCovered,
        isLoading: false,
        status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
      }))
      
      console.log('[RESTORE_SESSION] Setting isInitializingRef to false')
      isInitializingRef.current = false
      hasInitializedRef.current = true
      console.log('[RESTORE_SESSION] Session restored successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to restore session'
      console.error('[RESTORE_SESSION] Error restoring session:', error)
      console.error('[RESTORE_SESSION] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      isInitializingRef.current = false
      hasInitializedRef.current = false // Allow retry on error
      setInterviewState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        status: 'ERROR',
      }))
    }
  }, [formTemplateId, jobType, postcode, initializeInterview])

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
      <Card className="w-full h-full flex flex-col">
        <CardContent className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Starting interview...</p>
          {interviewState.error && (
            <div className="mt-4 max-w-md">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{interviewState.error}</AlertDescription>
              </Alert>
              <Button 
                onClick={() => {
                  isInitializingRef.current = false
                  hasInitializedRef.current = false
                  initializeInterview()
                }} 
                className="mt-4 w-full"
              >
                Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Render error state
  if (interviewState.status === 'ERROR') {
    return (
      <Card className="w-full h-full flex flex-col">
        <CardContent className="flex-1 flex flex-col pt-8">
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
      <Card className="w-full h-full flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            <CardTitle className="text-gray-900 dark:text-white">Interview Complete</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-4">
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
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex flex-col">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)] items-start">
          {/* Left: Hero question area */}
          <div className="space-y-4">
            {/* Tier + progress header */}
            <Card className="border border-border/70 bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-slate-900 dark:to-slate-950 shadow-sm">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 rounded-full bg-sky-100/80 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                    <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
                    Tier {interviewState.currentTier} · Essential flow
                  </div>
                  <div>
                    <CardTitle className="text-xl sm:text-2xl tracking-tight text-gray-900 dark:text-gray-50">
                      Guided Interview
                    </CardTitle>
                    <CardDescription className="text-sm text-gray-600 dark:text-slate-400">
                      {interviewState.answeredQuestions} of {interviewState.totalQuestions} questions
                      {' '}answered · ~{interviewState.estimatedDurationMinutes} min total
                    </CardDescription>
                  </div>
                </div>
                <div className="mt-3 sm:mt-0 flex items-center gap-4">
                  <div className="hidden sm:block text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Overall progress
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {interviewState.progressPercentage}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {interviewState.answeredQuestions} / {interviewState.totalQuestions}
                    </p>
                  </div>
                  <ProgressRing
                    current={interviewState.answeredQuestions}
                    total={interviewState.totalQuestions}
                    tier={interviewState.currentTier}
                    onQuestionSelect={handleJumpToQuestion}
                    allQuestions={interviewState.allQuestions}
                    userTierLevel={
                      interviewState.currentTier <= 1
                        ? 'STANDARD'
                        : interviewState.currentTier <= 2
                        ? 'PREMIUM'
                        : 'ENTERPRISE'
                    }
                    onUpgrade={(tier) => {
                      setLockedTier(tier)
                      setShowUpgradePrompt(true)
                    }}
                  />
                </div>
              </CardHeader>
            </Card>

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
          </div>

          {/* Right: Context & standards sidebar */}
          <div className="space-y-4">
            {/* Snapshot metrics */}
            <Card className="border border-border/70 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground">
                  Interview snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Answered</p>
                  <p className="mt-0.5 text-base font-semibold text-foreground">
                    {interviewState.answeredQuestions} / {interviewState.totalQuestions}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tier</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800/70 dark:text-slate-100">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Tier {interviewState.currentTier}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Estimated time</p>
                  <p className="mt-0.5 text-base font-semibold text-foreground">
                    ~{interviewState.estimatedDurationMinutes} min
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completion</p>
                  <p className="mt-0.5 text-base font-semibold text-foreground">
                    {interviewState.progressPercentage}%
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Auto-populated fields display */}
            {showAutoPopulatedFields && interviewState.autoPopulatedFields.size > 0 && (
              <Card className="border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-900/20 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    Auto-populated fields
                  </CardTitle>
                  <CardDescription className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                    Review which report fields will be filled automatically as you answer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-h-64 overflow-y-auto pr-1">
                  <AutoPopulatedFieldsDisplay fields={interviewState.autoPopulatedFields} />
                </CardContent>
              </Card>
            )}

            {/* Standards coverage */}
            {interviewState.standardsCovered.length > 0 && (
              <Card className="border border-blue-200/80 dark:border-blue-900/70 bg-blue-50/80 dark:bg-blue-950/40 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    Standards coverage
                  </CardTitle>
                  <CardDescription className="text-xs text-blue-800/80 dark:text-blue-300/80">
                    Live view of IICRC / NCC / AS references touched by this interview.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {interviewState.standardsCovered.map((std) => (
                      <span
                        key={std}
                        className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-medium text-blue-800 dark:bg-blue-900/70 dark:text-blue-100"
                      >
                        {std}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <BottomActionBar
        onPrevious={handlePrevious}
        onNext={() => {}} // Handled by QuestionCard
        onComplete={interviewState.status === 'COMPLETED' ? handleComplete : undefined}
        canGoPrevious={
          interviewState.allQuestions.findIndex(
            (q) => q.id === interviewState.currentQuestion?.id
          ) > 0
        }
        canGoNext={!!interviewState.currentQuestion}
        isComplete={interviewState.status === 'COMPLETED'}
        onCancel={onCancel}
      />

      {/* Tier Gating - Upgrade Prompt */}
      {showUpgradePrompt && lockedTier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center">
                  <Lock className="text-white" size={24} />
                </div>
                <div>
                  <CardTitle>Upgrade Required</CardTitle>
                  <CardDescription>Tier {lockedTier} questions are locked</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Crown className="h-4 w-4" />
                <AlertDescription>
                  To access Tier {lockedTier} questions, you need to upgrade to{' '}
                  {lockedTier <= 2 ? 'Premium' : 'Enterprise'} plan.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowUpgradePrompt(false)
                    setLockedTier(null)
                  }}
                  className="flex-1"
                >
                  Continue with Current Tier
                </Button>
                <Button
                  onClick={() => {
                    router.push('/dashboard/pricing?upgrade=true')
                  }}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
