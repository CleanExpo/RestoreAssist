/**
 * Xero Integration Library
 *
 * Handles syncing invoices and other data to Xero accounting software.
 * Uses Xero API v2 with OAuth 2.0 authentication.
 */

import { Integration } from "@prisma/client";
import { getValidXeroToken } from "./xero/token-manager";

interface XeroInvoice {
  Type: "ACCREC"; // Accounts Receivable (customer invoice)
  Contact: {
    Name: string;
    EmailAddress?: string;
    Phones?: Array<{
      PhoneType: string;
      PhoneNumber: string;
    }>;
  };
  Date: string; // YYYY-MM-DD
  DueDate: string; // YYYY-MM-DD
  InvoiceNumber: string;
  Reference?: string;
  Status: "DRAFT" | "SUBMITTED" | "AUTHORISED";
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number; // Excluding tax
    AccountCode?: string;
    TaxType: string;
    LineAmount: number; // Excluding tax
  }>;
  CurrencyCode?: string;
}

interface XeroInvoiceResponse {
  Id: string;
  InvoiceID: string;
  InvoiceNumber: string;
  Status: string;
  Total: number;
  AmountDue: number;
  DateString: string;
  DueDateString: string;
}

/**
 * Sync invoice to Xero
 */
export async function syncInvoiceToXero(
  invoice: any,
  integration: Integration,
) {
  if (!integration.accessToken) {
    throw new Error("No access token available for Xero");
  }

  if (!integration.tenantId) {
    throw new Error("No tenant ID available for Xero");
  }

  // Map invoice status to Xero status
  const xeroStatus = mapInvoiceStatusToXero(invoice.status);

  // Prepare Xero invoice payload
  const xeroInvoice: XeroInvoice = {
    Type: "ACCREC",
    Contact: {
      Name: invoice.customerName,
      ...(invoice.customerEmail && { EmailAddress: invoice.customerEmail }),
      ...(invoice.customerPhone && {
        Phones: [
          {
            PhoneType: "DEFAULT",
            PhoneNumber: invoice.customerPhone,
          },
        ],
      }),
      // RA-870: Map client ABN to Xero Contact TaxNumber for ATO reporting
      ...(formatABN(invoice.customerABN) && {
        TaxNumber: formatABN(invoice.customerABN),
      }),
    },
    Date: formatDateForXero(invoice.invoiceDate),
    DueDate: formatDateForXero(invoice.dueDate),
    InvoiceNumber: invoice.invoiceNumber,
    ...(invoice.customerABN && { Reference: `ABN: ${invoice.customerABN}` }),
    Status: xeroStatus,
    LineItems: invoice.lineItems.map((item: any) => ({
      Description:
        item.description + (item.category ? ` (${item.category})` : ""),
      Quantity: item.quantity,
      UnitAmount: (item.unitPrice / 100).toFixed(2), // Convert cents to dollars
      TaxType: item.gstRate === 10 ? "OUTPUT" : "NONE", // Australian GST
      LineAmount: (item.subtotal / 100).toFixed(2), // Subtotal excluding GST
    })),
    CurrencyCode: invoice.currency || "AUD",
  };

  // Add discount as negative line item if present
  if (invoice.discountAmount && invoice.discountAmount > 0) {
    xeroInvoice.LineItems.push({
      Description: "Discount",
      Quantity: 1,
      UnitAmount: -(invoice.discountAmount / 100).toFixed(2),
      // RA-870: Discounts reduce taxable income — must use OUTPUT, not NONE.
      // NONE would overstate net GST payable in Xero P&L reports.
      TaxType: "OUTPUT",
      LineAmount: -(invoice.discountAmount / 100).toFixed(2),
    });
  }

  // Add shipping as line item if present
  if (invoice.shippingAmount && invoice.shippingAmount > 0) {
    xeroInvoice.LineItems.push({
      Description: "Shipping & Delivery",
      Quantity: 1,
      UnitAmount: parseFloat((invoice.shippingAmount / 100).toFixed(2)),
      TaxType: "OUTPUT",
      LineAmount: parseFloat((invoice.shippingAmount / 100).toFixed(2)),
    });
  }

  // Make API request to Xero
  const response = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      "Xero-tenant-id": integration.tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ Invoices: [xeroInvoice] }),
  });

  // RA-920: Smart error code handling — recover from transient failures instead of
  // dead-lettering jobs that could succeed on retry with a refreshed token.
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // 409 Conflict: invoice already exists in Xero — switch to full update path.
    // Xero may return the existing InvoiceID in the Invoices array or Extensions.
    if (response.status === 409) {
      const existingId: string | undefined =
        errorData?.Invoices?.[0]?.InvoiceID ??
        errorData?.Extensions?.InvoiceID ??
        undefined;

      if (existingId) {
        console.log(
          `[Xero] Invoice already exists (${existingId}), switching to full update path`,
        );
        // PUT the complete invoice payload to the existing Xero InvoiceID
        const updateResponse = await fetch(
          `https://api.xero.com/api.xro/2.0/Invoices/${existingId}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Xero-tenant-id": integration.tenantId!,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              Invoices: [{ ...xeroInvoice, InvoiceID: existingId }],
            }),
          },
        );
        const updateData = await updateResponse.json().catch(() => ({}));
        const updated = updateData?.Invoices?.[0] as XeroInvoiceResponse | undefined;
        if (!updated) {
          throw new Error(
            `Xero 409 update failed for InvoiceID ${existingId}: ${JSON.stringify(updateData)}`,
          );
        }
        return {
          invoiceId: updated.InvoiceID,
          invoiceNumber: updated.InvoiceNumber,
          status: updated.Status,
          total: updated.Total,
          amountDue: updated.AmountDue,
          provider: "xero",
          rawResponse: updated,
        };
      }
      // No existing ID recoverable — throw so queue retries
      throw new Error(
        `Xero 409 Conflict — could not recover existing InvoiceID: ${JSON.stringify(errorData)}`,
      );
    }

    // 401 Unauthorized / 403 Forbidden: access token expired or revoked.
    // Proactively refresh via token-manager so the next queue retry uses a live token.
    if (response.status === 401 || response.status === 403) {
      console.warn(
        `[Xero] Token error (${response.status}) on integration ${integration.id} — refreshing token for next retry`,
      );
      try {
        // getValidXeroToken stores the refreshed token in the DB.
        // The next _processJob run will load the fresh integration row.
        await getValidXeroToken(integration.id);
      } catch (refreshErr) {
        throw new Error(
          `Xero token refresh failed (integration ${integration.id}): ${
            refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
          }`,
        );
      }
      throw new Error(
        `Xero ${response.status} — token refreshed, will retry on next queue run`,
      );
    }

    // 400 Bad Request / 404 Not Found: payload or data problem — not recoverable by retry.
    // Queue will exhaust retries and set status FAILED; error message is the audit trail.
    if (response.status === 400 || response.status === 404) {
      const detail =
        errorData?.ValidationErrors?.map((e: { Message: string }) => e.Message).join("; ") ??
        errorData?.Detail ??
        response.statusText;
      throw new Error(
        `Xero ${response.status} (non-recoverable): ${detail} — ${JSON.stringify(errorData)}`,
      );
    }

    // Catch-all for unexpected status codes — retryable
    throw new Error(
      `Xero API error ${response.status}: ${response.statusText} — ${JSON.stringify(errorData)}`,
    );
  }

  const data = await response.json();

  if (!data.Invoices || data.Invoices.length === 0) {
    throw new Error("No invoice returned from Xero API");
  }

  const xeroInvoiceResponse = data.Invoices[0] as XeroInvoiceResponse;

  return {
    invoiceId: xeroInvoiceResponse.InvoiceID,
    invoiceNumber: xeroInvoiceResponse.InvoiceNumber,
    status: xeroInvoiceResponse.Status,
    total: xeroInvoiceResponse.Total,
    amountDue: xeroInvoiceResponse.AmountDue,
    provider: "xero",
    rawResponse: xeroInvoiceResponse,
  };
}

/**
 * Get invoice from Xero by ID
 */
export async function getXeroInvoice(
  externalInvoiceId: string,
  integration: Integration,
) {
  if (!integration.accessToken) {
    throw new Error("No access token available for Xero");
  }

  if (!integration.tenantId) {
    throw new Error("No tenant ID available for Xero");
  }

  const response = await fetch(
    `https://api.xero.com/api.xro/2.0/Invoices/${externalInvoiceId}`,
    {
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        "Xero-tenant-id": integration.tenantId,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Xero API error: ${response.statusText} - ${JSON.stringify(errorData)}`,
    );
  }

  const data = await response.json();
  return data.Invoices[0];
}

/**
 * Update invoice status in Xero (e.g., mark as paid)
 */
export async function updateXeroInvoiceStatus(
  externalInvoiceId: string,
  status: "AUTHORISED" | "PAID" | "VOIDED",
  integration: Integration,
) {
  if (!integration.accessToken) {
    throw new Error("No access token available for Xero");
  }

  if (!integration.tenantId) {
    throw new Error("No tenant ID available for Xero");
  }

  const response = await fetch(
    `https://api.xero.com/api.xro/2.0/Invoices/${externalInvoiceId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        "Xero-tenant-id": integration.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        Invoices: [{ InvoiceID: externalInvoiceId, Status: status }],
      }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Xero API error: ${response.statusText} - ${JSON.stringify(errorData)}`,
    );
  }

  return await response.json();
}

/**
 * RA-870: Format an 11-digit ABN to Xero TaxNumber format (XX XXX XXX XXX).
 * Returns null if the input is not a valid 11-digit ABN.
 */
export function formatABN(abn: string | null | undefined): string | null {
  if (!abn) return null;
  const digits = abn.replace(/\D/g, "");
  if (digits.length !== 1