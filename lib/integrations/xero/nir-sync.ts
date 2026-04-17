/**
 * Xero NIR Sync Module
 *
 * Translates a completed NIR into a Xero invoice.
 * - NIR scope items → Xero line items (quantity, unit price, AU GST)
 * - NIR client → Xero Contact (create or match by name/email/ABN)
 * - NIR report reference → Xero invoice reference field
 * - Line item category → Xero account code via account-code-resolver (RA-869)
 */

import { markIntegrationError, logSync } from "../oauth-handler";
import { getValidXeroToken, getXeroTenantId } from "./token-manager";
import { resolveAccountCodes } from "./account-code-resolver";

/**
 * RA-870: Format an 11-digit ABN to Xero TaxNumber format (XX XXX XXX XXX).
 * Returns null if the input is not a valid 11-digit ABN.
 * Inlined from xero.ts to avoid Turbopack circular import resolution
 * (xero.ts → xero/token-manager.ts → xero/nir-sync.ts → xero.ts).
 */
function formatABN(abn: string | null | undefined): string | null {
  if (!abn) return null;
  const digits = abn.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}

export interface NIRScopeItem {
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitPriceExGST: number; // cents
  gstRate: number; // 0 or 10
  subtotalExGST: number; // cents
  iicrcRef?: string;
}

export interface NIRJobPayload {
  reportId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientABN?: string; // RA-870: ABN → Xero Contact.TaxNumber for ATO reporting
  propertyAddress: string;
  reportNumber: string;
  damageType: "WATER" | "FIRE" | "MOULD" | "GENERAL";
  waterCategory?: "1" | "2" | "3";
  waterClass?: "1" | "2" | "3" | "4";
  scopeItems: NIRScopeItem[];
  totalExGST: number; // cents
  gstAmount: number; // cents
  totalIncGST: number; // cents
  inspectionDate: Date;
  reportDate: Date;
  technician?: string;
  insuranceClaim?: string;
  notes?: string;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
function cents(c: number): number {
  return Math.round(c) / 100;
}

export async function syncNIRJobToXero(
  integrationId: string,
  job: NIRJobPayload,
): Promise<{
  xeroInvoiceId: string;
  xeroInvoiceNumber: string;
  status: string;
}> {
  // RA-868: Centralised token + tenant lookup (throws XeroTokenError on failure)
  const accessToken = await getValidXeroToken(integrationId);
  const tenantId = await getXeroTenantId(integrationId);

  // RA-869: Per-category account code routing (cached per integration, 5-min TTL).
  // Supports client-configured mappings in XeroAccountCodeMapping; falls back to
  // built-in defaults for canonical categories (LABOUR/EQUIPMENT/MATERIALS/
  // SUBCONTRACTOR/PRELIMS/CONTENTS) and global default otherwise.
  const resolvedCodes = await resolveAccountCodes(
    integrationId,
    job.scopeItems.map((item, idx) => ({
      id: `scope-${idx}`,
      category: item.category,
    })),
  );

  const dueDate = new Date(job.reportDate);
  dueDate.setDate(dueDate.getDate() + 14);

  const lineItems = [
    ...job.scopeItems.map((item, idx) => {
      const resolved = resolvedCodes.get(`scope-${idx}`) ?? {
        accountCode: "200",
        taxType: "OUTPUT",
      };
      return {
        Description: item.iicrcRef
          ? `${item.description} (${item.category}) [${item.iicrcRef}]`
          : `${item.description} (${item.category})`,
        Quantity: item.quantity,
        UnitAmount: cents(item.unitPriceExGST),
        AccountCode: resolved.accountCode,
        // Preserve item-level 0% GST pathway (non-taxable items stay "NONE")
        TaxType: item.gstRate === 10 ? resolved.taxType : "NONE",
        LineAmount: cents(item.subtotalExGST),
      };
    }),
    ...(job.technician
      ? [
          {
            Description: `Technician: ${job.technician} | Inspection: ${formatDate(job.inspectionDate)}`,
            Quantity: 0,
            UnitAmount: 0,
            TaxType: "NONE",
            LineAmount: 0,
          },
        ]
      : []),
  ];

  const invoice = {
    Type: "ACCREC",
    Contact: {
      Name: job.clientName,
      ...(job.clientEmail && { EmailAddress: job.clientEmail }),
      ...(job.clientPhone && {
        Phones: [{ PhoneType: "DEFAULT", PhoneNumber: job.clientPhone }],
      }),
      // RA-870: Map client ABN to Xero TaxNumber for ATO reporting
      ...(formatABN(job.clientABN) && { TaxNumber: formatABN(job.clientABN) }),
    },
    Date: formatDate(job.reportDate),
    DueDate: formatDate(dueDate),
    InvoiceNumber: job.reportNumber,
    Reference: `NIR-${job.reportId}${job.insuranceClaim ? " | Claim: " + job.insuranceClaim : ""}`,
    Status: "DRAFT",
    LineItems: lineItems,
    CurrencyCode: "AUD",
  };

  const res = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ Invoices: [invoice] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    await markIntegrationError(integrationId, `Xero error: ${res.statusText}`);
    throw new Error(
      `Xero API error: ${res.statusText} — ${JSON.stringify(err)}`,
    );
  }

  const data = await res.json();
  const created = data.Invoices?.[0];
  if (!created) throw new Error("Xero returned empty invoice response");

  await logSync(integrationId, "FULL", "SUCCESS", 1, 0);
  return {
    xeroInvoiceId: created.InvoiceID,
    xeroInvoiceNumber: created.InvoiceNumber,
    status: created.Status,
  };
}
