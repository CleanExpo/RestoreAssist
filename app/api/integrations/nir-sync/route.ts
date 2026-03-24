/**
 * POST /api/integrations/nir-sync
 *
 * Trigger NIR sync to connected accounting/job management integrations.
 * Called after a NIR report is submitted and scope is approved.
 *
 * Body:
 *   {
 *     reportId: string              — NIR report ID
 *     targetIntegrationId?: string  — sync to this integration only
 *                                     if omitted, sync to all connected
 *   }
 *
 * Schema notes (verified against prisma/schema.prisma):
 *   - Report.inspection   — linked Inspection (one-to-one via Inspection.reportId)
 *   - Inspection.scopeItems — ScopeItem[] (not on Report directly)
 *   - Inspection.costEstimates — CostEstimate[] (holds rate, subtotal, total, quantity)
 *   - Inspection.classifications — Classification[] (holds category/class = waterCategory/waterClass)
 *   - ScopeItem.justification — the IICRC standards reference string (e.g. "S500 §14")
 *   - Report.claimReferenceNumber — insurance claim ref (not report.insuranceClaim)
 *   - Report.totalCost — Float, the top-level cost figure
 *   - Client has: name, email, phone, address (no .abn field in schema)
 *
 * Financial totals: CostEstimate rows are summed here. All NIRJobPayload
 * amounts are in CENTS (multiply Float dollars × 100). The individual
 * provider sync modules handle cents-to-dollars conversion internally.
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

    // Fetch the NIR report with all related data.
    // ScopeItems and CostEstimates live on Inspection, not Report.
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        client: true,
        inspection: {
          include: {
            scopeItems: true,
            costEstimates: true,
            classifications: {
              where: { isFinal: true },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (report.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const inspection = report.inspection
    const classification = inspection?.classifications?.[0]

    // Sum cost estimates to derive totals (all in dollars from schema, convert to cents)
    const costEstimates = inspection?.costEstimates ?? []
    const totalExGSTDollars = costEstimates.reduce((sum, ce) => sum + (ce.subtotal ?? 0), 0)
    const totalIncGSTDollars = costEstimates.reduce((sum, ce) => sum + (ce.total ?? 0), 0)
    // Fallback to report.totalCost if no cost estimates recorded
    const totalFallbackDollars = report.totalCost ?? 0

    const totalExGSTCents = Math.round(
      (totalExGSTDollars > 0 ? totalExGSTDollars : totalFallbackDollars) * 100
    )
    const totalIncGSTCents = Math.round(
      (totalIncGSTDollars > 0 ? totalIncGSTDollars : totalFallbackDollars * 1.1) * 100
    )
    const gstAmountCents = totalIncGSTCents - totalExGSTCents

    // Build NIRJobPayload with correct schema field names
    const payload: NIRJobPayload = {
      reportId: report.id,

      // Client details — prefer linked Client record, fall back to Report fields
      clientName: report.client?.name ?? report.clientName,
      clientEmail: report.client?.email ?? undefined,
      clientPhone: report.client?.phone ?? undefined,
      // Client has no ABN field in schema — omit
      clientAddress: report.client?.address ?? undefined,

      propertyAddress: report.propertyAddress,
      reportNumber: report.reportNumber ?? report.id,

      // Damage type derived from report.hazardType (the schema field)
      damageType: mapDamageType(report.hazardType),

      // Water category/class: on Report directly (IICRC S500 fields added in schema)
      waterCategory: (report.waterCategory ?? classification?.category ?? undefined) as '1' | '2' | '3' | undefined,
      waterClass:    (report.waterClass    ?? classification?.class    ?? undefined) as '1' | '2' | '3' | '4' | undefined,

      // Scope items from Inspection (not Report)
      scopeItems: (inspection?.scopeItems ?? []).map(item => ({
        description:    item.description,
        category:       item.itemType,           // itemType is the category field in ScopeItem
        quantity:       item.quantity ?? 1,
        unit:           item.unit ?? 'each',
        // Rate comes from linked CostEstimate — look up by scopeItemId
        unitPriceExGST: Math.round(
          (costEstimates.find(ce => ce.scopeItemId === item.id)?.rate ?? 0) * 100
        ),
        gstRate:        10,                      // AU standard GST on restoration services
        subtotalExGST:  Math.round(
          (costEstimates.find(ce => ce.scopeItemId === item.id)?.subtotal ?? 0) * 100
        ),
        iicrcRef:       item.justification ?? undefined, // justification holds the IICRC clause ref
      })),

      totalExGST:  totalExGSTCents,
      gstAmount:   gstAmountCents,
      totalIncGST: totalIncGSTCents,

      // Dates — inspection date on Report (IICRC fields) or Inspection model
      inspectionDate: report.inspectionDate ?? inspection?.inspectionDate ?? report.createdAt,
      reportDate:     report.createdAt,

      // Technician: Report has technicianName directly (IICRC S500 fields section)
      technician: report.technicianName ?? inspection?.technicianName ?? undefined,

      // Insurance claim: report.claimReferenceNumber (not insuranceClaim)
      insuranceClaim: report.claimReferenceNumber ?? undefined,

      notes: report.description ?? undefined,
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
        total:   results.length,
        success: successCount,
        errors:  errorCount,
        skipped: results.filter(r => r.status === 'skipped').length,
      },
    })
  } catch (error) {
    console.error('[NIR Sync API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Map Report.hazardType to NIRJobPayload.damageType.
 * Report.hazardType is a free-text string in the schema.
 */
function mapDamageType(
  raw?: string | null
): 'WATER' | 'FIRE' | 'MOULD' | 'GENERAL' {
  if (!raw) return 'GENERAL'
  const upper = raw.toUpperCase()
  if (upper.includes('WATER') || upper.includes('FLOOD') || upper.includes('LEAK')) return 'WATER'
  if (upper.includes('FIRE') || upper.includes('SMOKE') || upper.includes('SOOT'))  return 'FIRE'
  if (upper.includes('MOULD') || upper.includes('MOLD')  || upper.includes('FUNGAL')) return 'MOULD'
  return 'GENERAL'
}
