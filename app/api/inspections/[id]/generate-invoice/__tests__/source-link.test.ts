import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (_req: unknown, _uid: string, fn: () => Promise<unknown>) =>
    fn(),
}));

const {
  inspectionFindFirst,
  invoiceFindFirst,
  clientFindFirst,
  $transaction,
  txInvoiceCreate,
  txSequenceUpsert,
  txAuditCreate,
} = vi.hoisted(() => ({
  inspectionFindFirst: vi.fn(),
  invoiceFindFirst: vi.fn(),
  clientFindFirst: vi.fn(),
  $transaction: vi.fn(),
  txInvoiceCreate: vi.fn(),
  txSequenceUpsert: vi.fn(),
  txAuditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: inspectionFindFirst },
    invoice: { findFirst: invoiceFindFirst },
    client: { findFirst: clientFindFirst },
    invoiceSequence: { upsert: vi.fn() },
    $transaction,
  },
}));

import { getServerSession } from "next-auth";
import { GET, POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({
    user: { id: "u_1", email: "tech@test.com" },
  });
  txSequenceUpsert.mockResolvedValue({ prefix: "RA", lastNumber: 1 });
  txAuditCreate.mockResolvedValue({});
  $transaction.mockImplementation(async (cb: any) =>
    cb({
      invoiceSequence: { upsert: txSequenceUpsert },
      invoice: { create: txInvoiceCreate },
      invoiceAuditLog: { create: txAuditCreate },
    }),
  );
});

describe("inspection generate-invoice source link", () => {
  it("GET looks up by source inspection:{id}", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      inspectionNumber: "INS-100",
    });
    invoiceFindFirst.mockResolvedValue(null);

    await GET(new NextRequest("http://localhost/api/x"), {
      params: Promise.resolve({ id: "insp_1" }),
    });

    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u_1",
          OR: expect.arrayContaining([
            { source: "inspection:insp_1" },
          ]),
        }),
      }),
    );
  });

  it("POST persists source as inspection:{id}", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      inspectionNumber: "INS-100",
      propertyAddress: "1 Test St",
      technicianName: "Sam",
      scopeItems: [{ quantity: 2, description: "Extract", itemType: "Water" }],
    });
    clientFindFirst.mockResolvedValue(null);
    txInvoiceCreate.mockResolvedValue({
      id: "inv_1",
      invoiceNumber: "RA-2026-0001",
      totalIncGST: 11000,
      lineItems: [{ id: "li1" }],
    });

    const res = await POST(new NextRequest("http://localhost/api/x", {
      method: "POST",
    }), {
      params: Promise.resolve({ id: "insp_1" }),
    });

    expect(res.status).toBe(201);
    expect(txInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "inspection:insp_1",
        }),
      }),
    );
  });
});
