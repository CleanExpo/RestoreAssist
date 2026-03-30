/**
 * POST /api/admin/evaluation
 *
 * Runs the scope generation evaluation suite against golden test cases
 * and returns a scored report.
 *
 * Body: {
 *   claimTypes?: string[]   // Filter test cases (e.g. ["water_damage", "mould"])
 *   sampleSize?: number     // Max test cases per claim type
 *   promptOverride?: string // Custom system prompt to evaluate
 * }
 *
 * Returns: EvaluationReport JSON
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  runEvaluationSuite,
  type EvaluationOptions,
} from '@/lib/ai/evaluation-harness'

export async function POST(request: NextRequest) {
  // TODO: Replace with proper admin auth (e.g. NextAuth role check)
  // For now, check x-admin-key header against ADMIN_API_KEY env var
  const adminKey = request.headers.get('x-admin-key')
  const expectedKey = process.env.ADMIN_API_KEY

  if (expectedKey && adminKey !== expectedKey) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide valid x-admin-key header.' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json().catch(() => ({})) as {
      claimTypes?: string[]
      sampleSize?: number
      promptOverride?: string
    }

    const options: EvaluationOptions = {}

    if (Array.isArray(body.claimTypes) && body.claimTypes.length > 0) {
      options.claimTypes = body.claimTypes
    }

    if (typeof body.sampleSize === 'number' && body.sampleSize > 0) {
      options.sampleSize = body.sampleSize
    }

    if (typeof body.promptOverride === 'string' && body.promptOverride.trim()) {
      options.promptOverride = body.promptOverride.trim()
    }

    const report = await runEvaluationSuite(options)

    return NextResponse.json(report)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Evaluation failed'
    console.error('[admin/evaluation POST]', err)

    // Distinguish configuration errors from runtime errors
    if (
      message.includes('ANTHROPIC_API_KEY') ||
      message.includes('Anthropic SDK')
    ) {
      return NextResponse.json(
        { error: message },
        { status: 503 } // Service Unavailable — missing config
      )
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
