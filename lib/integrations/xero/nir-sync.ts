/**
 * Xero NIR Sync Module
 *
 * Translates a completed NIR into a Xero invoice.
 * - NIR scope items → Xero line items (quantity, unit price, AU GST)
 * - NIR client → Xero Contact (create or match by name/email/ABN)
 * - NIR report reference → Xero invoice reference field
 * - Damage type (WATER/FIRE/MOULD) → configurable Xero account code
 *
 * Account codes (env vars, defaults shown):
 *   XERO_ACCOUNT_WATER=200  XERO_ACCOUNT_FIRE=201  XERO_ACCOUNT_MOULD=202
 */

import { getTokens, storeTokens, markIntegrationError, logSync } from '../oauth-handler'
import { XeroClient } from './client'
import { prisma } from '@/lib/prisma'

export interface NIRScopeItem {
  description: string
  category: string
  quantity: number
  unit: string
  unitPriceExGST: number  // cents
  gstRate: number         // 0 or 10
  subtotalExGST: number   // cents
  iicrcRef?: string
}

export interface NIRJobPayload {
  reportId: string
  clientName: string
  clientEmail?: string
  clientPhone?: string
  clientAddress?: string
  propertyAddress: string
  reportNumber: string
  damageType: 'WATER' | 'FIRE' | 'MOULD' | 'GENERAL'
  waterCategory?: '1' | '2' | '3'
  waterClass?: '1' | '2' | '3' | '4'
  scopeItems: NIRScopeItem[]
  totalExGST: number   // cents
  gstAmount: number    // cents
  totalIncGST: number  // cents
  inspectionDate: Date
  reportDate: Date
  technician?: string
  insuranceClaim?: string
  notes?: string
}

function getAccountCode(damageType: NIRJobPayload['damageType']): string {
  switch (damageType) {
    case 'WATER':  return process.env.XERO_ACCOUNT_WATER   || '200'
    case 'FIRE':   return process.env.XERO_ACCOUNT_FIRE    || '201'
    case 'MOULD':  return process.env.XERO_ACCOUNT_MOULD   || '202'
    default:       return process.env.XERO_ACCOUNT_GENERAL || '200'
  }
}

function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function cents(c: number): number { return Math.round(c) / 100 }

export async function syncNIRJobToXero(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ xeroInvoiceId: string; xeroInvoiceNumber: string; status: string }> {
  const tokens = await getTokens(integrationId)
  if (!tokens.accessToken) throw new Error('Xero not connected')

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId }, select: { tenantId: true },
  })
  if (!integration?.tenantId) throw new Error('Xero tenant ID missing. Re-connect.')

  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new XeroClient(integrationId, integration.tenantId)
    const r = await client.refreshAccessToken(tokens.refreshToken)
    await storeTokens(integrationId, r.access_token, r.refresh_token, r.expires_in)
    accessToken = r.access_token
  }

  const accountCode = getAccountCode(job.damageType)
  const dueDate = new Date(job.reportDate)
  dueDate.setDate(dueDate.getDate() + 14)

  const lineItems = [
    ...job.scopeItems.map(item => ({
      Description: item.iicrcRef ? `${item.description} (${item.category}) [${item.iicrcRef}]`
                                 : `${item.description} (${item.category})`,
      Quantity: item.quantity,
      UnitAmount: cents(item.unitPriceExGST),
      AccountCode: accountCode,
      TaxType: item.gstRate === 10 ? 'OUTPUT' : 'NONE',
      LineAmount: cents(item.subtotalExGST),
    })),
    ...(job.technician ? [{
      Description: `Technician: ${job.technician} | Inspection: ${formatDate(job.inspectionDate)}`,
      Quantity: 0, UnitAmount: 0, TaxType: 'NONE', LineAmount: 0,
    }] : []),
  ]

  const invoice = {
    Type: 'ACCREC',
    Contact: {
      Name: job.clientName,
      ...(job.clientEmail && { EmailAddress: job.clientEmail }),
      ...(job.clientPhone && { Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: job.clientPhone }] }),
    },
    Date: formatDate(job.reportDate),
    DueDate: formatDate(dueDate),
    InvoiceNumber: job.reportNumber,
    Reference: `NIR-${job.reportId}${job.insuranceClaim ? ' | Claim: ' + job.insuranceClaim : ''}`,
    Status: 'DRAFT',
    LineItems: lineItems,
    CurrencyCode: 'AUD',
  }

  const res = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': integration.tenantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ Invoices: [invoice] }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    await markIntegrationError(integrationId, `Xero error: ${res.statusText}`)
    throw new Error(`Xero API error: ${res.statusText} — ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  const created = data.Invoices?.[0]
  if (!created) throw new Error('Xero returned empty invoice response')

  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)
  return { xeroInvoiceId: created.InvoiceID, xeroInvoiceNumber: created.InvoiceNumber, status: created.Status }
}
