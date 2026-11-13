/**
 * RA-paid-client tranche 1 — narrow public invoice DTO.
 *
 * Public invoice tokens (sent to customers in invoice emails) reveal only the
 * fields a customer needs to read, pay and reconcile an invoice. Owner-only
 * data MUST NOT be selected into this shape:
 *
 *   - `notes` — INTERNAL. The Prisma schema comment is
 *     `// Internal notes` (prisma/schema.prisma:4790) and the dashboard
 *     editor labels it "Internal Notes" with the placeholder
 *     "Internal notes (not visible to customer)" (app/dashboard/invoices/new/page.tsx:690,696).
 *     It is also listed in `FORBIDDEN_PUBLIC_INVOICE_FIELDS` below as the
 *     second line of defence against accidental re-introduction.
 *   - `adjustmentNote` / `adjustmentAmount` — staff pricing adjustments
 *   - `poNumber` / `pdfUrl` / `pdfGeneratedAt` — internal workflow fields
 *   - `externalInvoiceId` / `externalSyncProvider` / `externalSyncStatus` /
 *     `externalSyncError` / `externalSyncedAt` / `externalSyncRetryCount` —
 *     accounting-integration identifiers that would leak the contractor's
 *     stack and sync state to a public viewer
 *   - `publicViewCount` / `publicTokenRotatedAt` / `source` — token /
 *     source-tracking columns owned by the dashboard
 *   - `reportTitleSnapshot` / `reportAddressSnapshot` / `estimateRefSnapshot` /
 *     `clientNameSnapshot` — RA-1368 audit-trail snapshots for owner/ATO
 *     use only
 *
 * `terms` and `footer` are customer-facing — they render on the public
 * invoice under the "Terms" / footer block.
 *
 * The token itself is stripped from the response shape by the route
 * (returned as `expiresAt` only — see route.ts). `publicToken` is selected
 * here ONLY so the route can validate it against the request token; it is
 * never emitted to the client.
 *
 * # What this DTO catches — and what it does not
 *
 * `as const satisfies Prisma.InvoiceSelect` validates the SELECT shape's
 * keys are valid Invoice columns at compile time. It does NOT
 * automatically catch new columns added to the Invoice model: a new
 * column will simply not be selected here until someone adds it. The
 * regression test in `app/api/invoices/public/[token]/__tests__/route.test.ts`
 * pins `FORBIDDEN_PUBLIC_INVOICE_FIELDS` to staff-only columns that have
 * been audited; the second line of defence is the explicit allowlisted
 * transformer in route.ts (`toPublicInvoiceDto`) which picks fields by
 * name rather than rest-spreading the Prisma result.
 */
import { Prisma } from "@prisma/client";

/** Whitelisted Prisma `select` shape for the public invoice viewer. */
export const PUBLIC_INVOICE_SELECT = {
  id: true,
  invoiceNumber: true,
  status: true,
  invoiceDate: true,
  dueDate: true,
  customerName: true,
  customerEmail: true,
  customerAddress: true,
  customerABN: true,
  subtotalExGST: true,
  gstAmount: true,
  totalIncGST: true,
  amountPaid: true,
  amountDue: true,
  currency: true,
  terms: true,
  footer: true,
  // Selected ONLY so the route can validate the request token against it.
  // The public response never emits `publicToken` (see toPublicInvoiceDto).
  publicToken: true,
  publicTokenExpiresAt: true,
  user: {
    select: {
      businessName: true,
      businessABN: true,
      businessAddress: true,
      businessPhone: true,
      businessEmail: true,
      businessLogo: true,
    },
  },
  lineItems: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      description: true,
      category: true,
      quantity: true,
      unitPrice: true,
      subtotal: true,
      gstRate: true,
      gstAmount: true,
      total: true,
      sortOrder: true,
    },
  },
} as const satisfies Prisma.InvoiceSelect;

/**
 * Public DTO contract: the exact set of column names the public viewer is
 * permitted to receive. Mirrors `PUBLIC_INVOICE_SELECT`; the route also
 * surfaces `contractor` (the `user` relation, reshaped) and `expiresAt`
 * (the `publicTokenExpiresAt` column, renamed). Anything not in this list
 * is a regression if it ever appears in a public response.
 */
export const PUBLIC_INVOICE_FIELD_NAMES = [
  "id",
  "invoiceNumber",
  "status",
  "invoiceDate",
  "dueDate",
  "customerName",
  "customerEmail",
  "customerAddress",
  "customerABN",
  "subtotalExGST",
  "gstAmount",
  "totalIncGST",
  "amountPaid",
  "amountDue",
  "currency",
  "terms",
  "footer",
  "lineItems",
  "contractor",
  "expiresAt",
] as const;

/** Invoice column names that MUST NEVER appear in a public response. */
export const FORBIDDEN_PUBLIC_INVOICE_FIELDS = [
  // `notes` is internal. Pinned here so a future regression that adds
  // `notes: true` to PUBLIC_INVOICE_SELECT would still fail the
  // forbidden-field complement test.
  "notes",
  "adjustmentNote",
  "adjustmentAmount",
  "discountAmount",
  "discountPercentage",
  "shippingAmount",
  "poNumber",
  "pdfUrl",
  "pdfGeneratedAt",
  "externalInvoiceId",
  "externalSyncProvider",
  "externalSyncStatus",
  "externalSyncedAt",
  "externalSyncError",
  "externalSyncRetryCount",
  "publicViewCount",
  "publicTokenRotatedAt",
  "source",
  "reportTitleSnapshot",
  "reportAddressSnapshot",
  "estimateRefSnapshot",
  "clientNameSnapshot",
  "userId",
  "clientId",
  "reportId",
  "estimateId",
  "workspaceId",
  "originalInvoiceId",
  "recurringInvoiceId",
  "templateId",
] as const;

/** Narrow public invoice DTO returned to unauthenticated token viewers. */
export interface PublicInvoiceDto {
  id: string;
  invoiceNumber: string;
  status: string;
  invoiceDate: Date | string;
  dueDate: Date | string;
  customerName: string;
  customerEmail: string;
  customerAddress: string | null;
  customerABN: string | null;
  subtotalExGST: number;
  gstAmount: number;
  totalIncGST: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  terms: string | null;
  footer: string | null;
  lineItems: Array<{
    id: string;
    description: string;
    category: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    gstRate: number;
    gstAmount: number;
    total: number;
    sortOrder: number;
  }>;
  contractor: {
    businessName: string | null;
    businessABN: string | null;
    businessAddress: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
    businessLogo: string | null;
  } | null;
  expiresAt: Date | string | null;
}
