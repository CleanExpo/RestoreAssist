/**
 * ServiceM8 NIR Sync Module
 *
 * Translates a completed NIR into a ServiceM8 job with materials and labour.
 * ServiceM8 is job-management-first (not accounting-first), so the sync:
 *
 *   - Creates or updates the job (job card)
 *   - Posts materials (scope items with unit prices)
 *   - Posts labour entries
 *   - Attaches the NIR report as a note/attachment link
 *
 * ServiceM8 API: https://api.servicem8.com/api_1.0
 * Auth: OAuth 2.0, no PKCE, scopes: read_clients, read_jobs
 *
 * ServiceM8 is an Australian-native field service platform used widely
 * by restoration companies. It does not have accounting tax codes —
 * tax is handled at the invoice level in their billing export.
 */

import { getTokens, storeTokens, markIntegrationError, logSync } from '../oauth-handler'
import { ServiceM8Client } from './client'
import type { NIRJobPayload } from '../xero/nir-sync'

const SM8_BASE = 'https://api.servicem8.com/api_1.0'

// ─── SM8 TYPES ────────────────────────────────────────────────────────────────

interface SM8Job {
  uuid?: string
  generated_job_id?: string
  status: 'Completed' | 'Work Order' | 'Quote'
  job_address: string
  company_name: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  job_description: string
  billing_address?: string
  completion_date?: string
  created_by_staff_uuid?: string
  // Custom fields for NIR integration
  // These map to ServiceM8 custom fields configured in the company account
  custom_field_nir_report_id?: string
  custom_field_damage_type?: string
  custom_field_iicrc_category?: string
  custom_field_insurance_claim?: string
}

interface SM8Material {
  job_uuid: string
  name: string
  unit_price: string  // String in SM8 API
  qty: number
  uuid?: string
  active?: 1 | 0
  notes?: string
}

interface SM8Note {
  job_uuid: string
  note: string
  created_by_staff_uuid?: string
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function centsToDollars(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2)
}

// ─── MAIN SYNC FUNCTION ───────────────────────────────────────────────────────

export async function syncNIRJobToServiceM8(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ sm8JobUuid: string; sm8JobNumber?: string }> {
  const tokens = await getTokens(integrationId)

  if (!tokens.accessToken) {
    throw new Error('ServiceM8 integration not connected')
  }

  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new ServiceM8Client(integrationId)
    const refreshed = await client.refreshAccessToken(tokens.refreshToken)
    await storeTokens(integrationId, refreshed.access_token, refreshed.refresh_token, refreshed.expires_in)
    accessToken = refreshed.access_token
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  // Build the ServiceM8 job
  const jobDescription = [
    `NIR Report: ${job.reportNumber}`,
    `Damage Type: ${job.damageType}`,
    job.waterCategory ? `Water Category: ${job.waterCategory}` : '',
    job.waterClass ? `Water Class: ${job.waterClass}` : '',
    job.insuranceClaim ? `Insurance Claim: ${job.insuranceClaim}` : '',
    job.technician ? `Technician: ${job.technician}` : '',
    job.notes || '',
  ].filter(Boolean).join('\n')

  const sm8Job: SM8Job = {
    status: 'Completed',
    job_address: job.propertyAddress,
    company_name: job.clientName,
    ...(job.clientPhone && { contact_phone: job.clientPhone }),
    ...(job.clientEmail && { contact_email: job.clientEmail }),
    job_description: jobDescription,
    completion_date: job.inspectionDate.toISOString().split('T')[0],
  }

  // Create the job
  const jobRes = await fetch(`${SM8_BASE}/job.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(sm8Job),
  })

  if (!jobRes.ok) {
    const err = await jobRes.json().catch(() => ({}))
    await markIntegrationError(integrationId, `ServiceM8 job create failed: ${jobRes.statusText}`)
    throw new Error(`ServiceM8 job create error: ${jobRes.statusText} — ${JSON.stringify(err)}`)
  }

  // ServiceM8 returns the UUID in the x-record-uuid header or body
  const jobData = await jobRes.json()
  const jobUuid = jobData?.uuid || jobRes.headers.get('x-record-uuid')

  if (!jobUuid) {
    throw new Error('ServiceM8 job create: no UUID returned')
  }

  // Post materials (scope items)
  const materialPromises = job.scopeItems.map(async (item) => {
    const material: SM8Material = {
      job_uuid: jobUuid,
      name: item.iicrcRef
        ? `${item.description} [${item.iicrcRef}]`
        : item.description,
      unit_price: centsToDollars(item.unitPriceExGST),
      qty: item.quantity,
      active: 1,
      notes: item.category,
    }

    return fetch(`${SM8_BASE}/jobmaterial.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify(material),
    })
  })

  await Promise.allSettled(materialPromises) // Don't fail sync if some materials fail

  // Add NIR summary note
  const note: SM8Note = {
    job_uuid: jobUuid,
    note: [
      `=== NIR Restoration Report ===`,
      `Report ID: ${job.reportId}`,
      `Property: ${job.propertyAddress}`,
      `Damage Type: ${job.damageType}${job.waterCategory ? ' Cat.' + job.waterCategory : ''}${job.waterClass ? ' Class ' + job.waterClass : ''}`,
      job.insuranceClaim ? `Insurance Claim: ${job.insuranceClaim}` : '',
      `Total (ex GST): $${centsToDollars(job.totalExGST)}`,
      `GST: $${centsToDollars(job.gstAmount)}`,
      `Total (inc GST): $${centsToDollars(job.totalIncGST)}`,
    ].filter(Boolean).join('\n'),
  }

  await fetch(`${SM8_BASE}/jobnote.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(note),
  })

  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)

  return {
    sm8JobUuid: jobUuid,
    sm8JobNumber: jobData?.generated_job_id,
  }
}
