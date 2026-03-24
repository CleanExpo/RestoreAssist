/**
 * MYOB AccountRight NIR Sync Module
 *
 * Translates a completed NIR into a MYOB Service Sale.
 * Company-file-scoped. GST/FRE tax codes. 4-xxxx account routing.
 */

import { getTokens, markIntegrationError, logSync } from '../oauth-handler'
import { MYOBClient } from './client'
import { prisma } from '@/lib/prisma'
import type { NIRJobPayload } from '../xero/nir-sync'

function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function cents(c: number): number { return Math.round(c) / 100 }

function getAccountDisplayId(damageType: NIRJobPayload['damageType']): string {
  switch (damageType) {
    case 'WATER':  return process.env.MYOB_ACCOUNT_WATER  || '4-1100'
    case 'FIRE':   return process.env.MYOB_ACCOUNT_FIRE   || '4-1200'
    case 'MOULD':  return process.env.MYOB_ACCOUNT_MOULD  || '4-1300'
    default:       return process.env.MYOB_ACCOUNT_WATER  || '4-1100'
  }
}

async function findOrCreateCustomer(accessToken: string, companyFileUrl: string, job: NIRJobPayload): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json', 'x-myobapi-version': 'v2' }
  const searchUrl = `${companyFileUrl}/Contact/Customer?$filter=CompanyName eq '${encodeURIComponent(job.clientName)}'&$top=1`
  const searchRes = await fetch(searchUrl, { headers })
  if (searchRes.ok) {
    const d = await searchRes.json()
    const existing = d?.Items?.[0]
    if (existing?.UID) return existing.UID
  }
  const createRes = await fetch(`${companyFileUrl}/Contact/Customer`, {
    method: 'POST', headers,
    body: JSON.stringify({
      IsIndividual: false,
      CompanyName: job.clientName,
      IsActive: true,
      Addresses: [{ Type: 'Location', ...(job.clientEmail && { Email: job.clientEmail }), ...(job.clientPhone && { Phone1: job.clientPhone }) }],
    }),
  })
  if (!createRes.ok) throw new Error(`MYOB customer create failed: ${createRes.statusText}`)
  const uid = (createRes.headers.get('Location') || '').split('/').pop()
  if (!uid) throw new Error('MYOB customer create: no UID in response')
  return uid
}

export async function syncNIRJobToMYOB(
  integrationId: string,
  job: NIRJobPayload
): Promise<{ myobSaleId: string }> {
  const tokens = await getTokens(integrationId)
  if (!tokens.accessToken) throw new Error('MYOB not connected')

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId }, select: { companyId: true },
  })
  if (!integration?.companyId) throw new Error('MYOB company file ID missing. Re-connect.')

  let accessToken = tokens.accessToken
  if (tokens.isExpired && tokens.refreshToken) {
    const client = new MYOBClient(integrationId)
    await client.refreshAccessToken()
    const freshTokens = await getTokens(integrationId)
    if (!freshTokens.accessToken) throw new Error('MYOB token refresh failed')
    accessToken = freshTokens.accessToken
  }

  const companyFileUrl = `https://api.myob.com/accountright/${integration.companyId}`
  const accountDisplayId = getAccountDisplayId(job.damageType)
  const customerId = await findOrCreateCustomer(accessToken, companyFileUrl, job)
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json', 'x-myobapi-version': 'v2' }

  const sale = {
    Customer: { UID: customerId, Name: job.clientName },
    Date: formatDate(job.reportDate),
    CustomerPurchaseOrderNumber: job.reportNumber,
    IsTaxInclusive: false,
    Lines: job.scopeItems.map(item => ({
      Type: 'Transaction',
      Description: item.iicrcRef ? `${item.description} (${item.category}) [${item.iicrcRef}]` : `${item.description} (${item.category})`,
      Units: item.quantity,
      UnitPrice: cents(item.unitPriceExGST),
      DiscountPercent: 0,
      Total: cents(item.subtotalExGST),
      Account: { DisplayID: accountDisplayId },
      TaxCode: { Code: item.gstRate === 10 ? 'GST' : 'FRE' },
    })),
    InvoiceDeliveryStatus: 'Print',
    Terms: { PaymentIsDue: 'DaysAfterInvoiceDate', DiscountDate: 0, BalanceDueDate: 14 },
    Comment: [`NIR: ${job.reportId}`, job.insuranceClaim ? `Claim: ${job.insuranceClaim}` : '', job.propertyAddress].filter(Boolean).join(' | '),
  }

  const res = await fetch(`${companyFileUrl}/Sale/Invoice/Service`, { method: 'POST', headers, body: JSON.stringify(sale) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    await markIntegrationError(integrationId, `MYOB error: ${res.statusText}`)
    throw new Error(`MYOB API error: ${res.statusText} — ${JSON.stringify(err)}`)
  }

  const myobSaleId = (res.headers.get('Location') || '').split('/').pop() || 'unknown'
  await logSync(integrationId, 'FULL', 'SUCCESS', 1, 0)
  return { myobSaleId }
}
