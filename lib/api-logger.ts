/**
 * API Response logging utility
 * Wraps NextResponse to automatically log API responses
 */

import { NextResponse } from "next/server"
import { logger } from "./logger"

export function logApiResponse(
  method: string,
  path: string,
  status: number,
  startTime: number,
  context?: Record<string, any>
): void {
  const duration = Date.now() - startTime
  logger.apiResponse(method, path, status, duration, context)
}

export function createLoggedResponse<T>(
  method: string,
  path: string,
  startTime: number,
  data: T,
  status: number = 200,
  context?: Record<string, any>
): NextResponse<T> {
  logApiResponse(method, path, status, startTime, context)
  return NextResponse.json(data, { status })
}

