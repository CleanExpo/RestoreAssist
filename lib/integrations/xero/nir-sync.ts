/**
 * Xero NIR Sync Module
 *
 * Translates a completed NIR (National Inspection Report) into a Xero
 * invoice and contact record. Restoration-specific mappings:
 *
 *   - NIR scope items → Xero line items (quantity, unit price, GST)
 *   - NIR client → Xero Contact (create or match by name/email/ABN)
 *   - NIR report reference → Xero invoice reference field
 *   - IICRC damage category → Xero tracking category (optional)
 *   - Water/fire/mould classification → account code routing
 *
 * Account codes (configure in XERO_ACCOUNT_CODES env vars):
 *   XERO_ACCOUNT_WATER    default: '200' (Water Restoration)
 *   XERO_ACCOUNT_FIRE     default: '201' (Fire & Smoke Restoration)
 *   XERO_ACCOUNT_MOULD    default: '202' (Mould Remediation)
 *   XERO_ACCOUNT_GENERAL  default: '200' (General Restoration)
 */

import { getTokens, storeTokens, markIntegrationError, logSync } from '../oauth-handler'
import { XeroClient } from './client'
import { prisma } from '@/lib/prisma'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface NIRJobPayload {
  reportId: string
  clientName: string
  clientEmail?: string
  clientPhone?: string
  clientABN?: string
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

export interface NIRScopeItem {
  description: string
  category: string  // e.g. 'Drying Equipment', 'Labour', 'Materials'
  quantity: number
  unit: string     // e.g. 'day', 'hour', 'each', 'm²'
  unitPriceExGST: number  // cents
  gstRate: number  // 0 or 10 (AU)
  subtotalExGST: number   // cents
  iicrcRef?: string       // e.g. 'S500 §14'
}

interface XeroInvoicePayload {
  Type: 'ACCREC'
  Contact: { Name: string; EmailAddress?: string; Phones?: Array<{ PhoneType: string; PhoneNumber: string }>; TaxNumber?: string }
  Date: string
  DueDate: string
  InvoiceNumber: string
  Reference?: string
  Status: 'DRAFT' | 'AUTHORISED'
  LineItems: XeroLineItem[]
  CurrencyCode: 'AUD'
  BrandingThemeID?: string
}

interface XeroLineItem {
  Description: string
  Quantity: number
  UnitAmount: number
  AccountCode?: string
  TaxType: 'OUTPUT' | 'NONE'
  LineAmount: number
  Tracking?: Array<{ Name: string; Option: string }>
}

// ─── ACCOUNT CODE HELPERS ────────────────────────────────────────────────────

function getAccountCode(damageType: NIRJobPayload['damageType']): string {
  switch (damageType) {
    case 'WATER':   return process.env.XERO_ACCOUNT_WATER   || '200'
    case 'FIRE':    return process.env.XERO_ACCOUNT_FIRE    || '201'
    case 'MOULD':   return process.env.XERO_ACCOUNT_MOULD   || '202'
    default:        return process.env.XERO_ACCOUNT_GENERAL || '200'
  }
}

function formatXeroDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

// ─── MAIN SYNC FUNCTION ───────────────────────────────────────────────────────

export async function syncNIRJobToXero(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ xeroInvoiceId: string; xeroInvoiceNumber: string; status: string }> {
  const tokens = await getTokens(integrationId)

  if (!tokens.accessToken) {
    throw new Error('Xero integration not connected — no access token')
  }

  // Retrieve tenantId stored at OAuth time
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    select: { tenantId: true },
  })

  if (!integration?.tenantId) {
    throw new Error('Xero tenant ID not available. Re-connect the integration.')
  }

  // If token is expired, attempt refresh via XeroClient
  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new XeroClient(integrationId, integration.tenantId)
    const refreshed = await client.refreshAccessToken(tokens.refreshToken)
    await storeTokens(integrationId, refreshed.access_token, refreshed.refresh_token, refreshed.expires_in)
    accessToken = refreshed.access_token
  }

  const accountCode = getAccountCode(job.damageType)

  // Build line items from NIR scope items
  const lineItems: XeroLineItem[] = job.scopeItems.map(item => ({
    Description: item.iicrcRef
      ? `${item.description} (${item.category}) [${item.iicrcRef}]`
      : `${item.description} (${item.category})`,
    Quantity: item.quantity,
    UnitAmount: centsToDollars(item.unitPriceExGST),
    AccountCode: accountCode,
    TaxType: item.gstRate === 10 ? 'OUTPUT' : 'NONE',
    LineAmount: centsToDollars(item.subtotalExGST),
    ...(process.env.XERO_TRACKING_CATEGORY ? {
      Tracking: [{
        Name: process.env.XERO_TRACKING_CATEGORY,
        Option: job.damageType,
      }]
    } : {})
  }))

  // Add technician note as non-billable line if present
  if (job.technician) {
    lineItems.push({
      Description: `Technician: ${job.technician}${job.inspectionDate ? ' | Inspection: ' + formatXeroDate(job.inspectionDate) : ''}`,
      Quantity: 0,
      UnitAmount: 0,
      TaxType: 'NONE',
      LineAmount: 0,
    })
  }

  // Build Xero invoice
  const dueDate = new Date(job.reportDate)
  dueDate.setDate(dueDate.getDate() + 14) // 14-day terms (configurable)

  const invoice: XeroInvoicePayload = {
    Type: 'ACCREC',
    Contact: {
      Name: job.clientName,
      ...(job.clientEmail && { EmailAddress: job.clientEmail }),
      ...(job.clientPhone && { Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: job.clientPhone }] }),
      ...(job.clientABN && { TaxNumber: job.clientABN }),
    },
    Date: formatXeroDate(job.reportDate),
    DueDate: formatXeroDate(dueDate),
    InvoiceNumber: job.reportNumber,
    Reference: `NIR-${job.reportId}${job.insuranceClaim ? ' | Claim: ' + job.insuranceClaim : ''}`,
    Status: 'DRAFT',
    LineItems: lineItems,
    CurrencyCode: 'AUD',
  }

  const response = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': integration.tenantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ Invoices: [invoice] }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    await markIntegrationError(integrationId, `Xero API error: ${response.statusText}`)
    throw new Error(`Xero API error: ${response.statusText} — ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  const created = data.Invoices?.[0]

  if (!created) {
    throw new Error('Xero returned empty invoice response')
  }

  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)

  return {
    xeroInvoiceId: created.InvoiceID,
    xeroInvoiceNumber: created.InvoiceNumber,
    status: created.Status,
  }
}
