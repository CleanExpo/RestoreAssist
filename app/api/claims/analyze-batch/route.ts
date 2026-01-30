/**
 * API Route: Gap Analysis for Claims
 *
 * Processes PDFs and returns gap analysis results.
 * Supports streaming mode (stream: true) for per-document progress.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listDriveItems, downloadDriveFile } from '@/lib/google-drive'
import { performGapAnalysis } from '@/lib/gap-analysis'
import { performRevolutionaryGapAnalysis } from '@/lib/revolutionary-gap-analysis'
import { retrieveRelevantStandards, buildStandardsContextPrompt } from '@/lib/standards-retrieval'
import type { GapAnalysisResult } from '@/lib/gap-analysis'
import { applyRateLimit } from '@/lib/rate-limiter'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit: 5 batch analyses per 15 minutes per user (heavy operation)
    const rateLimited = applyRateLimit(request, { maxRequests: 5, prefix: "analyze-batch", key: session.user.id })
    if (rateLimited) return rateLimited

    const body = await request.json()
    const { folderId, maxDocuments, stream } = body

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 })
    }

    const userId = session.user.id

    // Get integrations
    const { getIntegrationsForUser } = await import('@/lib/ai-provider')
    const integrations = await getIntegrationsForUser(userId, {
      status: 'CONNECTED',
      nameContains: ['Anthropic', 'OpenAI', 'Gemini', 'Claude', 'GPT']
    })
    const integration = integrations[0]

    if (!integration || !integration.apiKey) {
      return NextResponse.json(
        {
          error: 'No connected API integration found',
          details: 'Please connect an Anthropic, OpenAI, or other AI API integration in the Integrations page during onboarding.'
        },
        { status: 400 }
      )
    }

    const anthropicApiKey = integration.apiKey

    // Retrieve IICRC standards from Google Drive
    let standardsContext = ''
    try {
      const retrievalQuery = {
        reportType: 'water' as const,
        keywords: [
          'S500', 'S520', 'S540', 'IICRC', 'AS-IICRC',
          'AS/NZS 3000', 'AS/NZS 3500', 'AS 1668', 'AS/NZS 3666',
          'NCC', 'QDC', 'WHS', 'OH&S', 'Work Health and Safety',
          'Insurance', 'ICA', 'APRA', 'compliance', 'standards',
          'billing', 'scope of works', 'equipment', 'monitoring',
          'psychrometric', 'drying', 'restoration', 'remediation'
        ],
        technicianNotes: 'Comprehensive revolutionary gap analysis of completed claim reports against all Australian and IICRC standards'
      }

      const retrievedStandards = await retrieveRelevantStandards(retrievalQuery, anthropicApiKey)
      standardsContext = buildStandardsContextPrompt(retrievedStandards)
    } catch (error: any) {
      console.error('[Gap Analysis] Error retrieving standards:', error.message)
    }

    // List PDF files
    const items = await listDriveItems(folderId)
    let pdfFiles = items.files.filter(file =>
      file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )

    if (maxDocuments && maxDocuments > 0) {
      pdfFiles = pdfFiles.slice(0, parseInt(maxDocuments))
    }

    if (pdfFiles.length === 0) {
      return NextResponse.json({ error: 'No PDF files found in the folder' }, { status: 400 })
    }

    // --- Streaming mode: process one-by-one with progress events ---
    if (stream) {
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: any) => {
            controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
          }

          sendEvent({ type: 'start', total: pdfFiles.length })

          const analysisResults: GapAnalysisResult[] = []

          for (let i = 0; i < pdfFiles.length; i++) {
            const file = pdfFiles[i]
            sendEvent({ type: 'progress', file: file.name, index: i, status: 'processing' })

            try {
              const { buffer } = await downloadDriveFile(file.id)
              const revResult = await performRevolutionaryGapAnalysis(
                { id: file.id, name: file.name, buffer },
                anthropicApiKey,
                standardsContext
              )

              // Convert revolutionary format to standard
              const result: GapAnalysisResult = {
                fileName: revResult.fileName,
                fileId: revResult.fileId,
                issues: revResult.issues.map((issue: any) => ({
                  category: issue.category,
                  elementName: issue.elementName,
                  description: issue.description,
                  severity: issue.severity,
                  standardReference: issue.standardReference,
                  isBillable: issue.isBillable,
                  estimatedCost: issue.estimatedCost,
                  estimatedHours: issue.estimatedHours,
                  suggestedLineItem: issue.suggestedLineItem
                })),
                missingElements: revResult.missingElements,
                scores: {
                  completeness: revResult.scores.completeness,
                  compliance: revResult.scores.compliance,
                  standardization: revResult.scores.standardization,
                  scopeAccuracy: revResult.scores.scopeAccuracy,
                  billingAccuracy: revResult.scores.billingAccuracy
                },
                estimatedMissingRevenue: revResult.estimatedMissingRevenue,
                standardsReferenced: revResult.standardsReferenced,
                complianceGaps: revResult.complianceGaps,
                reportStructure: revResult.reportStructure,
                technicianPattern: revResult.technicianPattern,
              }

              analysisResults.push(result)
              sendEvent({ type: 'progress', file: file.name, index: i, status: 'done' })
            } catch (error: any) {
              console.error(`[Gap Analysis] Failed to analyze ${file.name}:`, error.message)
              analysisResults.push({
                fileName: file.name,
                fileId: file.id,
                issues: [],
                missingElements: { iicrc: 0, australianStandards: 0, ohs: 0, whs: 0, scopeOfWorks: 0, billing: 0, documentation: 0, equipment: 0, monitoring: 0 },
                scores: { completeness: 0, compliance: 0, standardization: 0, scopeAccuracy: 0, billingAccuracy: 0 },
                estimatedMissingRevenue: 0,
              })
              sendEvent({ type: 'progress', file: file.name, index: i, status: 'failed', error: error.message })
            }
          }

          // Calculate summary
          const summary = buildSummary(analysisResults)
          sendEvent({ type: 'complete', results: analysisResults, summary })
          controller.close()
        }
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache',
          'Transfer-Encoding': 'chunked',
        }
      })
    }

    // --- Non-streaming mode (backward compat) ---
    const pdfData = await Promise.all(
      pdfFiles.map(async (file) => {
        const { buffer } = await downloadDriveFile(file.id)
        return { id: file.id, name: file.name, buffer }
      })
    )

    const analysisResults = await performGapAnalysis(pdfData, anthropicApiKey, standardsContext)
    const summary = buildSummary(analysisResults)

    return NextResponse.json({ success: true, results: analysisResults, summary })

  } catch (error: any) {
    console.error('Error performing gap analysis:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to perform gap analysis' },
      { status: 500 }
    )
  }
}

function buildSummary(analysisResults: GapAnalysisResult[]) {
  return {
    totalFiles: analysisResults.length,
    totalIssues: analysisResults.reduce((sum, r) => sum + r.issues.length, 0),
    totalMissingElements: {
      iicrc: analysisResults.reduce((sum, r) => sum + (r.missingElements?.iicrc || 0), 0),
      australianStandards: analysisResults.reduce((sum, r) => sum + (r.missingElements?.australianStandards || 0), 0),
      ohs: analysisResults.reduce((sum, r) => sum + (r.missingElements?.ohs || 0), 0),
      whs: analysisResults.reduce((sum, r) => sum + (r.missingElements?.whs || 0), 0),
      scopeOfWorks: analysisResults.reduce((sum, r) => sum + (r.missingElements?.scopeOfWorks || 0), 0),
      billing: analysisResults.reduce((sum, r) => sum + (r.missingElements?.billing || 0), 0),
      documentation: analysisResults.reduce((sum, r) => sum + (r.missingElements?.documentation || 0), 0),
      equipment: analysisResults.reduce((sum, r) => sum + (r.missingElements?.equipment || 0), 0),
      monitoring: analysisResults.reduce((sum, r) => sum + (r.missingElements?.monitoring || 0), 0),
    },
    averageScores: {
      completeness: analysisResults.length > 0
        ? analysisResults.reduce((sum, r) => sum + (r.scores?.completeness || 0), 0) / analysisResults.length : 0,
      compliance: analysisResults.length > 0
        ? analysisResults.reduce((sum, r) => sum + (r.scores?.compliance || 0), 0) / analysisResults.length : 0,
      standardization: analysisResults.length > 0
        ? analysisResults.reduce((sum, r) => sum + (r.scores?.standardization || 0), 0) / analysisResults.length : 0,
      scopeAccuracy: analysisResults.length > 0
        ? analysisResults.reduce((sum, r) => sum + (r.scores?.scopeAccuracy || 0), 0) / analysisResults.length : 0,
      billingAccuracy: analysisResults.length > 0
        ? analysisResults.reduce((sum, r) => sum + (r.scores?.billingAccuracy || 0), 0) / analysisResults.length : 0,
    },
    totalEstimatedMissingRevenue: analysisResults.reduce((sum, r) => sum + (r.estimatedMissingRevenue || 0), 0),
    topIssues: analysisResults
      .flatMap(r => r.issues)
      .reduce((acc: any[], issue) => {
        const existing = acc.find(i => i.elementName === issue.elementName)
        if (existing) {
          existing.count++
          existing.totalCost += issue.estimatedCost || 0
        } else {
          acc.push({ ...issue, count: 1, totalCost: issue.estimatedCost || 0 })
        }
        return acc
      }, [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  }
}
