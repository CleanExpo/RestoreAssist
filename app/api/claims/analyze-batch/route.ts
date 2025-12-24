/**
 * API Route: Gap Analysis for Claims
 * 
 * Single API call that processes all PDFs and returns gap analysis results
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listDriveItems, downloadDriveFile } from '@/lib/google-drive'
import { performGapAnalysis } from '@/lib/gap-analysis'

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

    // Use Anthropic API key from .env
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured in environment variables' },
        { status: 500 }
      )
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

    // Perform gap analysis on all PDFs in a single API call
    const analysisResults = await performGapAnalysis(pdfData, anthropicApiKey)

    // Calculate summary statistics
    const summary = {
      totalFiles: analysisResults.length,
      totalIssues: analysisResults.reduce((sum, r) => sum + r.issues.length, 0),
      totalMissingElements: {
        iicrc: analysisResults.reduce((sum, r) => sum + r.missingElements.iicrc, 0),
        ohs: analysisResults.reduce((sum, r) => sum + r.missingElements.ohs, 0),
        billing: analysisResults.reduce((sum, r) => sum + r.missingElements.billing, 0),
        documentation: analysisResults.reduce((sum, r) => sum + r.missingElements.documentation, 0),
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
