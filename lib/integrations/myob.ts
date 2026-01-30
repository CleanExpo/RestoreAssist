/**
 * MYOB Integration Library
 *
 * Handles syncing invoices and other data to MYOB AccountRight.
 * Uses MYOB AccountRight API v2 with OAuth 2.0 authentication.
 */

import { Integration } from '@prisma/client'

interface MYOBInvoice {
  Number: string
  Date: string // YYYY-MM-DD
  CustomerPurchaseOrderNumber?: string
  Customer: {
    UID: string
  }
  ShipToAddress?: string
  Terms: {
    PaymentIsDue: 'InAGivenNumberOfDays' | 'OnADayOfTheMonth' | 'DayOfMonthAfterEOM' | 'CashOnDelivery'
    DiscountDate?: number
    BalanceDueDate: number
  }
  IsTaxInclusive: boolean
  Lines: Array<{
    Type: 'Transaction'
    Description: string
    Total: number
    Account?: {
      UID: string
    }
    TaxCode?: {
      UID: string
    }
    Quantity?: number
    UnitPrice?: number
  }>
  Subtotal?: number
  Freight?: number
  FreightTaxCode?: {
    UID: string
  }
  TotalTax?: number
  TotalAmount?: number
  Status: 'Open' | 'Closed'
  Comment?: string
}

interface MYOBInvoiceResponse {
  UID: string
  Number: string
  Date: string
  TotalAmount: number
  BalanceDueAmount: number
  Status: string
  URI: string
}

interface MYOBCustomer {
  UID: string
  CompanyName?: string
  FirstName?: string
  LastName?: string
  IsIndividual: boolean
}

/**
 * Sync invoice to MYOB
 */
export async function syncInvoiceToMYOB(invoice: any, integration: Integration) {
  if (!integration.accessToken) {
    throw new Error('No access token available for MYOB')
  }

  if (!integration.companyFileId) {
    throw new Error('No company file ID available for MYOB')
  }

  // Find or create customer in MYOB
  const customerUID = await findOrCreateMYOBCustomer(
    {
      name: invoice.customerName,
      email: invoice.customerEmail,
      phone: invoice.customerPhone
    },
    integration
  )

  // Calculate terms (days until due)
  const invoiceDate = new Date(invoice.invoiceDate)
  const dueDate = new Date(invoice.dueDate)
  const daysDiff = Math.ceil((dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))

  // Prepare line items
  const lines: MYOBInvoice['Lines'] = invoice.lineItems.map((item: any) => ({
    Type: 'Transaction',
    Description: item.description + (item.category ? ` (${item.category})` : ''),
    Total: item.total / 100, // Convert cents to dollars (tax inclusive)
    Quantity: item.quantity,
    UnitPrice: item.unitPrice / 100, // Unit price excluding GST
    ...(item.gstRate > 0 && {
      TaxCode: { UID: 'GST' } // Will be resolved by MYOB
    })
  }))

  // Add discount as negative line item if present
  if (invoice.discountAmount && invoice.discountAmount > 0) {
    lines.push({
      Type: 'Transaction',
      Description: 'Discount',
      Total: -(invoice.discountAmount / 100),
      Quantity: 1,
      UnitPrice: -(invoice.discountAmount / 100)
    })
  }

  // Prepare MYOB invoice payload
  const myobInvoice: MYOBInvoice = {
    Number: invoice.invoiceNumber,
    Date: formatDateForMYOB(invoice.invoiceDate),
    Customer: {
      UID: customerUID
    },
    Terms: {
      PaymentIsDue: 'InAGivenNumberOfDays',
      BalanceDueDate: Math.max(0, daysDiff)
    },
    IsTaxInclusive: true, // Australian standard
    Lines: lines,
    Status: mapInvoiceStatusToMYOB(invoice.status),
    ...(invoice.notes && { Comment: invoice.notes }),
    ...(invoice.shippingAmount && invoice.shippingAmount > 0 && {
      Freight: invoice.shippingAmount / 100,
      FreightTaxCode: { UID: 'GST' }
    })
  }

  // Make API request to MYOB
  const baseUrl = process.env.MYOB_ENVIRONMENT === 'production'
    ? 'https://ar1.api.myob.com/accountright'
    : 'https://api.myob.com/accountright'

  const response = await fetch(
    `${baseUrl}/${integration.companyFileId}/Sale/Invoice`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'x-myobapi-key': process.env.MYOB_CLIENT_ID || '',
        'x-myobapi-version': 'v2',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(myobInvoice)
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `MYOB API error: ${response.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  // MYOB returns 201 Created with Location header
  const locationHeader = response.headers.get('Location')
  if (!locationHeader) {
    throw new Error('No Location header returned from MYOB API')
  }

  // Extract UID from Location header
  const uid = locationHeader.split('/').pop()

  // Fetch the created invoice details
  const invoiceDetails = await getMYOBInvoice(uid!, integration)

  return {
    invoiceId: invoiceDetails.UID,
    invoiceNumber: invoiceDetails.Number,
    status: invoiceDetails.Status,
    total: invoiceDetails.TotalAmount,
    balance: invoiceDetails.BalanceDueAmount,
    provider: 'myob',
    rawResponse: invoiceDetails
  }
}

/**
 * Find or create customer in MYOB
 */
async function findOrCreateMYOBCustomer(
  customer: { name: string; email?: string; phone?: string },
  integration: Integration
): Promise<string> {
  if (!integration.accessToken || !integration.companyFileId) {
    throw new Error('Missing MYOB credentials')
  }

  const baseUrl = process.env.MYOB_ENVIRONMENT === 'production'
    ? 'https://ar1.api.myob.com/accountright'
    : 'https://api.myob.com/accountright'

  // Search for existing customer by name
  const searchUrl = `${baseUrl}/${integration.companyFileId}/Contact/Customer?$filter=CompanyName eq '${encodeURIComponent(customer.name)}'`

  const searchResponse = await fetch(searchUrl, {
    headers: {
      'Authorization': `Bearer ${integration.accessToken}`,
      'x-myobapi-key': process.env.MYOB_CLIENT_ID || '',
      'x-myobapi-version': 'v2',
      'Accept': 'application/json'
    }
  })

  if (searchResponse.ok) {
    const searchData = await searchResponse.json()
    if (searchData.Items && searchData.Items.length > 0) {
      return searchData.Items[0].UID
    }
  }

  // Parse name for individual vs company
  const nameParts = customer.name.trim().split(' ')
  const isIndividual = nameParts.length >= 2

  // Create new customer if not found
  const newCustomer: any = {
    IsIndividual: isIndividual,
    ...(isIndividual
      ? {
          FirstName: nameParts[0],
          LastName: nameParts.slice(1).join(' ')
        }
      : {
          CompanyName: customer.name
        }),
    Addresses: [
      {
        Location: 1, // Primary address
        ...(customer.email && {
          Email: customer.email
        }),
        ...(customer.phone && {
          Phone1: customer.phone
        })
      }
    ]
  }

  const createResponse = await fetch(
    `${baseUrl}/${integration.companyFileId}/Contact/Customer`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'x-myobapi-key': process.env.MYOB_CLIENT_ID || '',
        'x-myobapi-version': 'v2',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(newCustomer)
    }
  )

  if (!createResponse.ok) {
    const errorData = await createResponse.json().catch(() => ({}))
    throw new Error(
      `Failed to create MYOB customer: ${createResponse.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  // Extract UID from Location header
  const locationHeader = createResponse.headers.get('Location')
  if (!locationHeader) {
    throw new Error('No Location header returned when creating MYOB customer')
  }

  const uid = locationHeader.split('/').pop()
  return uid!
}

/**
 * Get invoice from MYOB by UID
 */
export async function getMYOBInvoice(
  uid: string,
  integration: Integration
): Promise<MYOBInvoiceResponse> {
  if (!integration.accessToken || !integration.companyFileId) {
    throw new Error('Missing MYOB credentials')
  }

  const baseUrl = process.env.MYOB_ENVIRONMENT === 'production'
    ? 'https://ar1.api.myob.com/accountright'
    : 'https://api.myob.com/accountright'

  const response = await fetch(
    `${baseUrl}/${integration.companyFileId}/Sale/Invoice/${uid}`,
    {
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'x-myobapi-key': process.env.MYOB_CLIENT_ID || '',
        'x-myobapi-version': 'v2',
        'Accept': 'application/json'
      }
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `MYOB API error: ${response.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  return await response.json()
}

/**
 * Update invoice status in MYOB (e.g., mark as closed)
 */
export async function updateMYOBInvoiceStatus(
  uid: string,
  status: 'Open' | 'Closed',
  integration: Integration
) {
  if (!integration.accessToken || !integration.companyFileId) {
    throw new Error('Missing MYOB credentials')
  }

  const baseUrl = process.env.MYOB_ENVIRONMENT === 'production'
    ? 'https://ar1.api.myob.com/accountright'
    : 'https://api.myob.com/accountright'

  // First, get the current invoice to get RowVersion (required for updates)
  const currentInvoice = await getMYOBInvoice(uid, integration)

  const response = await fetch(
    `${baseUrl}/${integration.companyFileId}/Sale/Invoice/${uid}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${integration.accessToken}`,
        'x-myobapi-key': process.env.MYOB_CLIENT_ID || '',
        'x-myobapi-version': 'v2',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        UID: uid,
        Status: status,
        RowVersion: (currentInvoice as any).RowVersion // MYOB requires this for concurrency
      })
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `MYOB API error: ${response.statusText} - ${JSON.stringify(errorData)}`
    )
  }

  return await response.json()
}

/**
 * Helper: Map RestoreAssist invoice status to MYOB status
 */
function mapInvoiceStatusToMYOB(status: string): 'Open' | 'Closed' {
  switch (status) {
    case 'PAID':
      return 'Closed'
    case 'DRAFT':
    case 'SENT':
    case 'VIEWED':
    case 'PARTIALLY_PAID':
    case 'OVERDUE':
    default:
      return 'Open'
  }
}

/**
 * Helper: Format date for MYOB API (YYYY-MM-DD)
 */
function formatDateForMYOB(date: Date | string): string {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}
