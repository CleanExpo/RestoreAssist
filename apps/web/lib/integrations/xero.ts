/**
 * Xero Integration Library
 *
 * Handles syncing invoices and other data to Xero accounting software.
 * Uses Xero API v2 with OAuth 2.0 authentication.
 */

import { Integration } from '@prisma/client'

interface XeroInvoice {
  Type: 'ACCREC' // Accounts Receivable (customer invoice)
  Contact: {
    Name: string
    EmailAddress?: string
    Phones?: Array<{
      PhoneType: string
      PhoneNumber: string
    }>
  }
  Date: string // YYYY-MM-DD
  DueDate: string // YYYY-MM-DD
  InvoiceNumber: string
  Reference?: string
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED'
  LineItems: Array<{
    Description: string
    Quantity: number
    UnitAmount: number // Excluding tax
    AccountCode?: string
    TaxType: string
    LineAmount: number // Excluding tax
  }>
  CurrencyCode?: string
}

interface XeroInvoiceResponse {
  Id: string
  InvoiceID: string
  InvoiceNumber: string
  Status: string
  Total: number
  AmountDue: number
  DateString: string
  DueDateString: string
}

/**
 * Sync invoice to Xero
 */
export async function syncInvoiceToXero(invoice: any, integration: Integration) {
  if (!integration.accessToken) {
    throw new Error('No access token available for Xero')
  }

  if (!integration.tenantId) {
    throw new Error('No tenant ID available for Xero')
  }

  // Map invoice status to Xero status
  const xeroStatus = mapInvoiceStatusToXero(invoice.status)

  // Prepare Xero invoice payload
  const xeroInvoice: XeroInvoice = {
    Type: 'ACCREC',
    Contact: {
      Name: invoice.customerName,
      ...(invoice.customerEmail && { EmailAddress: invoice.customerEmail }),
      ...(invoice.customerPhone && {
        Phones: [
          {
            PhoneType: 'DEFAULT',
            PhoneNumber: invoice.customerPhone
          }
        ]
      })
    },
    Date: formatDateForXero(invoice.invoiceDate),
    DueDate: formatDateForXero(invoice.dueDate),
    InvoiceNumber: invoice.invoiceNumber,
    ...(invoice.customerABN && { Reference: `ABN: ${invoice.customerABN}` }),
    Status: xeroStatus,
    LineItems: invoice.lineItems.map((item: any) => ({
      Description: item.description + (item.category ? ` (${item.category})` : ''),
      Quantity: item.quantity,
      UnitAmount: (item.unitPrice / 100).toFixed(2), // Convert cents to dollars
      TaxType: item.gstRate === 10 ? 'OUTPUT' : 'NONE', // Australian GST
      LineAmount: (item.subtotal / 100).toFixed(2) // Subtotal excluding GST
    })),
    CurrencyCode: invoice.currency || 'AUD'
  }

  // Add discount as negative line item if present
  if (invoice.discountAmount && invoice.discountAmount > 0) {
    xeroInvoice.LineItems.push({
      Description: 'Discount',
      Quantity: 1,
      UnitAmount: -(invoice.discountAmount / 100).toFixed(2),
      TaxType: 'NONE',
      LineAmount: -(invoice.discountAmount / 100).toFixed(2)
    })
  }

  // Add shipping as line item if present
  if (invoice.shippingAmount && invoice.shippingAmount > 0) {
    xeroInvoice.LineItems.push({
      Description: 'Shipping & Delivery',
      Quantity: 1,
      UnitAmount: (invoice.shippingAmount / 100).toFixed(2),
      TaxType: 'OUTPUT',
      LineAmount: (invoice.shippingAmount / 100).toFixed(2)
    })
  }

  // Make API request to Xero
  const response = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${integration.accessToken}`,
      'Xero-tenant-id': integration.tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ Invoices: [xeroInvoice] })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `Xero API error: ${response.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  const data = await response.json()

  if (!data.Invoices || data.Invoices.length === 0) {
    throw new Error('No invoice returned from Xero API')
  }

  const xeroInvoiceResponse = data.Invoices[0] as XeroInvoiceResponse

  return {
    invoiceId: xeroInvoiceResponse.InvoiceID,
    invoiceNumber: xeroInvoiceResponse.InvoiceNumber,
    status: xeroInvoiceResponse.Status,
    total: xeroInvoiceResponse.Total,
    amountDue: xeroInvoiceResponse.AmountDue,
    provider: 'xero',
    rawResponse: xeroInvoiceResponse
  }
}

/**
 * Get invoice from Xero by ID
 */
export async function getXeroInvoice(externalInvoiceId: string, integration: Integration) {
  if (!integration.accessToken) {
    throw new Error('No access token available for Xero')
  }

  if (!integration.tenantId) {
    throw new Error('No tenant ID available for Xero')
  }

  const response = await fetch(
    `https://api.xero.com/api.xro/2.0/Invoices/${externalInvoiceId}`,
    {
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Xero-tenant-id': integration.tenantId,
        'Accept': 'application/json'
      }
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `Xero API error: ${response.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  const data = await response.json()
  return data.Invoices[0]
}

/**
 * Update invoice status in Xero (e.g., mark as paid)
 */
export async function updateXeroInvoiceStatus(
  externalInvoiceId: string,
  status: 'AUTHORISED' | 'PAID' | 'VOIDED',
  integration: Integration
) {
  if (!integration.accessToken) {
    throw new Error('No access token available for Xero')
  }

  if (!integration.tenantId) {
    throw new Error('No tenant ID available for Xero')
  }

  const response = await fetch(
    `https://api.xero.com/api.xro/2.0/Invoices/${externalInvoiceId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Xero-tenant-id': integration.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        Invoices: [{ InvoiceID: externalInvoiceId, Status: status }]
      })
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `Xero API error: ${response.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  return await response.json()
}

/**
 * Helper: Map RestoreAssist invoice status to Xero status
 */
function mapInvoiceStatusToXero(status: string): 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' {
  switch (status) {
    case 'DRAFT':
      return 'DRAFT'
    case 'SENT':
    case 'VIEWED':
      return 'SUBMITTED'
    case 'PARTIALLY_PAID':
    case 'PAID':
    case 'OVERDUE':
      return 'AUTHORISED' // Must be authorised to accept payments
    default:
      return 'DRAFT'
  }
}

/**
 * Helper: Format date for Xero API (YYYY-MM-DD)
 */
function formatDateForXero(date: Date | string): string {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}
