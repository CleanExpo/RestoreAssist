/**
 * API Route: Gap Analysis for Claims
 * 
 * Single API call that processes all PDFs and returns gap analysis results
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listDriveItems, downloadDriveFile } from '@/lib/google-drive'
import { performGapAnalysis } from '@/lib/gap-analysis'
import { retrieveRelevantStandards, buildStandardsContextPrompt } from '@/lib/standards-retrieval'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { folderId, maxDocuments } = body

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 })
    }

    const userId = (session.user as any).id

    // Get user's connected integration (same logic as onboarding - use saved integration)
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        status: 'CONNECTED',
        apiKey: { not: null },
        OR: [
          { name: { contains: 'Anthropic' } },
          { name: { contains: 'OpenAI' } },
          { name: { contains: 'Gemini' } },
          { name: { contains: 'Claude' } },
          { name: { contains: 'GPT' } }
        ]
      },
      orderBy: {
        createdAt: 'desc' // Use most recently connected
      }
    })

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

    // Retrieve ALL IICRC standards from Google Drive for revolutionary comprehensive analysis
    let standardsContext = ''
    try {
      // Retrieve comprehensive standards for all report types
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
      // Error retrieving standards - continue without standards context
      // Continue without standards - analysis will use comprehensive built-in knowledge
    }

    // List all PDF files in the folder
    const items = await listDriveItems(folderId)
    let pdfFiles = items.files.filter(file => 
      file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )

    // Apply document limit if specified
    if (maxDocuments && maxDocuments > 0) {
      pdfFiles = pdfFiles.slice(0, parseInt(maxDocuments))
    }

    if (pdfFiles.length === 0) {
      return NextResponse.json(
        { error: 'No PDF files found in the folder' },
        { status: 400 }
      )
    }

    // Download all PDFs
    const pdfData = await Promise.all(
      pdfFiles.map(async (file) => {
        try {
          const { buffer } = await downloadDriveFile(file.id)
          return {
            id: file.id,
            name: file.name,
            buffer
          }
        } catch (error: any) {
          throw new Error(`Failed to download ${file.name}: ${error.message}`)
        }
      })
    )

    // Perform enhanced gap analysis on all PDFs with standards context
    const analysisResults = await performGapAnalysis(pdfData, anthropicApiKey, standardsContext)

    // Calculate summary statistics
    const summary = {
      totalFiles: analysisResults.length,
      totalIssues: analysisResults.reduce((sum, r) => sum + r.issues.length, 0),
      totalMissingElements: {
        iicrc: analysisResults.reduce((sum, r) => sum + r.missingElements.iicrc, 0),
        australianStandards: analysisResults.reduce((sum, r) => sum + r.missingElements.australianStandards, 0),
        ohs: analysisResults.reduce((sum, r) => sum + r.missingElements.ohs, 0),
        whs: analysisResults.reduce((sum, r) => sum + r.missingElements.whs, 0),
        scopeOfWorks: analysisResults.reduce((sum, r) => sum + r.missingElements.scopeOfWorks, 0),
        billing: analysisResults.reduce((sum, r) => sum + r.missingElements.billing, 0),
        documentation: analysisResults.reduce((sum, r) => sum + r.missingElements.documentation, 0),
        equipment: analysisResults.reduce((sum, r) => sum + r.missingElements.equipment, 0),
        monitoring: analysisResults.reduce((sum, r) => sum + r.missingElements.monitoring, 0),
      },
      averageScores: {
        completeness: analysisResults.length > 0 
          ? analysisResults.reduce((sum, r) => sum + r.scores.completeness, 0) / analysisResults.length 
          : 0,
        compliance: analysisResults.length > 0
          ? analysisResults.reduce((sum, r) => sum + r.scores.compliance, 0) / analysisResults.length
          : 0,
        standardization: analysisResults.length > 0
          ? analysisResults.reduce((sum, r) => sum + r.scores.standardization, 0) / analysisResults.length
          : 0,
        scopeAccuracy: analysisResults.length > 0
          ? analysisResults.reduce((sum, r) => sum + r.scores.scopeAccuracy, 0) / analysisResults.length
          : 0,
        billingAccuracy: analysisResults.length > 0
          ? analysisResults.reduce((sum, r) => sum + r.scores.billingAccuracy, 0) / analysisResults.length
          : 0,
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
            acc.push({
              ...issue,
              count: 1,
              totalCost: issue.estimatedCost || 0
            })
          }
          return acc
        }, [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
    }

    return NextResponse.json({
      success: true,
      results: analysisResults,
      summary
    })

  } catch (error: any) {
    console.error('Error performing gap analysis:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to perform gap analysis' },
      { status: 500 }
    )
  }
}
