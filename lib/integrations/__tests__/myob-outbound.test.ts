/**
 * RA-6920 B5 — MYOB outbound invoice/contact push to Xero parity.
 *
 * Covers: the company-file field fix (Integration.tenantId, not the
 * non-existent companyFileId), invoice mapping, customer upsert, idempotent
 * re-push (PUT update, not duplicate), and token-refresh on 401. Mocks
 * global.fetch per the established test idiom.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getValidMYOBAccessToken = vi.fn();
vi.mock("@/lib/services/myob/credentials", () => ({
  getValidMYOBAccessToken: (...args: unknown[]) =>
    getValidMYOBAccessToken(...args),
}));

import { syncInvoiceToMYOB } from "../myob";

const integration = {
  id: "integ_myob",
  accessToken: "myob-token",
  tenantId: "cf_1", // MYOB company file Id lives here (set by the OAuth client)
} as any;

function baseInvoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: "RA-2026-0002",
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-15",
    status: "SENT",
    customerName: "Acme Restoration",
    customerEmail: "acme@example.com",
    customerPhone: "0400000000",
    discountAmount: 0,
    shippingAmount: 0,
    lineItems: [
      {
        description: "Water extraction",
        category: "Labour",
        quantity: 2,
        unitPrice: 5000,
        total: 11000,
        gstRate: 10,
      },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createdResponse(location: string) {
  return new Response(null, { status: 201, headers: { Location: location } });
}

const BASE = "https://api.myob.com/accountright"; // sandbox default

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncInvoiceToMYOB — create", () => {
  it("uses Integration.tenantId as the company file id and POSTs the invoice", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(init.body) : undefined;
        calls.push({ url, method, body });

        if (url.includes("/Contact/Customer") && url.includes("$filter")) {
          return jsonResponse({ Items: [] });
        }
        if (url.endsWith("/Contact/Customer") && method === "POST") {
          return createdResponse(`${BASE}/cf_1/Contact/Customer/cust_1`);
        }
        if (url.endsWith("/Sale/Invoice") && method === "POST") {
          return createdResponse(`${BASE}/cf_1/Sale/Invoice/inv_1`);
        }
        if (url.includes("/Sale/Invoice/inv_1") && method === "GET") {
          return jsonResponse({
            UID: "inv_1",
            Number: "RA-2026-0002",
            Status: "Open",
            TotalAmount: 110,
            BalanceDueAmount: 110,
            URI: `${BASE}/cf_1/Sale/Invoice/inv_1`,
          });
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    const result = await syncInvoiceToMYOB(baseInvoice(), integration);

    expect(result.invoiceId).toBe("inv_1");
    expect(result.provider).toBe("myob");

    const invoicePost = calls.find(
      (c) => c.url === `${BASE}/cf_1/Sale/Invoice` && c.method === "POST",
    );
    expect(invoicePost).toBeDefined();
    // Company file id (tenantId) is in the URL — the companyFileId bug is fixed
    expect(invoicePost!.url).toContain("/cf_1/");
    expect(invoicePost!.body.Customer.UID).toBe("cust_1");
    expect(invoicePost!.body.Number).toBe("RA-2026-0002");
    expect(invoicePost!.body.Lines[0].Quantity).toBe(2);
    expect(invoicePost!.body.Lines[0].TaxCode.UID).toBe("GST");
    expect(invoicePost!.body.UID).toBeUndefined(); // create, not update
  });

  it("throws when the company file id (tenantId) is missing", async () => {
    await expect(
      syncInvoiceToMYOB(baseInvoice(), {
        ...integration,
        tenantId: null,
      } as any),
    ).rejects.toThrow(/No company file ID/);
  });
});

describe("syncInvoiceToMYOB — customer upsert", () => {
  it("refreshes an existing customer's contact details via GET-merge-PUT", async () => {
    let customerPut: any;
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(init.body) : undefined;

        if (url.includes("/Contact/Customer") && url.includes("$filter")) {
          return jsonResponse({ Items: [{ UID: "cust_9" }] });
        }
        if (url.includes("/Contact/Customer/cust_9") && method === "GET") {
          return jsonResponse({
            UID: "cust_9",
            CompanyName: "Acme Restoration",
            Addresses: [{ Location: 1 }],
            RowVersion: "5",
          });
        }
        if (url.includes("/Contact/Customer/cust_9") && method === "PUT") {
          customerPut = body;
          return jsonResponse({});
        }
        if (url.endsWith("/Sale/Invoice") && method === "POST") {
          return createdResponse(`${BASE}/cf_1/Sale/Invoice/inv_2`);
        }
        if (url.includes("/Sale/Invoice/inv_2") && method === "GET") {
          return jsonResponse({
            UID: "inv_2",
            Number: "RA-2026-0002",
            Status: "Open",
            TotalAmount: 110,
            BalanceDueAmount: 110,
            URI: "",
          });
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    await syncInvoiceToMYOB(baseInvoice(), integration);

    expect(customerPut).toBeDefined();
    expect(customerPut.UID).toBe("cust_9");
    expect(customerPut.Addresses[0].Email).toBe("acme@example.com");
    expect(customerPut.Addresses[0].Phone1).toBe("0400000000");
  });
});

describe("syncInvoiceToMYOB — idempotent re-push", () => {
  it("PUTs an update (no duplicate create) when externalInvoiceId is set", async () => {
    let createCalled = false;
    let putBody: any;
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(init.body) : undefined;

        if (url.includes("/Contact/Customer") && url.includes("$filter")) {
          return jsonResponse({ Items: [] });
        }
        if (url.endsWith("/Contact/Customer") && method === "POST") {
          return createdResponse(`${BASE}/cf_1/Contact/Customer/cust_1`);
        }
        if (url.endsWith("/Sale/Invoice") && method === "POST") {
          createCalled = true;
          return createdResponse(`${BASE}/cf_1/Sale/Invoice/should_not_happen`);
        }
        if (url.includes("/Sale/Invoice/inv_existing") && method === "GET") {
          return jsonResponse({
            UID: "inv_existing",
            Number: "RA-2026-0002",
            Status: "Open",
            TotalAmount: 110,
            BalanceDueAmount: 0,
            RowVersion: "9",
            URI: "",
          });
        }
        if (url.includes("/Sale/Invoice/inv_existing") && method === "PUT") {
          putBody = body;
          return jsonResponse({});
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    const result = await syncInvoiceToMYOB(
      baseInvoice({
        externalInvoiceId: "inv_existing",
        externalSyncProvider: "myob",
      }),
      integration,
    );

    expect(result.invoiceId).toBe("inv_existing");
    expect(createCalled).toBe(false);
    expect(putBody.UID).toBe("inv_existing");
    expect(putBody.RowVersion).toBe("9");
  });
});

describe("syncInvoiceToMYOB — error classification", () => {
  it("refreshes the token and throws (retryable) on 401", async () => {
    getValidMYOBAccessToken.mockResolvedValue({ ok: true, data: "fresh" });
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.includes("/Contact/Customer") && url.includes("$filter")) {
          return jsonResponse({ Items: [] });
        }
        if (url.endsWith("/Contact/Customer") && method === "POST") {
          return createdResponse(`${BASE}/cf_1/Contact/Customer/cust_1`);
        }
        if (url.endsWith("/Sale/Invoice") && method === "POST") {
          return jsonResponse({ Errors: [{ Message: "Unauthorized" }] }, 401);
        }
        throw new Error(`unexpected fetch: ${method} ${url}`);
      },
    );

    await expect(
      syncInvoiceToMYOB(baseInvoice(), integration),
    ).rejects.toThrow(/token refreshed, will retry/);
    expect(getValidMYOBAccessToken).toHaveBeenCalledWith("integ_myob");
  });
});
