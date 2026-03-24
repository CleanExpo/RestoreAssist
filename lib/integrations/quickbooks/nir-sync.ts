/**
 * QuickBooks Online NIR Sync Module
 *
 * Translates a completed NIR into a QuickBooks Online invoice.
 * QuickBooks is realm-scoped (each company is a separate realm).
 *
 * AU tax codes used:
 *   GST        — 10% Goods and Services Tax (OUTPUT)
 *   EXEMPTINC  — GST Exempt
 *
 * Account IDs (configure in env vars — QBO uses numeric IDs not codes):
 *   QBO_INCOME_ACCOUNT_WATER    default: '1' (Income)
 *   QBO_INCOME_ACCOUNT_FIRE     default: '1'
 *   QBO_INCOME_ACCOUNT_MOULD    default: '1'
 *
 * QuickBooks OAuth tokens must include 'com.intuit.quickbooks.accounting' scope.
 * Realm ID is captured at OAuth callback and stored in integration.realmId.
 */

import { getTokens, storeTokens, markIntegrationError, logSync } from '../oauth-handler'
import { QuickBooksClient } from './client'
import { prisma } from '@/lib/prisma'
import type { NIRJobPayload } from '../xero/nir-sync'

// ─── QBO TYPES ────────────────────────────────────────────────────────────────

interface QBOInvoice {
  CustomerRef: { value: string; name?: string }
  TxnDate: string
  DueDate?: string
  DocNumber?: string
  PrivateNote?: string
  Line: QBOLine[]
  CurrencyRef: { value: 'AUD' }
  GlobalTaxCalculation: 'TaxExcluded'
}

interface QBOLine {
  DetailType: 'SalesItemLineDetail' | 'SubTotalLineDetail' | 'DescriptionOnly'
  Amount: number
  Description?: string
  SalesItemLineDetail?: {
    ItemRef?: { value: string; name?: string }
    Qty?: number
    UnitPrice?: number
    TaxCodeRef?: { value: string }
  }
}

interface QBOCustomer {
  DisplayName: string
  PrimaryEmailAddr?: { Address: string }
  PrimaryPhone?: { FreeFormNumber: string }
  BillAddr?: { Line1: string }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatQBODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

async function findOrCreateCustomer(
  accessToken: string,
  realmId: string,
  job: NIRJobPayload
): Promise<string> {
  const base = `https://quickbooks.api.intuit.com/v3/company/${realmId}`
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  // Search for existing customer by name
  const searchQuery = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${job.clientName.replace(/'/g, "''")}' MAXRESULTS 1`)
  const searchRes = await fetch(`${base}/query?query=${searchQuery}`, { headers })
  if (searchRes.ok) {
    const searchData = await searchRes.json()
    const existing = searchData?.QueryResponse?.Customer?.[0]
    if (existing?.Id) return existing.Id
  }

  // Create new customer
  const customer: QBOCustomer = {
    DisplayName: job.clientName,
    ...(job.clientEmail && { PrimaryEmailAddr: { Address: job.clientEmail } }),
    ...(job.clientPhone && { PrimaryPhone: { FreeFormNumber: job.clientPhone } }),
    ...(job.clientAddress && { BillAddr: { Line1: job.clientAddress } }),
  }

  const createRes = await fetch(`${base}/customer`, {
    method: 'POST',
    headers,
    body: JSON.stringify(customer),
  })

  if (!createRes.ok) {
    throw new Error(`QBO customer create failed: ${createRes.statusText}`)
  }

  const created = await createRes.json()
  return created.Customer.Id
}

// ─── MAIN SYNC FUNCTION ───────────────────────────────────────────────────────

export async function syncNIRJobToQuickBooks(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ qboInvoiceId: string; qboDocNumber: string; status: string }> {
  const tokens = await getTokens(integrationId)

  if (!tokens.accessToken) {
    throw new Error('QuickBooks integration not connected')
  }

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { realmId: true },
  })

  if (!integration?.realmId) {
    throw new Error('QuickBooks realm ID not available. Re-connect the integration.')
  }

  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new QuickBooksClient(integrationId, integration.realmId)
    const refreshed = await client.refreshAccessToken(tokens.refreshToken)
    await storeTokens(integrationId, refreshed.access_token, refreshed.refresh_token, refreshed.expires_in)
    accessToken = refreshed.access_token
  }

  const base = `https://quickbooks.api.intuit.com/v3/company/${integration.realmId}`
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  // Find or create the customer
  const customerId = await findOrCreateCustomer(accessToken, integration.realmId, job)

  // Build line items
  const lines: QBOLine[] = job.scopeItems.map(item => ({
    DetailType: 'SalesItemLineDetail',
    Amount: centsToDollars(item.subtotalExGST),
    Description: item.iicrcRef
      ? `${item.description} — ${item.category} [${item.iicrcRef}]`
      : `${item.description} — ${item.category}`,
    SalesItemLineDetail: {
      Qty: item.quantity,
      UnitPrice: centsToDollars(item.unitPriceExGST),
      TaxCodeRef: { value: item.gstRate === 10 ? 'GST' : 'EXEMPTINC' },
    },
  }))

  const dueDate = new Date(job.reportDate)
  dueDate.setDate(dueDate.getDate() + 14)

  const invoice: QBOInvoice = {
    CustomerRef: { value: customerId, name: job.clientName },
    TxnDate: formatQBODate(job.reportDate),
    DueDate: formatQBODate(dueDate),
    DocNumber: job.reportNumber,
    PrivateNote: [
      `NIR Report ID: ${job.reportId}`,
      job.insuranceClaim ? `Insurance Claim: ${job.insuranceClaim}` : '',
      job.technician ? `Technician: ${job.technician}` : '',
      job.notes || '',
    ].filter(Boolean).join(' | '),
    Line: lines,
    CurrencyRef: { value: 'AUD' },
    GlobalTaxCalculation: 'TaxExcluded',
  }

  const res = await fetch(`${base}/invoice`, {
    method: 'POST',
    headers,
    body: JSON.stringify(invoice),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    await markIntegrationError(integrationId, `QBO API error: ${res.statusText}`)
    throw new Error(`QBO API error: ${res.statusText} — ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  const created = data.Invoice

  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)

  return {
    qboInvoiceId: created.Id,
    qboDocNumber: created.DocNumber,
    status: created.EmailStatus || 'NeedToSend',
  }
}
