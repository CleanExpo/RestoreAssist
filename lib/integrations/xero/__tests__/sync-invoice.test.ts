/**
 * Unit tests for syncInvoiceToXero — covers happy path, 409 conflict recovery,
 * and HTTP error propagation from the update sub-request.
 *
 * All fetch calls are mocked — no real API or DB access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Integration } from "@prisma/client";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../xero/token-manager", () => ({
  getValidXeroToken: vi.fn(),
}));

vi.mock("../../gst-rules", () => ({
  getGstTreatment: vi.fn().mockReturnValue({ xeroTaxType: "OUTPUT" }),
}));

vi.mock("../../gst-treatment-rules", () => ({
  getGSTTreatment: vi.fn().mockReturnValue({ taxType: "OUTPUT" }),
}));

import { syncInvoiceToXero } from "../../xero";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIntegration(overrides: Partial<Integration> = {}): Integration {
  return {
    id: "int-1",
    provider: "XERO",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tenantId: "tenant-123",
    expiresAt: null,
    status: "ACTIVE",
    userId: "user-1",
    workspaceId: "ws-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    errorMessage: null,
    metadata: null,
    ...overrides,
  } as unknown as Integration;
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Acme Corp",
    customerEmail: "acme@example.com",
    customerPhone: null,
    customerABN: null,
    invoiceDate: new Date("2026-01-15"),
    dueDate: new Date("2026-01-29"),
    invoiceNumber: "INV-001",
    status: "SENT",
    lineItems: [
      {
        description: "Water extraction",
        category: "LABOUR",
        quantity: 2,
        unitPrice: 15000, // cents
        subtotal: 30000,
      },
    ],
    currency: "AUD",
    discountAmount: 0,
    shippingAmount: 0,
    ...overrides,
  };
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("syncInvoiceToXero", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates invoice successfully on 200", async () => {
    const xeroResponse = {
      Invoices: [
        {
          InvoiceID: "xero-inv-abc",
          InvoiceNumber: "INV-001",
          Status: "SUBMITTED",
          Total: 330,
          AmountDue: 330,
          DateString: "2026-01-15",
          DueDateString: "2026-01-29",
        },
      ],
    };
    vi.stubGlobal("fetch", mockFetchOnce(200, xeroResponse));

    const result = await syncInvoiceToXero(makeInvoice(), makeIntegration());

    expect(result.invoiceId).toBe("xero-inv-abc");
    expect(result.provider).toBe("xero");
    expect(result.status).toBe("SUBMITTED");
  });

  it("recovers from 409 by updating the existing invoice", async () => {
    const conflictBody = {
      Invoices: [{ InvoiceID: "xero-existing-id" }],
    };
    const updateBody = {
      Invoices: [
        {
          InvoiceID: "xero-existing-id",
          InvoiceNumber: "INV-001",
          Status: "SUBMITTED",
          Total: 330,
          AmountDue: 330,
          DateString: "2026-01-15",
          DueDateString: "2026-01-29",
        },
      ],
    };

    const fetchMock = vi
      .fn()
      // First call: POST /Invoices — 409 conflict
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: () => Promise.resolve(conflictBody),
      })
      // Second call: POST /Invoices/{existingId} — update succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(updateBody),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await syncInvoiceToXero(makeInvoice(), makeIntegration());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call should target the specific InvoiceID
    expect(fetchMock.mock.calls[1][0]).toContain("xero-existing-id");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(result.invoiceId).toBe("xero-existing-id");
  });

  it("throws a clear HTTP error when the 409 update sub-request fails", async () => {
    const conflictBody = {
      Invoices: [{ InvoiceID: "xero-existing-id" }],
    };
    const updateErrorBody = {
      Detail: "Invoice is locked and cannot be updated",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: () => Promise.resolve(conflictBody),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: () => Promise.resolve(updateErrorBody),
      });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      syncInvoiceToXero(makeInvoice(), makeIntegration()),
    ).rejects.toThrow(
      /Xero update failed \(403\) for InvoiceID xero-existing-id/,
    );
  });

  it("throws when 409 response contains no recoverable InvoiceID", async () => {
    const conflictBody = { Detail: "Duplicate detected" };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: () => Promise.resolve(conflictBody),
      }),
    );

    await expect(
      syncInvoiceToXero(makeInvoice(), makeIntegration()),
    ).rejects.toThrow(/could not recover existing InvoiceID/);
  });

  it("throws when access token is missing", async () => {
    await expect(
      syncInvoiceToXero(makeInvoice(), makeIntegration({ accessToken: null })),
    ).rejects.toThrow("No access token available for Xero");
  });

  it("throws when tenant ID is missing", async () => {
    await expect(
      syncInvoiceToXero(makeInvoice(), makeIntegration({ tenantId: null })),
    ).rejects.toThrow("No tenant ID available for Xero");
  });
});
