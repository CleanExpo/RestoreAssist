/**
 * Structured logging for agent task execution.
 * Writes to the AgentTaskLog table. Non-blocking — errors are caught
 * internally and logged to console, never thrown to callers.
 * Follows the same pattern as lib/security-audit.ts.
 */

import { prisma } from '@/lib/prisma'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export async function logAgentEvent(
  taskId: string,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.agentTaskLog.create({
      data: {
        taskId,
        level,
        message,
        data: data ? JSON.stringify(data) : null,
      },
    })
  } catch (err) {
    console.error('[AgentLogger] Failed to write log:', err)
  }
}

export async function getTaskLogs(
  taskId: string,
  options?: { level?: LogLevel; limit?: number }
): Promise<Array<{ id: string; level: string; message: string; data: string | null; timestamp: Date }>> {
  try {
    return await prisma.agentTaskLog.findMany({
      where: {
        taskId,
        ...(options?.level ? { level: options.level } : {}),
      },
      orderBy: { timestamp: 'asc' },
      take: options?.limit ?? 100,
    })
  } catch (err) {
    console.error('[AgentLogger] Failed to read logs:', err)
    return []
  }
}

export async function getWorkflowLogs(
  workflowId: string,
  options?: { level?: LogLevel; limit?: number }
): Promise<Array<{ id: string; taskId: string; level: string; message: string; data: string | null; timestamp: Date }>> {
  try {
    return await prisma.agentTaskLog.findMany({
      where: {
        task: { workflowId },
        ...(options?.level ? { level: options.level } : {}),
      },
      orderBy: { timestamp: 'asc' },
      take: options?.limit ?? 500,
    })
  } catch (err) {
    console.error('[AgentLogger] Failed to read workflow logs:', err)
    return []
  }
}
