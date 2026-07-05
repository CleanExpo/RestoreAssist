/**
 * MYOB Integration Library
 *
 * Handles syncing invoices and other data to MYOB AccountRight.
 * Uses MYOB AccountRight API v2 with OAuth 2.0 authentication.
 *
 * RA-6920 B5: brought to Xero parity for outbound invoice/contact push —
 * idempotent create-or-update, error classification with proactive token
 * refresh, and customer upsert. Also fixes the long-standing company-file
 * field bug: the OAuth client (lib/integrations/myob/client.ts) stores the
 * MYOB company file Id into Integration.tenantId, but this module previously
 * read a non-existent `companyFileId` field, so every outbound MYOB sync threw
 * at runtime.
 */

import { Integration } from "@prisma/client";
import { getValidMYOBAccessToken } from "@/lib/services/myob/credentials";
import { type Country, getGstTreatment } from "../gst-rules";

interface MYOBInvoice {
  UID?: string; // Present on update path
  RowVersion?: string; // Required by MYOB for update (optimistic concurrency)
  Number: string;
  Date: string; // YYYY-MM-DD
  CustomerPurchaseOrderNumber?: string;
  Customer: {
    UID: string;
  };
  ShipToAddress?: string;
  Terms: {
    PaymentIsDue:
      | "InAGivenNumberOfDays"
      | "OnADayOfTheMonth"
      | "DayOfMonthAfterEOM"
      | "CashOnDelivery";
    DiscountDate?: number;
    BalanceDueDate: number;
  };
  IsTaxInclusive: boolean;
  Lines: Array<{
    Type: "Transaction";
    Description: string;
    Total: number;
    Account?: {
      UID: string;
    };
    TaxCode?: {
      UID: string;
    };
    Quantity?: number;
    UnitPrice?: number;
  }>;
  Subtotal?: number;
  Freight?: number;
  FreightTaxCode?: {
    UID: string;
  };
  TotalTax?: number;
  TotalAmount?: number;
  Status: "Open" | "Closed";
  Comment?: string;
}

interface MYOBInvoiceResponse {
  UID: string;
  Number: string;
  Date: string;
  TotalAmount: number;
  BalanceDueAmount: number;
  Status: string;
  URI: string;
}

/**
 * The MYOB company file Id is stored on Integration.tenantId by the OAuth
 * client's fetchAndStoreCompanyFile(). Read it from there — never from a
 * non-existent `companyFileId` field.
 */
function getMyobCompanyFileId(integration: Integration): string {
  const id = integration.tenantId;
  if (!id) {
    throw new Error("No company file ID available for MYOB");
  }
  return id;
}

function myobBaseUrl(): string {
  return process.env.MYOB_ENVIRONMENT === "production"
    ? "https://ar1.api.myob.com/accountright"
    : "https://api.myob.com/accountright";
}

function myobHeaders(
  accessToken: string,
  withContentType = false,
): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "x-myobapi-key": process.env.MYOB_CLIENT_ID || "",
    "x-myobapi-version": "v2",
    Accept: "application/json",
    ...(withContentType && { "Content-Type": "application/json" }),
  };
}

/**
 * RA-6920 B5: Classify a failed MYOB response and throw the right kind of
 * error, mirroring lib/integrations/xero.ts / quickbooks.ts.
 *
 * - 401/403 → proactively refresh the token so the next queue retry uses a live
 *   one, then throw (retryable).
 * - 400/404 → non-recoverable data/payload problem; throw (queue exhausts
 *   retries and marks the job FAILED).
 * - anything else (409/429/5xx/network) → throw (retryable).
 */
async function throwClassifiedMYOBError(
  response: Response,
  integration: Integration,
): Promise<never> {
  const errorData = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    console.warn(
      `[MYOB] Token error (${response.status}) on integration ${integration.id} — refreshing token for next retry`,
    );
    const credResult = await getValidMYOBAccessToken(integration.id);
    if (!credResult.ok) {
      throw new Error(
        `MYOB token refresh failed (integration ${integration.id}): ${credResult.reason}${
          credResult.detail ? ` — ${credResult.detail}` : ""
        }`,
        { cause: credResult.cause },
      );
    }
    throw new Error(
      `MYOB ${response.status} — token refreshed, will retry on next queue run`,
    );
  }

  if (response.status === 400 || response.status === 404) {
    const detail =
      (Array.isArray(errorData?.Errors) &&
        errorData.Errors.map((e: { Message?: string }) => e.Message)
          .filter(Boolean)
          .join("; ")) ||
      errorData?.Message ||
      response.statusText;
    throw new Error(
      `MYOB ${response.status} (non-recoverable): ${detail} — ${JSON.stringify(errorData)}`,
    );
  }

  throw new Error(
    `MYOB API error ${response.status}: ${response.statusText} — ${JSON.stringify(errorData)}`,
  );
}

/**
 * Sync invoice to MYOB (idempotent create-or-update).
 *
 * If the RestoreAssist invoice already carries an `externalInvoiceId` from a
 * prior MYOB sync, this updates that invoice in place (PUT with RowVersion)
 * instead of creating a duplicate.
 *
 * @param country - Billing jurisdiction. Defaults to "AU" (GST tax code).
 *   Pass "NZ" for GST15 tax code. Upstream source: Organization.country (RA-1120).
 */
export async function syncInvoiceToMYOB(
  invoice: any,
  integration: Integration,
  country: Country = "AU",
) {
  const gst = getGstTreatment(country);
  if (!integration.accessToken) {
    throw new Error("No access token available for MYOB");
  }

  const companyFileId = getMyobCompanyFileId(integration);

  // Find, create, or update the customer in MYOB
  const customerUID = await findOrCreateMYOBCustomer(
    {
      name: invoice.customerName,
      email: invoice.customerEmail,
      phone: invoice.customerPhone,
    },
    integration,
  );

  // Calculate terms (days until due)
  const invoiceDate = new Date(invoice.invoiceDate);
  const dueDate = new Date(invoice.dueDate);
  const daysDiff = Math.ceil(
    (dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Prepare line items
  const lines: MYOBInvoice["Lines"] = invoice.lineItems.map((item: any) => ({
    Type: "Transaction",
    Description:
      item.description + (item.category ? ` (${item.category})` : ""),
    Total: item.total / 100, // Convert cents to dollars (tax inclusive)
    Quantity: item.quantity,
    UnitPrice: item.unitPrice / 100, // Unit price excluding GST
    ...(item.gstRate > 0 && {
      TaxCode: { UID: gst.myobTaxCode }, // Resolved by MYOB — AU: "GST", NZ: "GST15"
    }),
  }));

  // Add discount as negative line item if present
  if (invoice.discountAmount && invoice.discountAmount > 0) {
    lines.push({
      Type: "Transaction",
      Description: "Discount",
      Total: -(invoice.discountAmount / 100),
      Quantity: 1,
      UnitPrice: -(invoice.discountAmount / 100),
    });
  }

  // Prepare MYOB invoice payload
  const myobInvoice: MYOBInvoice = {
    Number: invoice.invoiceNumber,
    Date: formatDateForMYOB(invoice.invoiceDate),
    Customer: {
      UID: customerUID,
    },
    Terms: {
      PaymentIsDue: "InAGivenNumberOfDays",
      BalanceDueDate: Math.max(0, daysDiff),
    },
    IsTaxInclusive: true, // Australian standard
    Lines: lines,
    Status: mapInvoiceStatusToMYOB(invoice.status),
    ...(invoice.notes && { Comment: invoice.notes }),
    ...(invoice.shippingAmount &&
      invoice.shippingAmount > 0 && {
        Freight: invoice.shippingAmount / 100,
        FreightTaxCode: { UID: gst.myobTaxCode },
      }),
  };

  // RA-6920 B5: idempotency — if this invoice was already pushed to MYOB,
  // update it in place rather than creating a duplicate.
  const alreadySynced =
    invoice.externalInvoiceId &&
    (!invoice.externalSyncProvider ||
      String(invoice.externalSyncProvider).toUpperCase() === "MYOB");

  if (alreadySynced) {
    return updateMYOBInvoice(invoice.externalInvoiceId, myobInvoice, integration);
  }

  const baseUrl = myobBaseUrl();
  const response = await fetch(
    `${baseUrl}/${companyFileId}/Sale/Invoice`,
    {
      method: "POST",
      headers: myobHeaders(integration.accessToken, true),
      body: JSON.stringify(myobInvoice),
    },
  );

  if (!response.ok) {
    return throwClassifiedMYOBError(response, integration);
  }

  // MYOB returns 201 Created with Location header
  const locationHeader = response.headers.get("Location");
  if (!locationHeader) {
    throw new Error("No Location header returned from MYOB API");
  }

  // Extract UID from Location header
  const uid = locationHeader.split("/").pop();

  // Fetch the created invoice details
  const invoiceDetails = await getMYOBInvoice(uid!, integration);

  return mapMYOBInvoiceResponse(invoiceDetails);
}

/**
 * Update an existing MYOB invoice by UID. MYOB requires the current RowVersion
 * (optimistic concurrency) so we GET it first, then PUT the full payload.
 */
async function updateMYOBInvoice(
  uid: string,
  myobInvoice: MYOBInvoice,
  integration: Integration,
) {
  const companyFileId = getMyobCompanyFileId(integration);
  const existing = await getMYOBInvoice(uid, integration);
  const baseUrl = myobBaseUrl();

  const payload: MYOBInvoice = {
    ...myobInvoice,
    UID: uid,
    RowVersion: (existing as any).RowVersion,
  };

  const response = await fetch(
    `${baseUrl}/${companyFileId}/Sale/Invoice/${uid}`,
    {
      method: "PUT",
      headers: myobHeaders(integration.accessToken!, true),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    return throwClassifiedMYOBError(response, integration);
  }

  // PUT returns 200 with an empty body; re-fetch to return normalized details
  const invoiceDetails = await getMYOBInvoice(uid, integration);
  return mapMYOBInvoiceResponse(invoiceDetails);
}

function mapMYOBInvoiceResponse(invoiceDetails: MYOBInvoiceResponse) {
  return {
    invoiceId: invoiceDetails.UID,
    invoiceNumber: invoiceDetails.Number,
    status: invoiceDetails.Status,
    total: invoiceDetails.TotalAmount,
    balance: invoiceDetails.BalanceDueAmount,
    provider: "myob",
    rawResponse: invoiceDetails,
  };
}

/**
 * Find, create, or update a customer in MYOB (upsert).
 *
 * RA-6920 B5: on a match, the customer's email/phone are refreshed (GET the
 * full contact, merge, PUT with RowVersion) so stale details don't linger —
 * matching Xero's pass-through contact behaviour. A failed refresh is
 * non-fatal: we still return the existing UID so the invoice push proceeds.
 */
async function findOrCreateMYOBCustomer(
  customer: { name: string; email?: string; phone?: string },
  integration: Integration,
): Promise<string> {
  if (!integration.accessToken) {
    throw new Error("Missing MYOB credentials");
  }
  const companyFileId = getMyobCompanyFileId(integration);
  const baseUrl = myobBaseUrl();

  // Search for existing customer by name
  const searchUrl = `${baseUrl}/${companyFileId}/Contact/Customer?$filter=CompanyName eq '${encodeURIComponent(customer.name)}'`;

  const searchResponse = await fetch(searchUrl, {
    headers: myobHeaders(integration.accessToken),
  });

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    const existingUID = searchData.Items?.[0]?.UID;
    if (existingUID) {
      if (customer.email || customer.phone) {
        await updateMYOBCustomerContact(existingUID, customer, integration);
      }
      return existingUID;
    }
  }

  // Parse name for individual vs company
  const nameParts = customer.name.trim().split(" ");
  const isIndividual = nameParts.length >= 2;

  // Create new customer if not found
  const newCustomer: any = {
    IsIndividual: isIndividual,
    ...(isIndividual
      ? {
          FirstName: nameParts[0],
          LastName: nameParts.slice(1).join(" "),
        }
      : {
          CompanyName: customer.name,
        }),
    Addresses: [
      {
        Location: 1, // Primary address
        ...(customer.email && {
          Email: customer.email,
        }),
        ...(customer.phone && {
          Phone1: customer.phone,
        }),
      },
    ],
  };

  const createResponse = await fetch(
    `${baseUrl}/${companyFileId}/Contact/Customer`,
    {
      method: "POST",
      headers: myobHeaders(integration.accessToken, true),
      body: JSON.stringify(newCustomer),
    },
  );

  if (!createResponse.ok) {
    const errorData = await createResponse.json().catch(() => ({}));
    throw new Error(
      `Failed to create MYOB customer: ${createResponse.statusText} - ${JSON.stringify(errorData)}`,
    );
  }

  // Extract UID from Location header
  const locationHeader = createResponse.headers.get("Location");
  if (!locationHeader) {
    throw new Error("No Location header returned when creating MYOB customer");
  }

  const uid = locationHeader.split("/").pop();
  return uid!;
}

/**
 * Refresh an existing MYOB customer's email/phone. MYOB PUT replaces the whole
 * resource, so we GET the full contact first and merge to avoid data loss.
 * Best-effort: swallows failures (the caller proceeds with the existing UID).
 */
async function updateMYOBCustomerContact(
  uid: string,
  customer: { email?: string; phone?: string },
  integration: Integration,
): Promise<void> {
  try {
    const companyFileId = getMyobCompanyFileId(integration);
    const baseUrl = myobBaseUrl();

    const getResponse = await fetch(
      `${baseUrl}/${companyFileId}/Contact/Customer/${uid}`,
      { headers: myobHeaders(integration.accessToken!) },
    );
    if (!getResponse.ok) return;

    const existing = await getResponse.json();
    const addresses =
      Array.isArray(existing.Addresses) && existing.Addresses.length > 0
        ? existing.Addresses
        : [{ Location: 1 }];
    if (customer.email) addresses[0].Email = customer.email;
    if (customer.phone) addresses[0].Phone1 = customer.phone;

    await fetch(`${baseUrl}/${companyFileId}/Contact/Customer/${uid}`, {
      method: "PUT",
      headers: myobHeaders(integration.accessToken!, true),
      body: JSON.stringify({
        ...existing,
        UID: uid,
        Addresses: addresses,
      }),
    });
  } catch {
    // Non-fatal: contact refresh is best-effort, invoice push is the priority.
  }
}

/**
 * Get invoice from MYOB by UID
 */
export async function getMYOBInvoice(
  uid: string,
  integration: Integration,
): Promise<MYOBInvoiceResponse> {
  if (!integration.accessToken) {
    throw new Error("Missing MYOB credentials");
  }
  const companyFileId = getMyobCompanyFileId(integration);
  const baseUrl = myobBaseUrl();

  const response = await fetch(
    `${baseUrl}/${companyFileId}/Sale/Invoice/${uid}`,
    {
      headers: myobHeaders(integration.accessToken),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `MYOB API error: ${response.statusText} - ${JSON.stringify(errorData)}`,
    );
  }

  return await response.json();
}

/**
 * Update invoice status in MYOB (e.g., mark as closed)
 */
export async function updateMYOBInvoiceStatus(
  uid: string,
  status: "Open" | "Closed",
  integration: Integration,
) {
  if (!integration.accessToken) {
    throw new Error("Missing MYOB credentials");
  }
  const companyFileId = getMyobCompanyFileId(integration);
  const baseUrl = myobBaseUrl();

  // First, get the current invoice to get RowVersion (required for updates)
  const currentInvoice = await getMYOBInvoice(uid, integration);

  const response = await fetch(
    `${baseUrl}/${companyFileId}/Sale/Invoice/${uid}`,
    {
      method: "PUT",
      headers: myobHeaders(integration.accessToken, true),
      body: JSON.stringify({
        UID: uid,
        Status: status,
        RowVersion: (currentInvoice as any).RowVersion, // MYOB requires this for concurrency
      }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `MYOB API error: ${response.statusText} - ${JSON.stringify(errorData)}`,
    );
  }

  return await response.json();
}

/**
 * Helper: Map RestoreAssist invoice status to MYOB status
 */
function mapInvoiceStatusToMYOB(status: string): "Open" | "Closed" {
  switch (status) {
    case "PAID":
      return "Closed";
    case "DRAFT":
    case "SENT":
    case "VIEWED":
    case "PARTIALLY_PAID":
    case "OVERDUE":
    default:
      return "Open";
  }
}

/**
 * Helper: Format date for MYOB API (YYYY-MM-DD)
 */
function formatDateForMYOB(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}
