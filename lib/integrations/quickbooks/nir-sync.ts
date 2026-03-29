/**
 * QuickBooks Online NIR Sync Module
 *
 * Translates a completed NIR into a QBO invoice.
 * Realm-scoped. AU GST/EXEMPTINC tax codes.
 * Auto find-or-create Customer.
 */

import { getTokens, markIntegrationError, logSync } from '../oauth-handler'
import { QuickBooksClient } from './client'
import { prisma } from '@/lib/prisma'
import type { NIRJobPayload } from '../xero/nir-sync'

function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function cents(c: number): number { return Math.round(c) / 100 }

async function findOrCreateCustomer(accessToken: string, realmId: string, job: NIRJobPayload): Promise<string> {
  const base = `https://quickbooks.api.intuit.com/v3/company/${realmId}`
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }
  const q = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${job.clientName.replace(/'/g, "''")}'  MAXRESULTS 1`)
  const searchRes = await fetch(`${base}/query?query=${q}`, { headers })
  if (searchRes.ok) {
    const d = await searchRes.json()
    const existing = d?.QueryResponse?.Customer?.[0]
    if (existing?.Id) return existing.Id
  }
  const createRes = await fetch(`${base}/customer`, {
    method: 'POST', headers,
    body: JSON.stringify({
      DisplayName: job.clientName,
      ...(job.clientEmail && { PrimaryEmailAddr: { Address: job.clientEmail } }),
      ...(job.clientPhone && { PrimaryPhone: { FreeFormNumber: job.clientPhone } }),
    }),
  })
  if (!createRes.ok) throw new Error(`QBO customer create failed: ${createRes.statusText}`)
  const created = await createRes.json()
  return created.Customer.Id
}

export async function syncNIRJobToQuickBooks(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ qboInvoiceId: string; qboDocNumber: string; status: string }> {
  const tokens = await getTokens(integrationId)
  if (!tokens.accessToken) throw new Error('QuickBooks not connected')

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId }, select: { realmId: true },
  })
  if (!integration?.realmId) throw new Error('QuickBooks realm ID missing. Re-connect.')

  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new QuickBooksClient(integrationId, integration.realmId)
    await client.refreshAccessToken()
    const freshTokens = await getTokens(integrationId)
    if (!freshTokens.accessToken) throw new Error('QuickBooks token refresh failed')
    accessToken = freshTokens.accessToken
  }

  const customerId = await findOrCreateCustomer(accessToken, integration.realmId, job)
  const base = `https://quickbooks.api.intuit.com/v3/company/${integration.realmId}`
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }
  const dueDate = new Date(job.reportDate)
  dueDate.setDate(dueDate.getDate() + 14)

  const invoice = {
    CustomerRef: { value: customerId, name: job.clientName },
    TxnDate: formatDate(job.reportDate),
    DueDate: formatDate(dueDate),
    DocNumber: job.reportNumber,
    PrivateNote: [`NIR: ${job.reportId}`, job.insuranceClaim ? `Claim: ${job.insuranceClaim}` : '', job.technician || ''].filter(Boolean).join(' | '),
    Line: job.scopeItems.map(item => ({
      DetailType: 'SalesItemLineDetail',
      Amount: cents(item.subtotalExGST),
      Description: item.iicrcRef ? `${item.description} — ${item.category} [${item.iicrcRef}]` : `${item.description} — ${item.category}`,
      SalesItemLineDetail: {
        Qty: item.quantity,
        UnitPrice: cents(item.unitPriceExGST),
        TaxCodeRef: { value: item.gstRate === 10 ? 'GST' : 'EXEMPTINC' },
      },
    })),
    CurrencyRef: { value: 'AUD' },
    GlobalTaxCalculation: 'TaxExcluded',
  }

  const res = await fetch(`${base}/invoice`, { method: 'POST', headers, body: JSON.stringify(invoice) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    await markIntegrationError(integrationId, `QBO error: ${res.statusText}`)
    throw new Error(`QBO API error: ${res.statusText} — ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)
  return { qboInvoiceId: data.Invoice.Id, qboDocNumber: data.Invoice.DocNumber, status: data.Invoice.EmailStatus || 'NeedToSend' }
}
