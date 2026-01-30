/**
 * Error Handler — classification, retry logic, and dead-letter handling
 * for agent task execution.
 */

import { prisma } from '@/lib/prisma'
import type { ClassifiedError } from './types'
import { logAgentEvent } from './logger'

/**
 * Classify an unknown error into a structured error object with retry semantics.
 */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()

    // Timeout
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('econnaborted')) {
      return { code: 'TIMEOUT', message: error.message, retryable: true }
    }

    // Rate limiting
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
      return { code: 'RATE_LIMIT', message: error.message, retryable: true, retryAfterMs: 30000 }
    }

    // Auth errors
    if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('403') || msg.includes('forbidden') || msg.includes('api key')) {
      return { code: 'AUTH_ERROR', message: error.message, retryable: false }
    }

    // Validation errors
    if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required')) {
      return { code: 'VALIDATION_ERROR', message: error.message, retryable: false }
    }

    // AI provider errors (5xx from provider)
    if (msg.includes('500') || msg.includes('503') || msg.includes('502') || msg.includes('overloaded') || msg.includes('server error')) {
      return { code: 'AI_PROVIDER_ERROR', message: error.message, retryable: true }
    }

    return { code: 'UNKNOWN', message: error.message, retryable: false }
  }

  return { code: 'UNKNOWN', message: String(error), retryable: false }
}

/**
 * Check if an error is retryable.
 */
export function isRetryable(error: unknown): boolean {
  return classifyError(error).retryable
}

/**
 * Calculate retry delay with exponential backoff and jitter.
 * Base: 2s -> 4s -> 8s -> 16s (capped at 30s).
 */
export function getRetryDelay(attempt: number, baseMs: number = 2000): number {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), 30000)
  const jitter = Math.random() * 1000 // 0-1s random jitter
  return Math.round(exponential + jitter)
}

/**
 * Move a task to DEAD_LETTER status after exhausting all retries.
 */
export async function moveToDeadLetter(taskId: string, error: unknown): Promise<void> {
  const classified = classifyError(error)

  await prisma.agentTask.update({
    where: { id: taskId },
    data: {
      status: 'DEAD_LETTER',
      errorMessage: classified.message,
      errorCode: classified.code,
    },
  })

  await logAgentEvent(taskId, 'error', `Task moved to dead letter: ${classified.code}`, {
    errorCode: classified.code,
    errorMessage: classified.message,
  })
}
