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
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  runEvaluationSuite,
  type EvaluationOptions,
} from '@/lib/ai/evaluation-harness'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
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

    if (
      message.includes('ANTHROPIC_API_KEY') ||
      message.includes('Anthropic SDK')
    ) {
      return NextResponse.json(
        { error: message },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
