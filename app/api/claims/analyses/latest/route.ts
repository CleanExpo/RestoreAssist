/**
 * API Route: Get Latest Claim Analysis (for dashboard default view)
 * Returns the most recent completed batch as results + summary in UI shape.
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CATEGORY_TO_UI: Record<string, string> = {
  IICRC_COMPLIANCE: 'iicrc',
  OH_S_POLICY: 'ohs',
  WORKING_AT_HEIGHTS: 'ohs',
  CONFINED_SPACES: 'ohs',
  PPE_REQUIREMENTS: 'ohs',
  BILLING_ITEM: 'billing',
  DOCUMENTATION: 'documentation',
  SCOPE_OF_WORKS: 'scope of works',
  OTHER: 'other',
}

function mapCategoryToUi(category: string): string {
  return CATEGORY_TO_UI[category] ?? category
}

function buildSummaryFromResults(results: Array<{
  issues: Array<{ elementName: string; estimatedCost?: number; category?: string; description?: string; severity?: string; isBillable?: boolean }>
  missingElements: Record<string, number>
  scores: { completeness: number; compliance: number; standardization: number; scopeAccuracy?: number; billingAccuracy?: number }
  estimatedMissingRevenue?: number
}>) {
  const totalMissingElements = {
    iicrc: 0,
    australianStandards: 0,
    ohs: 0,
    whs: 0,
    scopeOfWorks: 0,
    billing: 0,
    documentation: 0,
    equipment: 0,
    monitoring: 0,
  }
  for (const r of results) {
    totalMissingElements.iicrc += r.missingElements?.iicrc ?? 0
    totalMissingElements.australianStandards += r.missingElements?.australianStandards ?? 0
    totalMissingElements.ohs += r.missingElements?.ohs ?? 0
    totalMissingElements.whs += r.missingElements?.whs ?? 0
    totalMissingElements.scopeOfWorks += r.missingElements?.scopeOfWorks ?? 0
    totalMissingElements.billing += r.missingElements?.billing ?? 0
    totalMissingElements.documentation += r.missingElements?.documentation ?? 0
    totalMissingElements.equipment += r.missingElements?.equipment ?? 0
    totalMissingElements.monitoring += r.missingElements?.monitoring ?? 0
  }
  const totalIssues = results.reduce((sum, r) => sum + (r.issues?.length ?? 0), 0)
  const n = results.length
  return {
    totalFiles: n,
    totalIssues,
    totalMissingElements,
    averageScores: {
      completeness: n ? results.reduce((s, r) => s + (r.scores?.completeness ?? 0), 0) / n : 0,
      compliance: n ? results.reduce((s, r) => s + (r.scores?.compliance ?? 0), 0) / n : 0,
      standardization: n ? results.reduce((s, r) => s + (r.scores?.standardization ?? 0), 0) / n : 0,
      scopeAccuracy: n ? results.reduce((s, r) => s + (r.scores?.scopeAccuracy ?? 0), 0) / n : 0,
      billingAccuracy: n ? results.reduce((s, r) => s + (r.scores?.billingAccuracy ?? 0), 0) / n : 0,
    },
    totalEstimatedMissingRevenue: results.reduce((s, r) => s + (r.estimatedMissingRevenue ?? 0), 0),
    topIssues: results
      .flatMap(r => r.issues ?? [])
      .reduce((acc: any[], issue: any) => {
        const existing = acc.find((i: any) => i.elementName === issue.elementName)
        if (existing) {
          existing.count++
          existing.totalCost += issue.estimatedCost || 0
        } else {
          acc.push({ ...issue, count: 1, totalCost: issue.estimatedCost || 0 })
        }
        return acc
      }, [])
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 20),
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const batch = await prisma.claimAnalysisBatch.findFirst({
      where: {
        userId: session.user.id,
        status: { in: ['COMPLETED', 'PARTIAL'] },
      },
      orderBy: { completedAt: 'desc' },
    })

    if (!batch) {
      return NextResponse.json({ results: [], summary: null, batch: null })
    }

    const analyses = await prisma.claimAnalysis.findMany({
      where: { batchId: batch.id },
      include: {
        missingElements: { orderBy: { severity: 'desc' } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const results = analyses.map(a => {
      const issues = (a.missingElements || []).map(me => ({
        category: mapCategoryToUi(me.category),
        elementName: me.elementName || 'Unknown',
        description: me.description ?? '',
        severity: me.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
        standardReference: me.standardReference ?? undefined,
        isBillable: me.isBillable ?? false,
        estimatedCost: me.estimatedCost ?? undefined,
        estimatedHours: me.estimatedHours ?? undefined,
        suggestedLineItem: me.suggestedLineItem ?? undefined,
      }))
      const missingElements = {
        iicrc: a.missingIICRCElements ?? 0,
        australianStandards: 0,
        ohs: a.missingOHSElements ?? 0,
        whs: 0,
        scopeOfWorks: 0,
        billing: a.missingBillingItems ?? 0,
        documentation: a.missingDocumentation ?? 0,
        equipment: 0,
        monitoring: 0,
      }
      const scores = {
        completeness: a.completenessScore ?? 0,
        compliance: a.complianceScore ?? 0,
        standardization: a.standardizationScore ?? 0,
        scopeAccuracy: 0,
        billingAccuracy: a.billingAccuracyScore ?? 0,
      }
      let reportStructure: any
      let technicianPattern: any
      if (a.fullAnalysisData) {
        try {
          const parsed = JSON.parse(a.fullAnalysisData)
          reportStructure = parsed.reportStructure
          technicianPattern = parsed.technicianPattern
        } catch {
          // ignore
        }
      }
      return {
        fileName: a.fileName,
        fileId: a.googleDriveFileId,
        issues,
        missingElements,
        scores,
        estimatedMissingRevenue: a.estimatedMissingRevenue ?? undefined,
        standardsReferenced: undefined as string[] | undefined,
        complianceGaps: undefined as string[] | undefined,
        reportStructure,
        technicianPattern,
      }
    })

    const summary = buildSummaryFromResults(results)

    return NextResponse.json({
      batch: {
        id: batch.id,
        folderId: batch.folderId,
        folderName: batch.folderName,
        status: batch.status,
        totalFiles: batch.totalFiles,
        processedFiles: batch.processedFiles,
        failedFiles: batch.failedFiles,
      },
      results,
      summary,
    })
  } catch (error: any) {
    console.error('Error fetching latest analyses:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch latest analyses' },
      { status: 500 }
    )
  }
}
