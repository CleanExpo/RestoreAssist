/**
 * Task Executor — runs agent tasks within the current API request scope.
 *
 * Each task is dispatched to the appropriate agent handler function
 * via the registry. Results are recorded as ExecutionResult objects.
 */

import { prisma } from '@/lib/prisma'
import type { AgentTask } from '@prisma/client'
import type { ExecutionResult, TaskInput, TaskOutput, WorkflowContext } from './types'
import { getAgent, getAgentHandler } from './registry'
import { classifyError, isRetryable } from './error-handler'
import { logAgentEvent } from './logger'
import { transitionTask } from './state-manager'

/**
 * Execute a single agent task.
 */
export async function executeTask(
  task: AgentTask,
  context: WorkflowContext
): Promise<ExecutionResult> {
  const startTime = Date.now()
  const agentSlug = task.agentSlug as any

  const config = getAgent(agentSlug)
  if (!config) {
    return {
      taskId: task.id,
      status: 'FAILED',
      error: {
        code: 'VALIDATION_ERROR',
        message: `Agent "${task.agentSlug}" is not registered`,
        retryable: false,
        attempt: task.attempts + 1,
        maxRetries: task.maxRetries,
      },
    }
  }

  const handler = getAgentHandler(agentSlug)
  if (!handler) {
    return {
      taskId: task.id,
      status: 'FAILED',
      error: {
        code: 'VALIDATION_ERROR',
        message: `No handler registered for agent "${task.agentSlug}"`,
        retryable: false,
        attempt: task.attempts + 1,
        maxRetries: task.maxRetries,
      },
    }
  }

  // Claim the task (READY -> RUNNING)
  const claimed = await transitionTask(task.id, 'READY', 'RUNNING', {
    startedAt: new Date(),
    lastAttemptAt: new Date(),
    attempts: task.attempts + 1,
  })

  if (!claimed) {
    // Another process already claimed this task
    await logAgentEvent(task.id, 'warn', 'Task claim failed — already claimed by another process')
    return {
      taskId: task.id,
      status: 'FAILED',
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Task already claimed',
        retryable: false,
        attempt: task.attempts,
        maxRetries: task.maxRetries,
      },
    }
  }

  await logAgentEvent(task.id, 'info', `Executing agent "${task.agentSlug}" (attempt ${task.attempts + 1})`)

  try {
    // Parse the task input and merge workflow context
    const input: TaskInput = {
      ...JSON.parse(task.input),
      context: context.completedOutputs,
    }

    // Execute the handler with a timeout
    const output = await withTimeout(
      handler(input),
      config.timeoutMs,
      `Agent "${task.agentSlug}" timed out after ${config.timeoutMs}ms`
    )

    const durationMs = Date.now() - startTime

    // Record success
    await prisma.agentTask.update({
      where: { id: task.id },
      data: {
        status: 'COMPLETED',
        output: JSON.stringify(output),
        completedAt: new Date(),
        durationMs,
        provider: output.metadata.provider,
        model: output.metadata.model,
        tokensUsed: output.metadata.tokensUsed,
      },
    })

    await logAgentEvent(task.id, 'info', `Task completed in ${durationMs}ms`, {
      provider: output.metadata.provider,
      model: output.metadata.model,
      tokensUsed: output.metadata.tokensUsed,
    })

    return { taskId: task.id, status: 'COMPLETED', output }
  } catch (err) {
    const durationMs = Date.now() - startTime
    const classified = classifyError(err)
    const attempt = task.attempts + 1
    const canRetry = classified.retryable && attempt < task.maxRetries

    await logAgentEvent(task.id, 'error', `Task failed: ${classified.message}`, {
      errorCode: classified.code,
      attempt,
      maxRetries: task.maxRetries,
      durationMs,
      willRetry: canRetry,
    })

    if (canRetry) {
      // Transition back to READY for retry
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: 'READY',
          errorMessage: classified.message,
          errorCode: classified.code,
          durationMs,
        },
      })

      return {
        taskId: task.id,
        status: 'RETRY',
        error: {
          code: classified.code,
          message: classified.message,
          retryable: true,
          attempt,
          maxRetries: task.maxRetries,
        },
      }
    }

    // No more retries — mark as failed
    const finalStatus = attempt >= task.maxRetries ? 'DEAD_LETTER' : 'FAILED'
    await prisma.agentTask.update({
      where: { id: task.id },
      data: {
        status: finalStatus,
        errorMessage: classified.message,
        errorCode: classified.code,
        durationMs,
      },
    })

    return {
      taskId: task.id,
      status: 'FAILED',
      error: {
        code: classified.code,
        message: classified.message,
        retryable: false,
        attempt,
        maxRetries: task.maxRetries,
      },
    }
  }
}

/**
 * Execute a batch of independent tasks in parallel.
 */
export async function executeBatch(
  tasks: AgentTask[],
  context: WorkflowContext
): Promise<ExecutionResult[]> {
  const results = await Promise.allSettled(
    tasks.map((task) => executeTask(task, context))
  )

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value
    }
    return {
      taskId: tasks[i].id,
      status: 'FAILED' as const,
      error: {
        code: 'UNKNOWN',
        message: result.reason?.message ?? 'Unknown execution error',
        retryable: false,
        attempt: tasks[i].attempts + 1,
        maxRetries: tasks[i].maxRetries,
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise
      .then((val) => {
        clearTimeout(timer)
        resolve(val)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}
