/**
 * QuickBooks Integration Library
 *
 * Handles syncing invoices and other data to QuickBooks Online.
 * Uses QuickBooks API v3 with OAuth 2.0 authentication.
 *
 * RA-6920 B5: brought to Xero parity for outbound invoice/contact push —
 * idempotent create-or-update, error classification with proactive token
 * refresh, and customer upsert. See lib/integrations/xero.ts for the
 * reference implementation these patterns mirror.
 */

import { Integration } from "@prisma/client";
import { getValidQuickBooksAccessToken } from "@/lib/services/quickbooks/credentials";
import { type Country, getGstTreatment } from "../gst-rules";

interface QuickBooksInvoice {
  Id?: string; // Present on update path
  SyncToken?: string; // Required by QBO for update (optimistic concurrency)
  sparse?: boolean;
  Line: Array<{
    DetailType: "SalesItemLineDetail";
    Amount: number;
    Description?: string;
    SalesItemLineDetail: {
      Qty: number;
      UnitPrice: number;
      TaxCodeRef?: {
        value: string; // "TAX" for taxable, "NON" for non-taxable
      };
    };
  }>;
  CustomerRef: {
    name?: string;
    value: string; // Customer ID (create if not exists)
  };
  TxnDate: string; // YYYY-MM-DD
  DueDate: string; // YYYY-MM-DD
  DocNumber?: string; // Invoice number
  PrivateNote?: string;
  CustomerMemo?: {
    value: string;
  };
  BillEmail?: {
    Address: string;
  };
  CurrencyRef?: {
    value: string;
  };
}

interface QuickBooksInvoiceResponse {
  Id: string;
  DocNumber: string;
  TxnDate: string;
  DueDate: string;
  TotalAmt: number;
  Balance: number;
  Line: any[];
}

function quickBooksBaseUrl(): string {
  return process.env.QUICKBOOKS_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function quickBooksHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * RA-6920 B5: Classify a failed QuickBooks response and throw the right kind of
 * error, mirroring lib/integrations/xero.ts. The durable queue interprets the
 * thrown error via its own retry policy; this function decides recoverability.
 *
 * - 401/403 → proactively refresh the token so the next queue retry uses a live
 *   one, then throw (retryable).
 * - 400/404 → non-recoverable data/payload problem; throw (queue exhausts
 *   retries and marks the job FAILED — the message is the audit trail).
 * - anything else (429/5xx/network) → throw (retryable).
 */
async function throwClassifiedQuickBooksError(
  response: Response,
  integration: Integration,
): Promise<never> {
  const errorData = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    console.warn(
      `[QuickBooks] Token error (${response.status}) on integration ${integration.id} — refreshing token for next retry`,
    );
    const credResult = await getValidQuickBooksAccessToken(integration.id);
    if (!credResult.ok) {
      throw new Error(
        `QuickBooks token refresh failed (integration ${integration.id}): ${credResult.reason}${
          credResult.detail ? ` — ${credResult.detail}` : ""
        }`,
        { cause: credResult.cause },
      );
    }
    throw new Error(
      `QuickBooks ${response.status} — token refreshed, will retry on next queue run`,
    );
  }

  if (response.status === 400 || response.status === 404) {
    throw new Error(
      `QuickBooks ${response.status} (non-recoverable): ${extractQuickBooksFaultDetail(
        errorData,
      )} — ${JSON.stringify(errorData)}`,
    );
  }

  throw new Error(
    `QuickBooks API error ${response.status}: ${response.statusText} — ${JSON.stringify(errorData)}`,
  );
}

/**
 * Extract a human-readable message from a QuickBooks Fault payload.
 */
function extractQuickBooksFaultDetail(errorData: any): string {
  const errors = errorData?.Fault?.Error;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors
      .map((e: { Message?: string; Detail?: string; code?: string }) =>
        [e.Message, e.Detail].filter(Boolean).join(": "),
      )
      .join("; ");
  }
  return errorData?.Fault?.type ?? "unknown QuickBooks fault";
}

/**
 * RA-6920 B5: QuickBooks signals a duplicate DocNumber with fault code 6140
 * (HTTP 400). This is the QBO analogue of Xero's 409 Conflict — recover by
 * resolving the existing invoice's Id + SyncToken and switching to the update
 * path rather than dead-lettering a job that would otherwise duplicate.
 */
function isQuickBooksDuplicateDocError(errorData: any): boolean {
  const errors = errorData?.Fault?.Error;
  return (
    Array.isArray(errors) &&
    errors.some((e: { code?: string }) => e?.code === "6140")
  );
}

/**
 * Sync invoice to QuickBooks (idempotent create-or-update).
 *
 * If the RestoreAssist invoice already carries an `externalInvoiceId` from a
 * prior QuickBooks sync, this updates that invoice in place instead of creating
 * a duplicate. A duplicate-DocNumber fault on the create path is also recovered
 * to the update path, mirroring lib/integrations/xero.ts.
 *
 * @param country - Billing jurisdiction. Defaults to "AU" (GST tax rate name).
 *   Pass "NZ" for "GST NZ" tax rate name. Upstream source: Organization.country (RA-1120).
 */
export async function syncInvoiceToQuickBooks(
  invoice: any,
  integration: Integration,
  country: Country = "AU",
) {
  const gst = getGstTreatment(country);
  if (!integration.accessToken) {
    throw new Error("No access token available for QuickBooks");
  }

  if (!integration.realmId) {
    throw new Error("No realm ID (company ID) available for QuickBooks");
  }

  // Find or create (and update) the customer in QuickBooks
  const customerId = await findOrCreateQuickBooksCustomer(
    {
      name: invoice.customerName,
      email: invoice.customerEmail,
      phone: invoice.customerPhone,
    },
    integration,
  );

  // Prepare line items
  const lineItems: QuickBooksInvoice["Line"] = invoice.lineItems.map(
    (item: any) => {
      const amount = item.total / 100; // Convert cents to dollars with GST included
      const unitPrice = item.unitPrice / 100; // Unit price excluding GST

      return {
        DetailType: "SalesItemLineDetail",
        Amount: parseFloat(amount.toFixed(2)),
        Description:
          item.description + (item.category ? ` (${item.category})` : ""),
        SalesItemLineDetail: {
          Qty: item.quantity,
          UnitPrice: parseFloat(unitPrice.toFixed(2)),
          ...(item.gstRate > 0 && {
            TaxCodeRef: { value: gst.qboTaxRateName }, // AU: "GST", NZ: "GST NZ"
          }),
        },
      };
    },
  );

  // Add discount as negative line item if present
  if (invoice.discountAmount && invoice.discountAmount > 0) {
    lineItems.push({
      DetailType: "SalesItemLineDetail",
      Amount: -(invoice.discountAmount / 100),
      Description: "Discount",
      SalesItemLineDetail: {
        Qty: 1,
        UnitPrice: -(invoice.discountAmount / 100),
      },
    });
  }

  // Add shipping as line item if present
  if (invoice.shippingAmount && invoice.shippingAmount > 0) {
    lineItems.push({
      DetailType: "SalesItemLineDetail",
      Amount: invoice.shippingAmount / 100,
      Description: "Shipping & Delivery",
      SalesItemLineDetail: {
        Qty: 1,
        UnitPrice: invoice.shippingAmount / 100,
        TaxCodeRef: { value: gst.qboTaxRateName }, // AU: "GST", NZ: "GST NZ"
      },
    });
  }

  // Prepare QuickBooks invoice payload
  const qbInvoice: QuickBooksInvoice = {
    Line: lineItems,
    CustomerRef: {
      value: customerId,
      name: invoice.customerName,
    },
    TxnDate: formatDateForQuickBooks(invoice.invoiceDate),
    DueDate: formatDateForQuickBooks(invoice.dueDate),
    DocNumber: invoice.invoiceNumber,
    ...(invoice.notes && { PrivateNote: invoice.notes }),
    ...(invoice.terms && {
      CustomerMemo: { value: invoice.terms },
    }),
    ...(invoice.customerEmail && {
      BillEmail: { Address: invoice.customerEmail },
    }),
    ...(invoice.currency &&
      invoice.currency !== "AUD" && {
        CurrencyRef: { value: invoice.currency },
      }),
  };

  // RA-6920 B5: idempotency — if this invoice was already pushed to QuickBooks,
  // update it in place rather than creating a duplicate.
  const alreadySynced =
    invoice.externalInvoiceId &&
    (!invoice.externalSyncProvider ||
      String(invoice.externalSyncProvider).toUpperCase() === "QUICKBOOKS");

  if (alreadySynced) {
    return updateQuickBooksInvoice(
      invoice.externalInvoiceId,
      qbInvoice,
      integration,
    );
  }

  const baseUrl = quickBooksBaseUrl();
  const response = await fetch(
    `${baseUrl}/v3/company/${integration.realmId}/invoice`,
    {
      method: "POST",
      headers: quickBooksHeaders(integration.accessToken),
      body: JSON.stringify(qbInvoice),
    },
  );

  if (!response.ok) {
    // Duplicate DocNumber (6140) → resolve existing invoice and switch to update
    if (response.status === 400) {
      const errorData = await response.clone().json().catch(() => ({}));
      if (isQuickBooksDuplicateDocError(errorData)) {
        const existingId = await findQuickBooksInvoiceIdByDocNumber(
          invoice.invoiceNumber,
          integration,
        );
        if (existingId) {
          console.log(
            `[QuickBooks] Invoice ${invoice.invoiceNumber} already exists (${existingId}), switching to update path`,
          );
          return updateQuickBooksInvoice(existingId, qbInvoice, integration);
        }
      }
    }
    return throwClassifiedQuickBooksError(response, integration);
  }

  const data = await response.json();
  return mapQuickBooksInvoiceResponse(data.Invoice as QuickBooksInvoiceResponse);
}

/**
 * Update an existing QuickBooks invoice by Id. QBO requires the current
 * SyncToken (optimistic concurrency) so we GET it first, then POST the full
 * invoice object with Id + SyncToken.
 */
async function updateQuickBooksInvoice(
  externalInvoiceId: string,
  qbInvoice: QuickBooksInvoice,
  integration: Integration,
) {
  const existing = await getQuickBooksInvoice(externalInvoiceId, integration);
  const baseUrl = quickBooksBaseUrl();

  const payload: QuickBooksInvoice = {
    ...qbInvoice,
    Id: existing.Id,
    SyncToken: existing.SyncToken,
    sparse: false,
  };

  const response = await fetch(
    `${baseUrl}/v3/company/${integration.realmId}/invoice`,
    {
      method: "POST",
      headers: quickBooksHeaders(integration.accessToken!),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    return throwClassifiedQuickBooksError(response, integration);
  }

  const data = await response.json();
  return mapQuickBooksInvoiceResponse(data.Invoice as QuickBooksInvoiceResponse);
}

function mapQuickBooksInvoiceResponse(
  qbInvoiceResponse: QuickBooksInvoiceResponse,
) {
  return {
    invoiceId: qbInvoiceResponse.Id,
    invoiceNumber: qbInvoiceResponse.DocNumber,
    total: qbInvoiceResponse.TotalAmt,
    balance: qbInvoiceResponse.Balance,
    provider: "quickbooks",
    rawResponse: qbInvoiceResponse,
  };
}

/**
 * Resolve a QuickBooks invoice Id by its DocNumber (used for duplicate recovery).
 */
async function findQuickBooksInvoiceIdByDocNumber(
  docNumber: string,
  integration: Integration,
): Promise<string | null> {
  const baseUrl = quickBooksBaseUrl();
  const query = `SELECT Id FROM Invoice WHERE DocNumber = '${docNumber.replace(/'/g, "\\'")}'`;
  const url = `${baseUrl}/v3/company/${integration.realmId}/query?query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const invoices = data?.QueryResponse?.Invoice;
  return Array.isArray(invoices) && invoices.length > 0 ? invoices[0].Id : null;
}

/**
 * Find, create, or update a customer in QuickBooks (upsert).
 *
 * RA-6920 B5: on a match, the customer's email/phone are updated (sparse
 * update) rather than left stale, matching Xero's pass-through contact
 * behaviour where every push re-sends the current contact details.
 */
async function findOrCreateQuickBooksCustomer(
  customer: { name: string; email?: string; phone?: string },
  integration: Integration,
): Promise<string> {
  if (!integration.accessToken || !integration.realmId) {
    throw new Error("Missing QuickBooks credentials");
  }

  const baseUrl = quickBooksBaseUrl();

  // Search for existing customer by name
  const searchQuery = `SELECT * FROM Customer WHERE DisplayName = '${customer.name.replace(/'/g, "\\'")}'`;
  const searchUrl = `${baseUrl}/v3/company/${integration.realmId}/query?query=${encodeURIComponent(searchQuery)}`;

  const searchResponse = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      Accept: "application/json",
    },
  });

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    const existing = searchData.QueryResponse?.Customer?.[0];
    if (existing) {
      // Upsert: refresh email/phone on the existing customer if we have them
      if (customer.email || customer.phone) {
        const sparse: any = {
          sparse: true,
          Id: existing.Id,
          SyncToken: existing.SyncToken,
          ...(customer.email && {
            PrimaryEmailAddr: { Address: customer.email },
          }),
          ...(customer.phone && {
            PrimaryPhone: { FreeFormNumber: customer.phone },
          }),
        };
        const updateResponse = await fetch(
          `${baseUrl}/v3/company/${integration.realmId}/customer`,
          {
            method: "POST",
            headers: quickBooksHeaders(integration.accessToken),
            body: JSON.stringify(sparse),
          },
        );
        if (updateResponse.ok) {
          const updateData = await updateResponse.json();
          return updateData.Customer?.Id ?? existing.Id;
        }
      }
      return existing.Id;
    }
  }

  // Create new customer if not found
  const newCustomer = {
    DisplayName: customer.name,
    ...(customer.email && {
      PrimaryEmailAddr: { Address: customer.email },
    }),
    ...(customer.phone && {
      PrimaryPhone: { FreeFormNumber: customer.phone },
    }),
  };

  const createResponse = await fetch(
    `${baseUrl}/v3/company/${integration.realmId}/customer`,
    {
      method: "POST",
      headers: quickBooksHeaders(integration.accessToken),
      body: JSON.stringify(newCustomer),
    },
  );

  if (!createResponse.ok) {
    const errorData = await createResponse.json().catch(() => ({}));
    throw new Error(
      `Failed to create QuickBooks customer: ${createResponse.statusText} - ${JSON.stringify(errorData)}`,
    );
  }

  const createData = await createResponse.json();
  return createData.Customer.Id;
}

/**
 * Get invoice from QuickBooks by ID
 */
export async function getQuickBooksInvoice(
  externalInvoiceId: string,
  integration: Integration,
) {
  if (!integration.accessToken || !integration.realmId) {
    throw new Error("Missing QuickBooks credentials");
  }

  const baseUrl = quickBooksBaseUrl();

  const response = await fetch(
    `${baseUrl}/v3/company/${integration.realmId}/invoice/${externalInvoiceId}`,
    {
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `QuickBooks API error: ${response.statusText} - ${JSON.stringify(errorData)}`,
    );
  }

  const data = await response.json();
  return data.Invoice;
}

/**
 * Helper: Format date for QuickBooks API (YYYY-MM-DD)
 */
function formatDateForQuickBooks(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}
