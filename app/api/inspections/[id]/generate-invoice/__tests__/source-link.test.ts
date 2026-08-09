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
  estimateFindFirst,
  invoiceFindFirst,
  clientFindFirst,
  $transaction,
  txInvoiceFindFirst,
  txInvoiceCreate,
  txEstimateUpdateMany,
  txSequenceUpsert,
  txAuditCreate,
  txInspectionAuditCreate,
} = vi.hoisted(() => ({
  inspectionFindFirst: vi.fn(),
  estimateFindFirst: vi.fn(),
  invoiceFindFirst: vi.fn(),
  clientFindFirst: vi.fn(),
  $transaction: vi.fn(),
  txInvoiceFindFirst: vi.fn(),
  txInvoiceCreate: vi.fn(),
  txEstimateUpdateMany: vi.fn(),
  txSequenceUpsert: vi.fn(),
  txAuditCreate: vi.fn(),
  txInspectionAuditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: inspectionFindFirst },
    estimate: { findFirst: estimateFindFirst },
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
  invoiceFindFirst.mockResolvedValue(null);
  txInvoiceFindFirst.mockResolvedValue(null);
  txEstimateUpdateMany.mockResolvedValue({ count: 1 });
  txSequenceUpsert.mockResolvedValue({ prefix: "RA", lastNumber: 1 });
  txAuditCreate.mockResolvedValue({});
  txInspectionAuditCreate.mockResolvedValue({});
  $transaction.mockImplementation(async (cb: any) =>
    cb({
      invoiceSequence: { upsert: txSequenceUpsert },
      invoice: {
        findFirst: txInvoiceFindFirst,
        create: txInvoiceCreate,
      },
      estimate: { updateMany: txEstimateUpdateMany },
      invoiceAuditLog: { create: txAuditCreate },
      auditLog: { create: txInspectionAuditCreate },
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
          OR: expect.arrayContaining([{ source: "inspection:insp_1" }]),
        }),
      }),
    );
  });

  it("POST persists source as inspection:{id}", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      reportId: "report_1",
      inspectionNumber: "INS-100",
      propertyAddress: "1 Test St",
      report: {
        id: "report_1",
        userId: "u_1",
        title: "Test report",
        propertyAddress: "1 Test St",
        clientId: "client_1",
        client: {
          id: "client_1",
          userId: "u_1",
          name: "Test Client",
          email: "client@test.com",
          phone: null,
          address: "1 Test St",
        },
      },
    });
    estimateFindFirst.mockResolvedValue({
      id: "estimate_1",
      version: 1,
      overheads: 0,
      profit: 0,
      contingency: 0,
      escalation: 0,
      lineItems: [
        {
          id: "estimate_line_1",
          code: null,
          category: "Water",
          description: "Extract",
          qty: 2,
          unit: "item",
          rate: 50,
          subtotal: 100,
          isPassThrough: false,
          taxType: "OUTPUT",
          xeroAccountCode: null,
        },
      ],
    });
    txInvoiceCreate.mockResolvedValue({
      id: "inv_1",
      invoiceNumber: "RA-2026-0001",
      totalIncGST: 11000,
      lineItems: [{ id: "li1" }],
    });

    const res = await POST(
      new NextRequest("http://localhost/api/x", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: "insp_1" }),
      },
    );

    expect(res.status).toBe(201);
    expect(txInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "inspection:insp_1",
        }),
      }),
    );
    expect(txEstimateUpdateMany).toHaveBeenCalledWith({
      where: { id: "estimate_1", userId: "u_1", status: "APPROVED" },
      data: { status: "LOCKED", updatedBy: "u_1" },
    });
    expect(txInspectionAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inspectionId: "insp_1",
        action: "ESTIMATE_LOCKED_FOR_INVOICE",
        entityType: "Estimate",
        entityId: "estimate_1",
        userId: "u_1",
        previousValue: "APPROVED",
        newValue: "LOCKED",
      }),
    });
  });

  it("creates the invoice from the linked client and latest approved estimate", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      reportId: "report_1",
      inspectionNumber: "INS-100",
      propertyAddress: "1 Inspection St",
      report: {
        id: "report_1",
        userId: "u_1",
        title: "Water restoration — 1 Report St",
        propertyAddress: "1 Report St",
        clientId: "client_claim",
        client: {
          id: "client_claim",
          userId: "u_1",
          name: "Claim Client",
          email: "claim@example.com",
          phone: "0400000000",
          address: "1 Report St",
        },
      },
    });
    estimateFindFirst.mockResolvedValue({
      id: "estimate_approved",
      version: 3,
      status: "APPROVED",
      overheads: 0,
      profit: 0,
      contingency: 0,
      escalation: 0,
      lineItems: [
        {
          id: "estimate_line_1",
          code: "DRY-01",
          category: "Equipment",
          description: "LGR dehumidifier",
          qty: 2,
          unit: "day",
          rate: 187.25,
          subtotal: 374.5,
          isPassThrough: false,
          taxType: "OUTPUT",
          xeroAccountCode: "200",
        },
      ],
    });
    clientFindFirst.mockResolvedValue({
      id: "client_oldest",
      name: "Wrong Oldest Client",
      email: "oldest@example.com",
      address: "99 Wrong St",
    });
    txInvoiceCreate.mockImplementation(async ({ data }: any) => ({
      id: "inv_1",
      invoiceNumber: "RA-2026-0001",
      totalIncGST: data.totalIncGST,
      lineItems: [{ id: "li1" }],
    }));

    const res = await POST(
      new NextRequest("http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id: "insp_1" }) },
    );

    expect(res.status).toBe(201);
    expect(estimateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reportId: "report_1",
          userId: "u_1",
          status: "APPROVED",
        },
        orderBy: { version: "desc" },
      }),
    );
    expect(clientFindFirst).not.toHaveBeenCalled();
    expect(txInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "inspection:insp_1",
          reportId: "report_1",
          estimateId: "estimate_approved",
          clientId: "client_claim",
          customerName: "Claim Client",
          customerEmail: "claim@example.com",
          customerAddress: "1 Report St",
          reportTitleSnapshot: "Water restoration — 1 Report St",
          reportAddressSnapshot: "1 Report St",
          estimateRefSnapshot: "Estimate-estimate-v3",
          clientNameSnapshot: "Claim Client",
          subtotalExGST: 37_450,
          gstAmount: 3_745,
          totalIncGST: 41_195,
          lineItems: {
            create: [
              expect.objectContaining({
                description: "LGR dehumidifier",
                quantity: 2,
                unitPrice: 18_725,
                subtotal: 37_450,
                gstRate: 10,
                gstAmount: 3_745,
                total: 41_195,
                estimateLineItemId: "estimate_line_1",
                code: "DRY-01",
                unit: "day",
              }),
            ],
          },
        }),
      }),
    );
  });

  it("does not fall back to freehand scope lines without an approved estimate", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      reportId: "report_1",
      inspectionNumber: "INS-100",
      propertyAddress: "1 Inspection St",
      report: {
        id: "report_1",
        userId: "u_1",
        title: "Water restoration — 1 Report St",
        propertyAddress: "1 Report St",
        clientId: "client_claim",
        client: {
          id: "client_claim",
          userId: "u_1",
          name: "Claim Client",
          email: "claim@example.com",
          phone: null,
          address: "1 Report St",
        },
      },
    });
    estimateFindFirst.mockResolvedValue(null);

    const res = await POST(
      new NextRequest("http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id: "insp_1" }) },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message:
            "An approved estimate with line items is required before generating an invoice.",
        }),
      }),
    );
    expect($transaction).not.toHaveBeenCalled();
  });

  it("reuses an existing inspection invoice before looking for another approved estimate", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      reportId: "report_1",
      inspectionNumber: "INS-100",
      propertyAddress: "1 Inspection St",
      report: {
        id: "report_1",
        userId: "u_1",
        title: "Water restoration",
        propertyAddress: "1 Inspection St",
        clientId: "client_1",
        client: {
          id: "client_1",
          userId: "u_1",
          name: "Claim Client",
          email: "claim@example.com",
          phone: null,
          address: "1 Inspection St",
        },
      },
    });
    invoiceFindFirst.mockResolvedValue({
      id: "inv_existing",
      invoiceNumber: "RA-2026-0042",
      totalIncGST: 16_000,
      lineItems: [{ id: "invoice_line_existing" }],
    });

    const res = await POST(
      new NextRequest("http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id: "insp_1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      invoiceId: "inv_existing",
      invoiceNumber: "RA-2026-0042",
      totalIncGST: 16_000,
      lineItemCount: 1,
      reused: true,
    });
    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "u_1",
          reportId: "report_1",
          estimateId: { not: null },
          source: "inspection:insp_1",
        },
      }),
    );
    expect(estimateFindFirst).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });

  it("zero-rates EXEMPT lines while retaining GST on taxable lines", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      reportId: "report_1",
      inspectionNumber: "INS-100",
      propertyAddress: "1 Inspection St",
      report: {
        id: "report_1",
        userId: "u_1",
        title: "Water restoration",
        propertyAddress: "1 Inspection St",
        clientId: "client_1",
        client: {
          id: "client_1",
          userId: "u_1",
          name: "Claim Client",
          email: "claim@example.com",
          phone: null,
          address: "1 Inspection St",
        },
      },
    });
    estimateFindFirst.mockResolvedValue({
      id: "estimate_mixed_tax",
      version: 2,
      overheads: 0,
      profit: 0,
      contingency: 0,
      escalation: 0,
      totalIncGST: 160,
      lineItems: [
        {
          id: "line_taxable",
          code: null,
          category: "Labour",
          description: "Taxable labour",
          qty: 1,
          unit: "item",
          rate: 100,
          subtotal: 100,
          isPassThrough: false,
          taxType: "OUTPUT",
          xeroAccountCode: null,
        },
        {
          id: "line_exempt",
          code: null,
          category: "Disbursement",
          description: "GST-exempt fee",
          qty: 1,
          unit: "item",
          rate: 50,
          subtotal: 50,
          isPassThrough: true,
          taxType: "EXEMPT",
          xeroAccountCode: null,
        },
      ],
    });
    txInvoiceCreate.mockImplementation(async ({ data }: any) => ({
      id: "inv_1",
      invoiceNumber: "RA-2026-0001",
      totalIncGST: data.totalIncGST,
      lineItems: [{ id: "li1" }, { id: "li2" }],
    }));

    const res = await POST(
      new NextRequest("http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id: "insp_1" }) },
    );

    expect(res.status).toBe(201);
    const data = txInvoiceCreate.mock.calls[0][0].data;
    expect(data.subtotalExGST).toBe(15_000);
    expect(data.gstAmount).toBe(1_000);
    expect(data.totalIncGST).toBe(16_000);
    expect(data.adjustmentAmount).toBe(0);
    expect(data.lineItems.create).toEqual([
      expect.objectContaining({
        estimateLineItemId: "line_taxable",
        gstRate: 10,
        gstAmount: 1_000,
        total: 11_000,
      }),
      expect.objectContaining({
        estimateLineItemId: "line_exempt",
        gstRate: 0,
        gstAmount: 0,
        total: 5_000,
        taxType: "EXEMPT",
      }),
    ]);
  });

  it("preserves the approved nearest-$5 total as an explicit rounding adjustment", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      reportId: "report_1",
      inspectionNumber: "INS-100",
      propertyAddress: "1 Inspection St",
      report: {
        id: "report_1",
        userId: "u_1",
        title: "Water restoration",
        propertyAddress: "1 Inspection St",
        clientId: "client_1",
        client: {
          id: "client_1",
          userId: "u_1",
          name: "Claim Client",
          email: "claim@example.com",
          phone: null,
          address: "1 Inspection St",
        },
      },
    });
    estimateFindFirst.mockResolvedValue({
      id: "estimate_rounded",
      version: 4,
      overheads: 0,
      profit: 0,
      contingency: 0,
      escalation: 0,
      totalIncGST: 125,
      lineItems: [
        {
          id: "line_rounded",
          code: null,
          category: "Labour",
          description: "Approved restoration work",
          qty: 1,
          unit: "item",
          rate: 111.77,
          subtotal: 111.77,
          isPassThrough: false,
          taxType: "OUTPUT",
          xeroAccountCode: null,
        },
      ],
    });
    txInvoiceCreate.mockImplementation(async ({ data }: any) => ({
      id: "inv_rounded",
      invoiceNumber: "RA-2026-0001",
      totalIncGST: data.totalIncGST,
      lineItems: [{ id: "li1" }],
    }));

    const res = await POST(
      new NextRequest("http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id: "insp_1" }) },
    );

    expect(res.status).toBe(201);
    const data = txInvoiceCreate.mock.calls[0][0].data;
    expect(data.subtotalExGST).toBe(11_177);
    expect(data.gstAmount).toBe(1_118);
    expect(data.adjustmentAmount).toBe(205);
    expect(data.adjustmentNote).toBe(
      "Approved estimate total rounding adjustment",
    );
    expect(data.totalIncGST).toBe(12_500);
    expect(data.amountDue).toBe(12_500);
    expect(
      data.subtotalExGST + data.gstAmount + data.adjustmentAmount,
    ).toBe(data.totalIncGST);
  });

  it("rejects a report client outside the inspection tenant", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      reportId: "report_1",
      inspectionNumber: "INS-100",
      propertyAddress: "1 Inspection St",
      report: {
        id: "report_1",
        userId: "u_1",
        title: "Water restoration — 1 Report St",
        propertyAddress: "1 Report St",
        clientId: "client_foreign",
        client: {
          id: "client_foreign",
          userId: "u_2",
          name: "Foreign Client",
          email: "foreign@example.com",
          phone: null,
          address: "2 Foreign St",
        },
      },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id: "insp_1" }) },
    );

    expect(res.status).toBe(409);
    expect(estimateFindFirst).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });
});
