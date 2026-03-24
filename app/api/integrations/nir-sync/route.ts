/**
 * POST /api/integrations/nir-sync
 *
 * Trigger NIR sync to connected accounting/job management integrations.
 * Called after a NIR report is submitted and scope is approved.
 *
 * Body:
 *   {
 *     reportId: string           — NIR report ID
 *     targetIntegrationId?: string  — if set, sync to this integration only
 *                                     if omitted, sync to all connected
 *   }
 *
 * The route fetches the full NIR data from the database and constructs
 * the NIRJobPayload before dispatching to the orchestrator.
 *
 * Returns:
 *   { results: NIRSyncResult[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  syncNIRToAllConnectedIntegrations,
  syncNIRToSpecificIntegration,
  type NIRJobPayload,
} from '@/lib/integrations/nir-sync-orchestrator'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { reportId, targetIntegrationId } = body

    if (!reportId) {
      return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
    }

    // Fetch the NIR report with all related data
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        client: true,
        scopeItems: true,
        inspection: true,
      },
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Verify ownership
    if (report.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Construct the NIR sync payload from database data
    // Field mappings assume the RestoreAssist schema as observed in prisma/schema.prisma
    const payload: NIRJobPayload = {
      reportId: report.id,
      clientName: report.client?.name || report.customerName || 'Unknown Client',
      clientEmail: report.client?.email || report.customerEmail || undefined,
      clientPhone: report.client?.phone || report.customerPhone || undefined,
      clientABN: report.client?.abn || undefined,
      clientAddress: report.client?.address || undefined,
      propertyAddress: report.propertyAddress || report.address || '',
      reportNumber: report.reportNumber || report.id,
      damageType: mapDamageType(report.damageType || report.inspection?.category),
      waterCategory: report.inspection?.waterCategory as '1' | '2' | '3' | undefined,
      waterClass: report.inspection?.waterClass as '1' | '2' | '3' | '4' | undefined,
      scopeItems: (report.scopeItems || []).map((item: any) => ({
        description: item.description,
        category: item.category || 'General',
        quantity: item.quantity || 1,
        unit: item.unit || 'each',
        unitPriceExGST: item.unitPrice || item.unitPriceExGST || 0,
        gstRate: item.gstRate ?? 10,
        subtotalExGST: item.subtotal || item.subtotalExGST || 0,
        iicrcRef: item.iicrcRef || item.standardsRef || undefined,
      })),
      totalExGST: report.subtotal || report.totalExGST || 0,
      gstAmount: report.gstAmount || report.taxAmount || 0,
      totalIncGST: report.total || report.totalIncGST || 0,
      inspectionDate: report.inspection?.createdAt || report.inspectionDate || new Date(),
      reportDate: report.createdAt || new Date(),
      technician: report.inspection?.technicianName || undefined,
      insuranceClaim: report.insuranceClaim || report.claimNumber || undefined,
      notes: report.notes || undefined,
    }

    // Dispatch to orchestrator
    let results
    if (targetIntegrationId) {
      const single = await syncNIRToSpecificIntegration(targetIntegrationId, payload)
      results = [single]
    } else {
      results = await syncNIRToAllConnectedIntegrations(session.user.id, payload)
    }

    const successCount = results.filter(r => r.status === 'success').length
    const errorCount   = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        success: successCount,
        errors: errorCount,
        skipped: results.filter(r => r.status === 'skipped').length,
      },
    })
  } catch (error) {
    console.error('[NIR Sync API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function mapDamageType(
  raw?: string | null
): 'WATER' | 'FIRE' | 'MOULD' | 'GENERAL' {
  if (!raw) return 'GENERAL'
  const upper = raw.toUpperCase()
  if (upper.includes('WATER') || upper.includes('FLOOD')) return 'WATER'
  if (upper.includes('FIRE') || upper.includes('SMOKE')) return 'FIRE'
  if (upper.includes('MOULD') || upper.includes('MOLD')) return 'MOULD'
  return 'GENERAL'
}
