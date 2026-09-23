/**
 * RA-7736: the Xero / MYOB / QuickBooks NIR syncs must export the contingency.
 *
 * Since RA-7708 the contingency is one CostEstimate row with no scope item.
 * The accounting syncs built their lines from scope items only, so the lines
 * sent to the books summed to the contingency less than the invoice total
 * ($271.08 on the NIR-2026-09-F1C142 fixture).
 *
 * Fixture numbers match the RA-7725 route test: five priced lines (2259.00)
 * plus a 271.08 contingency = 2530.08 ex-GST.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeGstCents, getGstTreatment, type Country } from "@/lib/gst-rules";

vi.mock("../oauth-handler", () => ({
  getTokens: vi.fn(async () => ({
    accessToken: "tok",
    refreshToken: "ref",
    isExpired: false,
  })),
  markIntegrationError: vi.fn(),
  logSync: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findUnique: vi.fn(async () => ({ companyId: "cf_1", realmId: "realm_1" })),
    },
  },
}));

vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: vi.fn(async () => ({ ok: true, data: "tok" })),
}));
vi.mock("@/lib/services/xero/tenant", () => ({
  getXeroTenantId: vi.fn(async () => ({ ok: true, data: "tenant_1" })),
}));
vi.mock("../xero/account-code-resolver", () => ({
  resolveAccountCodes: vi.fn(async () => new Map()),
  resolveAccountCodeForItemType: vi.fn(),
}));

import type { NIRJobPayload } from "../xero/nir-sync";
import { syncNIRJobToXero } from "../xero/nir-sync";
import { syncNIRJobToMYOB } from "../myob/nir-sync";
import { syncNIRJobToQuickBooks } from "../quickbooks/nir-sync";

const PRICED_CENTS = [32500, 17500, 22500, 48400, 105000];
const CONTINGENCY_CENTS = 27108;
const EX_GST_CENTS = 253008;
// Independently stated invoice totals (same as RA-7725's route test).
const INC_GST_CENTS: Record<Country, number> = { AU: 278309, NZ: 290959 };

function payload(country: Country): NIRJobPayload {
  const t = getGstTreatment(country);
  const gstAmount = computeGstCents(EX_GST_CENTS, country);
  return {
    reportId: "rep-1",
    country,
    currency: t.currency,
    clientName: "Client",
    propertyAddress: "1 Test St",
    reportNumber: "NIR-2026-09-F1C142",
    damageType: "WATER",
    scopeItems: PRICED_CENTS.map((amount, i) => ({
      description: `Priced line ${i}`,
      category: "LABOUR",
      quantity: 1,
      unit: "each",
      unitPriceExGST: amount,
      gstRate: t.ratePercent,
      subtotalExGST: amount,
    })),
    contingencyExGST: CONTINGENCY_CENTS,
    totalExGST: EX_GST_CENTS,
    gstAmount,
    totalIncGST: EX_GST_CENTS + gstAmount,
    inspectionDate: new Date("2026-09-22"),
    reportDate: new Date("2026-09-23"),
    technician: "Tech",
  } as NIRJobPayload;
}

function jsonResponse(body: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

let posted: Array<{ url: string; body: any }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  posted = [];
  vi.spyOn(global, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body) : undefined;
    if (method === "POST") posted.push({ url, body });

    if (url.includes("api.xero.com")) {
      return jsonResponse({
        Invoices: [{ InvoiceID: "x1", InvoiceNumber: "INV-1", Status: "DRAFT" }],
      });
    }
    if (url.includes("/Contact/Customer")) {
      return jsonResponse({ Items: [{ UID: "cust_1" }] });
    }
    if (url.includes("/Sale/Invoice/Service")) {
      return new Response(null, {
        status: 201,
        headers: { Location: "https://api.myob.com/sale/s1" },
      });
    }
    if (url.includes("/query?")) {
      return jsonResponse({ QueryResponse: { Customer: [{ Id: "c1" }] } });
    }
    if (url.endsWith("/invoice")) {
      return jsonResponse({ Invoice: { Id: "q1", DocNumber: "D1" } });
    }
    return jsonResponse({}, 404);
  });
});

const toCents = (dollars: number) => Math.round(dollars * 100);

function expectReconciles(
  country: Country,
  lines: Array<{ description: string; cents: number; tax: string }>,
  taxedCode: string,
) {
  const contingency = lines.filter((l) => /Contingency/.test(l.description));
  expect(contingency).toHaveLength(1);
  expect(contingency[0].cents).toBe(CONTINGENCY_CENTS);
  expect(contingency[0].tax).toBe(taxedCode);

  const exGst = lines.reduce((s, l) => s + l.cents, 0);
  expect(exGst).toBe(EX_GST_CENTS);
  expect(exGst + computeGstCents(exGst, country)).toBe(INC_GST_CENTS[country]);
}

describe.each(["AU", "NZ"] as const)("RA-7736 contingency export (%s)", (country) => {
  const t = getGstTreatment(country);

  it("Xero: the contingency is its own line and the lines equal the invoice total", async () => {
    await syncNIRJobToXero("integ_xero", payload(country));
    const invoice = posted.find((p) => p.url.includes("/Invoices"))!.body.Invoices[0];
    expectReconciles(
      country,
      invoice.LineItems.map((l: any) => ({
        description: l.Description,
        cents: toCents(l.LineAmount),
        tax: l.TaxType,
      })),
      t.xeroTaxType,
    );
  });

  it("MYOB: the contingency is its own line and the lines equal the invoice total", async () => {
    await syncNIRJobToMYOB("integ_myob", payload(country));
    const sale = posted.find((p) => p.url.includes("/Sale/Invoice/Service"))!.body;
    expectReconciles(
      country,
      sale.Lines.map((l: any) => ({
        description: l.Description,
        cents: toCents(l.Total),
        tax: l.TaxCode.Code,
      })),
      t.myobTaxCode,
    );
  });

  it("QuickBooks: the contingency is its own line and the lines equal the invoice total", async () => {
    await syncNIRJobToQuickBooks("integ_qbo", payload(country));
    const invoice = posted.find((p) => p.url.endsWith("/invoice"))!.body;
    expectReconciles(
      country,
      invoice.Line.map((l: any) => ({
        description: l.Description,
        cents: toCents(l.Amount),
        tax: l.SalesItemLineDetail.TaxCodeRef.value,
      })),
      t.qboTaxRateName,
    );
  });
});
