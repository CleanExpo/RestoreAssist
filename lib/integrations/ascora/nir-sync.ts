/**
 * Ascora NIR Sync Module
 *
 * Ascora is Australian-native restoration job management.
 * Most semantically complete of all 5 integrations — native support for
 * job types, damage categories, IICRC classifications, insurance claims.
 */

import { getTokens, markIntegrationError, logSync } from '../oauth-handler'
import { AscoraClient } from './client'
import { prisma } from '@/lib/prisma'
import type { NIRJobPayload } from '../xero/nir-sync'

const ASCORA_BASE = 'https://api.ascora.com.au/api/v1'

function getAscoraJobTypeId(damageType: NIRJobPayload['damageType']): number {
  switch (damageType) {
    case 'WATER':  return parseInt(process.env.ASCORA_JOB_TYPE_WATER  || '1')
    case 'FIRE':   return parseInt(process.env.ASCORA_JOB_TYPE_FIRE   || '2')
    case 'MOULD':  return parseInt(process.env.ASCORA_JOB_TYPE_MOULD  || '3')
    default:       return parseInt(process.env.ASCORA_JOB_TYPE_WATER  || '1')
  }
}

function cents(c: number): number { return Math.round(c) / 100 }

export async function syncNIRJobToAscora(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ ascoraJobId: string; ascoraJobNumber?: string }> {
  const tokens = await getTokens(integrationId)
  if (!tokens.accessToken) throw new Error('Ascora not connected')

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId }, select: { companyId: true },
  })

  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new AscoraClient(integrationId, integration?.companyId || undefined)
    await client.refreshAccessToken()
    const freshTokens = await getTokens(integrationId)
    if (!freshTokens.accessToken) throw new Error('Ascora token refresh failed')
    accessToken = freshTokens.accessToken
  }

  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }

  const damageLabel = [job.damageType, job.waterCategory ? `Cat.${job.waterCategory}` : '', job.waterClass ? `Class ${job.waterClass}` : ''].filter(Boolean).join(' ')

  const ascoraJob = {
    jobTypeId: getAscoraJobTypeId(job.damageType),
    statusId: 2, // Completed
    clientName: job.clientName,
    ...(job.clientEmail && { clientEmail: job.clientEmail }),
    ...(job.clientPhone && { clientPhone: job.clientPhone }),
    propertyAddress: job.propertyAddress,
    jobDescription: [`NIR: ${job.reportNumber}`, `Damage: ${damageLabel}`, job.notes || ''].filter(Boolean).join(' | '),
    damageCategory: damageLabel,
    ...(job.insuranceClaim && { insuranceClaimNumber: job.insuranceClaim }),
    inspectionDate: job.inspectionDate.toISOString().split('T')[0],
    ...(job.technician && { technicianName: job.technician }),
    externalReferenceId: job.reportId,
    lineItems: job.scopeItems.map(item => ({
      description: item.description,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceExGST: cents(item.unitPriceExGST),
      gstAmount: cents(item.unitPriceExGST * item.quantity * (item.gstRate / 100)),
      totalIncGST: cents(item.unitPriceExGST * item.quantity * (1 + item.gstRate / 100)),
      ...(item.iicrcRef && { iicrcReference: item.iicrcRef }),
    })),
  }

  const res = await fetch(`${ASCORA_BASE}/jobs`, { method: 'POST', headers, body: JSON.stringify(ascoraJob) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    await markIntegrationError(integrationId, `Ascora error: ${res.statusText}`)
    throw new Error(`Ascora API error: ${res.statusText} — ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  const ascoraJobId = data?.id || data?.jobId || data?.uuid
  if (!ascoraJobId) throw new Error('Ascora: no job ID in response')

  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)
  return { ascoraJobId: String(ascoraJobId), ascoraJobNumber: data?.jobNumber }
}
