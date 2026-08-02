import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mintPublicToken } from "@/lib/invoices/public-token";

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
      notes: null,
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
      notes: null,
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
      notes: null,
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
});
