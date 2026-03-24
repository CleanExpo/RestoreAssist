/**
 * Ascora NIR Sync Module
 *
 * Ascora is an Australian-native restoration job management platform.
 * Unlike ServiceM8 or Xero, Ascora is domain-aware: it has native
 * concepts for restoration job types, damage categories, insurance claims,
 * and IICRC classifications.
 *
 * This module syncs a completed NIR to Ascora as a restoration job,
 * which is the most natural fit of all 5 integrations.
 *
 * Ascora API: https://api.ascora.com.au/api/v1
 * Auth: OAuth 2.0, scope: 'read'
 *
 * Key Ascora entities:
 *   - Job           (the restoration job record)
 *   - JobLineItem   (scope items / cost lines)
 *   - JobNote       (inspection notes)
 *   - Contact       (client)
 *   - InsuranceClaim (linked claim)
 */

import { getTokens, storeTokens, markIntegrationError, logSync } from '../oauth-handler'
import { AscoraClient } from './client'
import { prisma } from '@/lib/prisma'
import type { NIRJobPayload } from '../xero/nir-sync'

const ASCORA_BASE = 'https://api.ascora.com.au/api/v1'

// ─── ASCORA TYPES ────────────────────────────────────────────────────────────

interface AscoraJob {
  jobTypeId?: number          // Ascora job type ID (water=1, fire=2, mould=3)
  statusId: number            // 1=Active, 2=Completed
  clientName: string
  clientEmail?: string
  clientPhone?: string
  propertyAddress: string
  jobDescription: string
  damageCategory?: string     // IICRC category label
  insuranceClaimNumber?: string
  inspectionDate?: string
  completionDate?: string
  technicianName?: string
  externalReferenceId?: string  // NIR report ID
  lineItems?: AscoraLineItem[]
}

interface AscoraLineItem {
  description: string
  category?: string
  quantity: number
  unit?: string
  unitPriceExGST: number   // dollars
  gstAmount: number        // dollars
  totalIncGST: number      // dollars
  iicrcReference?: string
}

interface AscoraContact {
  name: string
  email?: string
  phone?: string
  address?: string
  abn?: string
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getAscoraJobTypeId(damageType: NIRJobPayload['damageType']): number {
  // Ascora job type IDs — verify against your Ascora instance configuration
  // These are the standard Ascora AU defaults:
  switch (damageType) {
    case 'WATER':  return parseInt(process.env.ASCORA_JOB_TYPE_WATER  || '1')
    case 'FIRE':   return parseInt(process.env.ASCORA_JOB_TYPE_FIRE   || '2')
    case 'MOULD':  return parseInt(process.env.ASCORA_JOB_TYPE_MOULD  || '3')
    default:       return parseInt(process.env.ASCORA_JOB_TYPE_WATER  || '1')
  }
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

function buildDamageLabel(job: NIRJobPayload): string {
  const parts = [job.damageType]
  if (job.waterCategory) parts.push(`Category ${job.waterCategory}`)
  if (job.waterClass)    parts.push(`Class ${job.waterClass}`)
  return parts.join(' ')
}

// ─── MAIN SYNC FUNCTION ───────────────────────────────────────────────────────

export async function syncNIRJobToAscora(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ ascoraJobId: string; ascoraJobNumber?: string }> {
  const tokens = await getTokens(integrationId)

  if (!tokens.accessToken) {
    throw new Error('Ascora integration not connected')
  }

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { companyId: true },
  })

  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new AscoraClient(integrationId, integration?.companyId || undefined)
    const refreshed = await client.refreshAccessToken(tokens.refreshToken)
    await storeTokens(integrationId, refreshed.access_token, refreshed.refresh_token, refreshed.expires_in)
    accessToken = refreshed.access_token
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  // Build Ascora job — Ascora is restoration-domain-aware so this mapping
  // is the most semantically correct of all 5 integrations.
  const ascoraJob: AscoraJob = {
    jobTypeId: getAscoraJobTypeId(job.damageType),
    statusId: 2,  // Completed (NIR is submitted post-inspection)
    clientName: job.clientName,
    ...(job.clientEmail && { clientEmail: job.clientEmail }),
    ...(job.clientPhone && { clientPhone: job.clientPhone }),
    propertyAddress: job.propertyAddress,
    jobDescription: [
      `NIR Report: ${job.reportNumber}`,
      `Damage: ${buildDamageLabel(job)}`,
      job.notes || '',
    ].filter(Boolean).join(' | '),
    damageCategory: buildDamageLabel(job),
    ...(job.insuranceClaim && { insuranceClaimNumber: job.insuranceClaim }),
    inspectionDate: job.inspectionDate.toISOString().split('T')[0],
    ...(job.technician && { technicianName: job.technician }),
    externalReferenceId: job.reportId,
    lineItems: job.scopeItems.map(item => ({
      description: item.description,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceExGST: centsToDollars(item.unitPriceExGST),
      gstAmount: centsToDollars(item.unitPriceExGST * item.quantity * (item.gstRate / 100)),
      totalIncGST: centsToDollars(item.unitPriceExGST * item.quantity * (1 + item.gstRate / 100)),
      ...(item.iicrcRef && { iicrcReference: item.iicrcRef }),
    })),
  }

  const res = await fetch(`${ASCORA_BASE}/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(ascoraJob),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    await markIntegrationError(integrationId, `Ascora API error: ${res.statusText}`)
    throw new Error(`Ascora API error: ${res.statusText} — ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  const ascoraJobId = data?.id || data?.jobId || data?.uuid

  if (!ascoraJobId) {
    throw new Error('Ascora job create: no job ID in response')
  }

  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)

  return {
    ascoraJobId: String(ascoraJobId),
    ascoraJobNumber: data?.jobNumber,
  }
}
