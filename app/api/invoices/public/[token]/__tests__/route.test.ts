import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mintPublicToken } from "@/lib/invoices/public-token";
import { FORBIDDEN_PUBLIC_INVOICE_FIELDS } from "@/lib/invoices/public-invoice-dto";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

const { invoiceFindFirst, invoiceUpdateMany } = vi.hoisted(() => ({
  invoiceFindFirst: vi.fn(),
  invoiceUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findFirst: invoiceFindFirst,
      updateMany: invoiceUpdateMany,
    },
  },
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  invoiceUpdateMany.mockResolvedValue({ count: 0 });
});

function req(token: string) {
  return new NextRequest(`http://localhost/api/invoices/public/${token}`, {
    method: "GET",
  });
}

describe("GET /api/invoices/public/[token]", () => {
  it("returns 404 for short/invalid token shape", async () => {
    const res = await GET(req("short"), {
      params: Promise.resolve({ token: "short" }),
    });
    expect(res.status).toBe(404);
    expect(invoiceFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when token mismatches", async () => {
    const minted = mintPublicToken();
    invoiceFindFirst.mockResolvedValue({
      id: "inv1",
      invoiceNumber: "RA-2026-0001",
      status: "SENT",
      invoiceDate: new Date(),
      dueDate: new Date(),
      customerName: "Acme",
      customerEmail: "a@test.com",
      customerAddress: null,
      customerABN: null,
      subtotalExGST: 10000,
      gstAmount: 1000,
      totalIncGST: 11000,
      amountPaid: 0,
      amountDue: 11000,
      currency: "AUD",
      terms: null,
      footer: null,
      publicToken: minted.token,
      publicTokenExpiresAt: minted.expiresAt,
      user: { businessName: "Co" },
      lineItems: [],
    });

    const res = await GET(req("x".repeat(43)), {
      params: Promise.resolve({ token: "x".repeat(43) }),
    });
    // findFirst uses where publicToken = supplied, so mock returning a row
    // with different token still fails isPublicTokenValid
    expect(res.status).toBe(404);
  });

  it("returns public invoice payload for valid token", async () => {
    const minted = mintPublicToken();
    invoiceFindFirst.mockResolvedValue({
      id: "inv1",
      invoiceNumber: "RA-2026-0001",
      status: "SENT",
      invoiceDate: new Date("2026-07-01"),
      dueDate: new Date("2026-07-15"),
      customerName: "Acme",
      customerEmail: "a@test.com",
      customerAddress: null,
      customerABN: null,
      subtotalExGST: 10000,
      gstAmount: 1000,
      totalIncGST: 11000,
      amountPaid: 0,
      amountDue: 11000,
      currency: "AUD",
      terms: null,
      footer: null,
      publicToken: minted.token,
      publicTokenExpiresAt: minted.expiresAt,
      user: {
        businessName: "Restore Co",
        businessABN: "53004085616",
        businessAddress: "1 Test St",
        businessPhone: null,
        businessEmail: "billing@test.com",
        businessLogo: "https://res.cloudinary.com/demo/image/upload/logo.png",
      },
      lineItems: [
        {
          id: "li1",
          description: "Drying",
          category: "Restoration",
          quantity: 1,
          unitPrice: 10000,
          subtotal: 10000,
          gstRate: 10,
          gstAmount: 1000,
          total: 11000,
          sortOrder: 0,
        },
      ],
    });

    const res = await GET(req(minted.token), {
      params: Promise.resolve({ token: minted.token }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.invoice.invoiceNumber).toBe("RA-2026-0001");
    expect(json.invoice.contractor.businessName).toBe("Restore Co");
    expect(json.invoice.lineItems).toHaveLength(1);
    expect(json.invoice.publicToken).toBeUndefined();
  });

  it("returns 404 for expired token", async () => {
    const minted = mintPublicToken();
    invoiceFindFirst.mockResolvedValue({
      id: "inv1",
      invoiceNumber: "RA-2026-0001",
      status: "SENT",
      invoiceDate: new Date(),
      dueDate: new Date(),
      customerName: "Acme",
      customerEmail: "a@test.com",
      customerAddress: null,
      customerABN: null,
      subtotalExGST: 10000,
      gstAmount: 1000,
      totalIncGST: 11000,
      amountPaid: 0,
      amountDue: 11000,
      currency: "AUD",
      terms: null,
      footer: null,
      publicToken: minted.token,
      publicTokenExpiresAt: new Date(Date.now() - 1000),
      user: { businessName: "Co" },
      lineItems: [],
    });

    const res = await GET(req(minted.token), {
      params: Promise.resolve({ token: minted.token }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(String(json.error?.message || "")).toMatch(/expired/i);
  });

  it("does not leak staff-only or owner fields in the public DTO", async () => {
    // The Prisma select in the route plus the explicit allowlisted
    // transformer `toPublicInvoiceDto` are the only filters. The mock
    // here returns the wider Invoice model so we can prove neither path
    // forwards fields they never asked for. If a forbidden field shows
    // up in the response, the narrow DTO contract has regressed.
    const minted = mintPublicToken();
    const INTERNAL_NOTES_MARKER =
      "INTERNAL_NOTES_LEAK_MARKER_RA_PAID_TR2_xyz9";
    invoiceFindFirst.mockResolvedValue({
      id: "inv1",
      invoiceNumber: "RA-2026-0001",
      status: "SENT",
      invoiceDate: new Date(),
      dueDate: new Date(),
      customerName: "Acme",
      customerEmail: "a@test.com",
      customerAddress: null,
      customerABN: null,
      subtotalExGST: 10000,
      gstAmount: 1000,
      totalIncGST: 11000,
      amountPaid: 0,
      amountDue: 11000,
      currency: "AUD",
      // `notes` is internal (Prisma `// Internal notes`, dashboard
      // "Internal notes (not visible to customer)"). The mock returns
      // it so we can prove the route drops it; the marker makes the
      // regression easy to recognise in a log.
      notes: INTERNAL_NOTES_MARKER,
      terms: "Net 30",
      footer: "Thanks for your business",
      publicToken: minted.token,
      publicTokenExpiresAt: minted.expiresAt,
      // Owner-only / staff-only fields below — these MUST NOT be in
      // the public response. The route's narrow `select` plus the
      // explicit allowlisted transformer `toPublicInvoiceDto` stop
      // them; this test pins that behaviour.
      adjustmentNote: "Owner discount 10% — DO NOT INCLUDE ON PDF",
      adjustmentAmount: 5000,
      discountAmount: 1000,
      discountPercentage: 5,
      shippingAmount: 250,
      poNumber: "PO-INTERNAL-1234",
      pdfUrl: "https://cloudinary.com/internal-only.pdf",
      pdfGeneratedAt: new Date(),
      externalInvoiceId: "XERO-INV-9999",
      externalSyncProvider: "XERO",
      externalSyncStatus: "SYNCED",
      externalSyncedAt: new Date(),
      externalSyncError: "Rate limited",
      externalSyncRetryCount: 3,
      publicViewCount: 42,
      publicTokenRotatedAt: new Date(),
      source: "estimate",
      reportTitleSnapshot: "Internal report title",
      reportAddressSnapshot: "Internal address",
      estimateRefSnapshot: "Estimate-abc-1",
      clientNameSnapshot: "Acme Pty Ltd",
      userId: "user-internal-1234",
      clientId: "client-internal-1234",
      reportId: "report-internal-1234",
      estimateId: "estimate-internal-1234",
      workspaceId: "workspace-internal-1234",
      originalInvoiceId: "inv-original",
      recurringInvoiceId: "recurring-1",
      templateId: "template-1",
      user: { businessName: "Restore Co" },
      lineItems: [],
    });

    const res = await GET(req(minted.token), {
      params: Promise.resolve({ token: minted.token }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const body = json.invoice;

    for (const field of FORBIDDEN_PUBLIC_INVOICE_FIELDS) {
      expect(body[field], `forbidden field "${field}" leaked`).toBeUndefined();
    }

    // `notes` specifically: a unique marker must not appear in the
    // public body even when the database row has it set. This is the
    // single-field regression guard for the staff-only notes fix.
    expect(body.notes).toBeUndefined();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(INTERNAL_NOTES_MARKER);

    // Customer-facing `terms` and `footer` are preserved.
    expect(body.terms).toBe("Net 30");
    expect(body.footer).toBe("Thanks for your business");
  });

  it("forbidden-field list is non-empty (test would silently pass if emptied)", () => {
    expect(FORBIDDEN_PUBLIC_INVOICE_FIELDS.length).toBeGreaterThan(0);
  });

  it("forbidden-field list includes `notes` (would silently pass if `notes` was removed)", () => {
    // Guard against a future "cleanup" that drops the `notes` entry
    // from FORBIDDEN_PUBLIC_INVOICE_FIELDS, which would let a leak
    // through the forbidden-field complement test.
    expect(FORBIDDEN_PUBLIC_INVOICE_FIELDS).toContain("notes");
  });
});
