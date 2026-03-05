'use client'

import { useState, useCallback, useEffect } from 'react'
import type {
  UserAnalyticsSummary,
  TemplatePerformanceAnalytics,
} from '@/lib/forms/analytics'

/**
 * Hook for accessing interview analytics data
 */
interface UseInterviewAnalyticsOptions {
  userId?: string
  templateId?: string
  type?: 'user' | 'template' | 'aggregate'
  autoFetch?: boolean
}

interface AnalyticsState {
  data: any | null
  isLoading: boolean
  error: string | null
  lastFetched?: Date
}

export function useInterviewAnalytics(options: UseInterviewAnalyticsOptions = {}) {
  const { userId, templateId, type = 'user', autoFetch = true } = options

  const [state, setState] = useState<AnalyticsState>({
    data: null,
    isLoading: false,
    error: null,
  })

  /**
   * Fetch analytics data
   */
  const fetchAnalytics = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      let url = '/api/forms/interview/analytics?'

      if (type === 'user' && userId) {
        url += `userId=${userId}`
      } else if (type === 'template' && templateId) {
        url += `templateId=${templateId}`
      } else if (type === 'aggregate') {
        url += 'type=aggregate'
      } else if (userId) {
        url += `userId=${userId}`
      }

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      setState((prev) => ({
        ...prev,
        isLoading: false,
        data,
        lastFetched: new Date(),
      }))

      return data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch analytics'
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }))
      throw error
    }
  }, [type, userId, templateId])

  /**
   * Auto-fetch on mount if enabled
   */
  useEffect(() => {
    if (autoFetch) {
      fetchAnalytics()
    }
  }, [autoFetch, fetchAnalytics])

  /**
   * Refresh analytics data
   */
  const refresh = useCallback(() => {
    return fetchAnalytics()
  }, [fetchAnalytics])

  return {
    ...state,
    fetchAnalytics,
    refresh,
  }
}

/**
 * Hook for tracking interview session completion
 */
export function useInterviewCompletion() {
  const [isTracking, setIsTracking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Track interview completion
   */
  const trackCompletion = useCallback(
    async (
      sessionId: string,
      autoPopulatedFieldsCount: number,
      averageConfidence: number,
      conflictCount: number
    ) => {
      try {
        setIsTracking(true)
        setError(null)

        const response = await fetch('/api/forms/interview/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            autoPopulatedFieldsCount,
            averageConfidence,
            conflictCount,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        setIsTracking(false)

        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to track completion'
        setError(errorMessage)
        setIsTracking(false)
        throw err
      }
    },
    []
  )

  return {
    trackCompletion,
    isTracking,
    error,
  }
}
