/**
 * QuickBooks Integration Library
 *
 * Handles syncing invoices and other data to QuickBooks Online.
 * Uses QuickBooks API v3 with OAuth 2.0 authentication.
 */

import { Integration } from '@prisma/client'

interface QuickBooksInvoice {
  Line: Array<{
    DetailType: 'SalesItemLineDetail'
    Amount: number
    Description?: string
    SalesItemLineDetail: {
      Qty: number
      UnitPrice: number
      TaxCodeRef?: {
        value: string // "TAX" for taxable, "NON" for non-taxable
      }
    }
  }>
  CustomerRef: {
    name?: string
    value: string // Customer ID (create if not exists)
  }
  TxnDate: string // YYYY-MM-DD
  DueDate: string // YYYY-MM-DD
  DocNumber?: string // Invoice number
  PrivateNote?: string
  CustomerMemo?: {
    value: string
  }
  BillEmail?: {
    Address: string
  }
  CurrencyRef?: {
    value: string
  }
}

interface QuickBooksInvoiceResponse {
  Id: string
  DocNumber: string
  TxnDate: string
  DueDate: string
  TotalAmt: number
  Balance: number
  Line: any[]
}

/**
 * Sync invoice to QuickBooks
 */
export async function syncInvoiceToQuickBooks(invoice: any, integration: Integration) {
  if (!integration.accessToken) {
    throw new Error('No access token available for QuickBooks')
  }

  if (!integration.realmId) {
    throw new Error('No realm ID (company ID) available for QuickBooks')
  }

  // Find or create customer in QuickBooks
  const customerId = await findOrCreateQuickBooksCustomer(
    {
      name: invoice.customerName,
      email: invoice.customerEmail,
      phone: invoice.customerPhone
    },
    integration
  )

  // Prepare line items
  const lineItems: QuickBooksInvoice['Line'] = invoice.lineItems.map((item: any) => {
    const amount = (item.total / 100) // Convert cents to dollars with GST included
    const unitPrice = (item.unitPrice / 100) // Unit price excluding GST

    return {
      DetailType: 'SalesItemLineDetail',
      Amount: parseFloat(amount.toFixed(2)),
      Description: item.description + (item.category ? ` (${item.category})` : ''),
      SalesItemLineDetail: {
        Qty: item.quantity,
        UnitPrice: parseFloat(unitPrice.toFixed(2)),
        ...(item.gstRate > 0 && {
          TaxCodeRef: { value: 'TAX' } // Taxable
        })
      }
    }
  })

  // Add discount as negative line item if present
  if (invoice.discountAmount && invoice.discountAmount > 0) {
    lineItems.push({
      DetailType: 'SalesItemLineDetail',
      Amount: -(invoice.discountAmount / 100),
      Description: 'Discount',
      SalesItemLineDetail: {
        Qty: 1,
        UnitPrice: -(invoice.discountAmount / 100)
      }
    })
  }

  // Add shipping as line item if present
  if (invoice.shippingAmount && invoice.shippingAmount > 0) {
    lineItems.push({
      DetailType: 'SalesItemLineDetail',
      Amount: invoice.shippingAmount / 100,
      Description: 'Shipping & Delivery',
      SalesItemLineDetail: {
        Qty: 1,
        UnitPrice: invoice.shippingAmount / 100,
        TaxCodeRef: { value: 'TAX' }
      }
    })
  }

  // Prepare QuickBooks invoice payload
  const qbInvoice: QuickBooksInvoice = {
    Line: lineItems,
    CustomerRef: {
      value: customerId,
      name: invoice.customerName
    },
    TxnDate: formatDateForQuickBooks(invoice.invoiceDate),
    DueDate: formatDateForQuickBooks(invoice.dueDate),
    DocNumber: invoice.invoiceNumber,
    ...(invoice.notes && { PrivateNote: invoice.notes }),
    ...(invoice.terms && {
      CustomerMemo: { value: invoice.terms }
    }),
    ...(invoice.customerEmail && {
      BillEmail: { Address: invoice.customerEmail }
    }),
    ...(invoice.currency && invoice.currency !== 'AUD' && {
      CurrencyRef: { value: invoice.currency }
    })
  }

  // Make API request to QuickBooks
  const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'

  const response = await fetch(
    `${baseUrl}/v3/company/${integration.realmId}/invoice`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(qbInvoice)
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `QuickBooks API error: ${response.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  const data = await response.json()
  const qbInvoiceResponse = data.Invoice as QuickBooksInvoiceResponse

  return {
    invoiceId: qbInvoiceResponse.Id,
    invoiceNumber: qbInvoiceResponse.DocNumber,
    total: qbInvoiceResponse.TotalAmt,
    balance: qbInvoiceResponse.Balance,
    provider: 'quickbooks',
    rawResponse: qbInvoiceResponse
  }
}

/**
 * Find or create customer in QuickBooks
 */
async function findOrCreateQuickBooksCustomer(
  customer: { name: string; email?: string; phone?: string },
  integration: Integration
): Promise<string> {
  if (!integration.accessToken || !integration.realmId) {
    throw new Error('Missing QuickBooks credentials')
  }

  const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'

  // Search for existing customer by name
  const searchQuery = `SELECT * FROM Customer WHERE DisplayName = '${customer.name.replace(/'/g, "\\'")}'`
  const searchUrl = `${baseUrl}/v3/company/${integration.realmId}/query?query=${encodeURIComponent(searchQuery)}`

  const searchResponse = await fetch(searchUrl, {
    headers: {
      'Authorization': `Bearer ${integration.accessToken}`,
      'Accept': 'application/json'
    }
  })

  if (searchResponse.ok) {
    const searchData = await searchResponse.json()
    if (searchData.QueryResponse?.Customer && searchData.QueryResponse.Customer.length > 0) {
      return searchData.QueryResponse.Customer[0].Id
    }
  }

  // Create new customer if not found
  const newCustomer = {
    DisplayName: customer.name,
    ...(customer.email && {
      PrimaryEmailAddr: { Address: customer.email }
    }),
    ...(customer.phone && {
      PrimaryPhone: { FreeFormNumber: customer.phone }
    })
  }

  const createResponse = await fetch(
    `${baseUrl}/v3/company/${integration.realmId}/customer`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(newCustomer)
    }
  )

  if (!createResponse.ok) {
    const errorData = await createResponse.json().catch(() => ({}))
    throw new Error(
      `Failed to create QuickBooks customer: ${createResponse.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  const createData = await createResponse.json()
  return createData.Customer.Id
}

/**
 * Get invoice from QuickBooks by ID
 */
export async function getQuickBooksInvoice(
  externalInvoiceId: string,
  integration: Integration
) {
  if (!integration.accessToken || !integration.realmId) {
    throw new Error('Missing QuickBooks credentials')
  }

  const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'

  const response = await fetch(
    `${baseUrl}/v3/company/${integration.realmId}/invoice/${externalInvoiceId}`,
    {
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'Accept': 'application/json'
      }
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `QuickBooks API error: ${response.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  const data = await response.json()
  return data.Invoice
}

/**
 * Helper: Format date for QuickBooks API (YYYY-MM-DD)
 */
function formatDateForQuickBooks(date: Date | string): string {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}
