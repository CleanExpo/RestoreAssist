/**
 * MYOB AccountRight NIR Sync Module
 *
 * Translates a completed NIR into a MYOB AccountRight sale (invoice).
 * MYOB uses company files — the companyFileId is stored in integration.companyId
 * after OAuth.
 *
 * Tax codes used:
 *   GST  — 10% Goods and Services Tax
 *   FRE  — GST Free
 *   N-T  — Not Reported
 *
 * Account numbers (configure in env vars):
 *   MYOB_ACCOUNT_WATER    default: '4-1100' (Water Restoration Income)
 *   MYOB_ACCOUNT_FIRE     default: '4-1200' (Fire Restoration Income)
 *   MYOB_ACCOUNT_MOULD    default: '4-1300' (Mould Remediation Income)
 *
 * MYOB API base: https://api.myob.com/accountright/{companyFileId}
 */

import { getTokens, storeTokens, markIntegrationError, logSync } from '../oauth-handler'
import { MYOBClient } from './client'
import { prisma } from '@/lib/prisma'
import type { NIRJobPayload } from '../xero/nir-sync'

// ─── MYOB TYPES ───────────────────────────────────────────────────────────────

interface MYOBSale {
  Customer: { UID: string; DisplayID?: string; Name: string }
  Date: string
  CustomerPurchaseOrderNumber?: string
  IsTaxInclusive: false
  Lines: MYOBLine[]
  InvoiceDeliveryStatus: 'Print'
  Terms: { PaymentIsDue: 'DaysAfterInvoiceDate'; DiscountDate: 0; BalanceDueDate: 14 }
  Comment?: string
  ShipToAddress?: string
}

interface MYOBLine {
  Type: 'Transaction'
  Description: string
  Units?: number
  UnitPrice?: number
  DiscountPercent: 0
  Total: number
  Account: { UID?: string; DisplayID: string }
  TaxCode: { UID?: string; Code: string }
}

interface MYOBCustomer {
  IsIndividual: boolean
  FirstName?: string
  LastName?: string
  CompanyName?: string
  IsActive: true
  Addresses?: Array<{ Type: 'Location'; Email?: string; Phone1?: string; Street?: string }>
  ABN?: string
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatMYOBDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

function getAccountDisplayId(damageType: NIRJobPayload['damageType']): string {
  switch (damageType) {
    case 'WATER':  return process.env.MYOB_ACCOUNT_WATER  || '4-1100'
    case 'FIRE':   return process.env.MYOB_ACCOUNT_FIRE   || '4-1200'
    case 'MOULD':  return process.env.MYOB_ACCOUNT_MOULD  || '4-1300'
    default:       return process.env.MYOB_ACCOUNT_WATER  || '4-1100'
  }
}

async function findOrCreateCustomer(
  accessToken: string,
  companyFileUrl: string,
  job: NIRJobPayload
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-myobapi-version': 'v2',
  }

  // Search existing customers
  const searchUrl = `${companyFileUrl}/Contact/Customer?$filter=CompanyName eq '${encodeURIComponent(job.clientName)}'&$top=1`
  const searchRes = await fetch(searchUrl, { headers })
  if (searchRes.ok) {
    const searchData = await searchRes.json()
    const existing = searchData?.Items?.[0]
    if (existing?.UID) return existing.UID
  }

  // Create new customer
  const customer: MYOBCustomer = {
    IsIndividual: false,
    CompanyName: job.clientName,
    IsActive: true,
    Addresses: [{
      Type: 'Location',
      ...(job.clientEmail && { Email: job.clientEmail }),
      ...(job.clientPhone && { Phone1: job.clientPhone }),
      ...(job.clientAddress && { Street: job.clientAddress }),
    }],
    ...(job.clientABN && { ABN: job.clientABN }),
  }

  const createRes = await fetch(`${companyFileUrl}/Contact/Customer`, {
    method: 'POST',
    headers,
    body: JSON.stringify(customer),
  })

  if (!createRes.ok) {
    throw new Error(`MYOB customer create failed: ${createRes.statusText}`)
  }

  // MYOB returns the Location header with the new UID
  const location = createRes.headers.get('Location') || ''
  const uid = location.split('/').pop()
  if (!uid) throw new Error('MYOB customer create: no UID in response')
  return uid
}

// ─── MAIN SYNC FUNCTION ───────────────────────────────────────────────────────

export async function syncNIRJobToMYOB(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ myobSaleId: string; myobNumber?: string }> {
  const tokens = await getTokens(integrationId)

  if (!tokens.accessToken) {
    throw new Error('MYOB integration not connected')
  }

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { companyId: true },
  })

  if (!integration?.companyId) {
    throw new Error('MYOB company file ID not available. Re-connect the integration.')
  }

  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new MYOBClient(integrationId)
    const refreshed = await client.refreshAccessToken(tokens.refreshToken)
    await storeTokens(integrationId, refreshed.access_token, refreshed.refresh_token, refreshed.expires_in)
    accessToken = refreshed.access_token
  }

  const companyFileUrl = `https://api.myob.com/accountright/${integration.companyId}`
  const accountDisplayId = getAccountDisplayId(job.damageType)

  const customerId = await findOrCreateCustomer(accessToken, companyFileUrl, job)

  // Build MYOB sale lines
  const lines: MYOBLine[] = job.scopeItems.map(item => ({
    Type: 'Transaction',
    Description: item.iicrcRef
      ? `${item.description} (${item.category}) [${item.iicrcRef}]`
      : `${item.description} (${item.category})`,
    Units: item.quantity,
    UnitPrice: centsToDollars(item.unitPriceExGST),
    DiscountPercent: 0,
    Total: centsToDollars(item.subtotalExGST),
    Account: { DisplayID: accountDisplayId },
    TaxCode: { Code: item.gstRate === 10 ? 'GST' : 'FRE' },
  }))

  const sale: MYOBSale = {
    Customer: { UID: customerId, Name: job.clientName },
    Date: formatMYOBDate(job.reportDate),
    CustomerPurchaseOrderNumber: job.reportNumber,
    IsTaxInclusive: false,
    Lines: lines,
    InvoiceDeliveryStatus: 'Print',
    Terms: { PaymentIsDue: 'DaysAfterInvoiceDate', DiscountDate: 0, BalanceDueDate: 14 },
    Comment: [
      `NIR Report: ${job.reportId}`,
      job.insuranceClaim ? `Claim: ${job.insuranceClaim}` : '',
      job.propertyAddress,
    ].filter(Boolean).join(' | '),
    ...(job.clientAddress && { ShipToAddress: job.clientAddress }),
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-myobapi-version': 'v2',
  }

  const res = await fetch(`${companyFileUrl}/Sale/Invoice/Service`, {
    method: 'POST',
    headers,
    body: JSON.stringify(sale),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    await markIntegrationError(integrationId, `MYOB API error: ${res.statusText}`)
    throw new Error(`MYOB API error: ${res.statusText} — ${JSON.stringify(err)}`)
  }

  const location = res.headers.get('Location') || ''
  const myobSaleId = location.split('/').pop() || 'unknown'

  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)

  return { myobSaleId }
}
