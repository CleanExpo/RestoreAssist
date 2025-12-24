/**
 * API Route: Get Missing Elements Summary
 * 
 * Aggregates missing elements across all analyses
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batchId')

    const where: any = {
      analysis: {
        batch: {
          userId
        }
      }
    }

    if (batchId) {
      where.analysis = {
        batchId,
        batch: {
          userId
        }
      }
    }

    // Get all missing elements
    const missingElements = await prisma.missingElement.findMany({
      where,
      include: {
        analysis: {
          select: {
            id: true,
            fileName: true,
            technicianName: true,
            batch: {
              select: {
                folderName: true
              }
            }
          }
        }
      }
    })

    // Aggregate by category
    const byCategory = new Map<string, any>()
    const byElement = new Map<string, any>()
    let totalBillableValue = 0
    let totalBillableHours = 0

    missingElements.forEach(element => {
      // Aggregate by category
      const categoryKey = element.category
      if (!byCategory.has(categoryKey)) {
        byCategory.set(categoryKey, {
          category: element.category,
          count: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          billableCount: 0,
          totalBillableValue: 0,
          totalBillableHours: 0,
          elements: []
        })
      }
      const categoryData = byCategory.get(categoryKey)!
      categoryData.count++
      categoryData[element.severity.toLowerCase()]++
      if (element.isBillable) {
        categoryData.billableCount++
        categoryData.totalBillableValue += element.estimatedCost || 0
        categoryData.totalBillableHours += element.estimatedHours || 0
        totalBillableValue += element.estimatedCost || 0
        totalBillableHours += element.estimatedHours || 0
      }

      // Aggregate by specific element
      const elementKey = `${element.category}:${element.elementName}`
      if (!byElement.has(elementKey)) {
        byElement.set(elementKey, {
          category: element.category,
          elementName: element.elementName,
          elementType: element.elementType,
          count: 0,
          severity: element.severity,
          isBillable: element.isBillable,
          totalEstimatedCost: 0,
          totalEstimatedHours: 0,
          occurrences: []
        })
      }
      const elementData = byElement.get(elementKey)!
      elementData.count++
      elementData.totalEstimatedCost += element.estimatedCost || 0
      elementData.totalEstimatedHours += element.estimatedHours || 0
      elementData.occurrences.push({
        analysisId: element.analysisId,
        fileName: element.analysis.fileName,
        technicianName: element.analysis.technicianName,
        description: element.description,
        estimatedCost: element.estimatedCost,
        estimatedHours: element.estimatedHours
      })
    })

    // Get top missing elements
    const topMissing = Array.from(byElement.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    // Get top billable missing items
    const topBillable = Array.from(byElement.values())
      .filter(e => e.isBillable)
      .sort((a, b) => (b.totalEstimatedCost || 0) - (a.totalEstimatedCost || 0))
      .slice(0, 20)

    return NextResponse.json({
      summary: {
        totalMissingElements: missingElements.length,
        totalBillableValue,
        totalBillableHours,
        categoriesCount: byCategory.size,
        uniqueElementsCount: byElement.size
      },
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.count - a.count),
      topMissing,
      topBillable
    })

  } catch (error: any) {
    console.error('Error fetching missing elements:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch missing elements' },
      { status: 500 }
    )
  }
}

