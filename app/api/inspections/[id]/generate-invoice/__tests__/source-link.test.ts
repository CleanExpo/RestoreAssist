import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/gst/resolve-user-gst", () => ({
  resolveUserGstTreatment: vi.fn().mockResolvedValue({
    country: "AU",
    rate: 0.1,
    ratePercent: 10,
    currency: "AUD",
    percentLabel: "10%",
    xeroTaxType: "OUTPUT",
    myobTaxCode: "GST",
    qboTaxRateName: "GST",
  }),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (_req: unknown, _uid: string, fn: () => Promise<unknown>) =>
    fn(),
}));
vi.mock("@prisma/client", () => ({
  // PUT /api/invoices/[id] builds its row lock with Prisma.sql.
  Prisma: { sql: () => ({}) },
  InspectionStatus: {
    SUBMITTED: "SUBMITTED",
    IN_BILLING: "IN_BILLING",
  },
  ClaimState: {
    CLOSEOUT: "CLOSEOUT",
    INVOICE_ISSUED: "INVOICE_ISSUED",
  },
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
  txInspectionUpdateMany,
  txClaimProgressUpdateMany,
  writeLifecycleTransition,
  onNextAction,
  canTransition,
  invoiceFindUnique,
  txInvoiceUpdate,
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
  txInspectionUpdateMany: vi.fn(),
  txClaimProgressUpdateMany: vi.fn(),
  writeLifecycleTransition: vi.fn(),
  onNextAction: vi.fn(),
  canTransition: vi.fn(),
  invoiceFindUnique: vi.fn(),
  txInvoiceUpdate: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({ recordMutationAudit: vi.fn() }));

vi.mock("@/lib/lifecycle/inspection-state-machine", () => ({
  canTransition: (...args: unknown[]) => canTransition(...args),
}));
vi.mock("@/lib/audit/lifecycle-event", () => ({
  writeLifecycleTransition: (...args: unknown[]) =>
    writeLifecycleTransition(...args),
}));
vi.mock("@/lib/lifecycle/subscribers/next-action", () => ({
  onNextAction: (...args: unknown[]) => onNextAction(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: inspectionFindFirst },
    estimate: { findFirst: estimateFindFirst },
    invoice: { findFirst: invoiceFindFirst, findUnique: invoiceFindUnique },
    client: { findFirst: clientFindFirst },
    invoiceSequence: { upsert: vi.fn() },
    $transaction,
  },
}));

import { getServerSession } from "next-auth";
import { GET, POST } from "../route";
import { PUT as PUT_INVOICE } from "@/app/api/invoices/[id]/route";
import { dollarsToCents, lineSubtotalCents } from "@/lib/invoices/calc";

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
  txInspectionUpdateMany.mockResolvedValue({ count: 1 });
  txClaimProgressUpdateMany.mockResolvedValue({ count: 1 });
  writeLifecycleTransition.mockResolvedValue({
    id: "transition_1",
    auditLogId: "audit_1",
  });
  onNextAction.mockResolvedValue(undefined);
  canTransition.mockReturnValue({ ok: true, softGaps: [] });
  $transaction.mockImplementation(async (cb: any) =>
    cb({
      invoiceSequence: { upsert: txSequenceUpsert },
      $queryRaw: vi.fn().mockResolvedValue([]),
      invoiceLineItem: { deleteMany: vi.fn() },
      invoice: {
        findFirst: txInvoiceFindFirst,
        create: txInvoiceCreate,
        update: txInvoiceUpdate,
      },
      estimate: { updateMany: txEstimateUpdateMany },
      inspection: { updateMany: txInspectionUpdateMany },
      invoiceAuditLog: { create: txAuditCreate },
      auditLog: { create: txInspectionAuditCreate },
      claimProgress: { updateMany: txClaimProgressUpdateMany },
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
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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
      status: "IN_BILLING",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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

  it("RA-7705: a stored float subtotal 0.69 x 22.5 = 15.524999999999999 invoices as 1553c, not 1552c", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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
      id: "estimate_float",
      version: 1,
      overheads: 0,
      profit: 0,
      contingency: 0,
      escalation: 0,
      totalIncGST: null,
      lineItems: [
        {
          id: "line_float",
          code: null,
          category: "Labour",
          description: "Labour",
          qty: 0.69,
          unit: "hr",
          rate: 22.5,
          // As the estimates route stores it: item.qty * item.rate.
          subtotal: 0.69 * 22.5,
          isPassThrough: false,
          taxType: "OUTPUT",
          xeroAccountCode: null,
        },
      ],
    });
    txInvoiceCreate.mockImplementation(async ({ data }: any) => ({
      id: "inv_float",
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
    expect(data.lineItems.create[0]).toMatchObject({
      unitPrice: 2_250,
      subtotal: 1_553,
      gstAmount: 155,
      total: 1_708,
    });
    expect(data.subtotalExGST).toBe(1_553);
    expect(data.totalIncGST).toBe(1_708);
  });

  // RA-7705: generate an invoice from one approved estimate line.
  async function generateFromEstimateLine(line: {
    description: string;
    qty: number;
    unit: string;
    rate: number;
    subtotal: number;
  }) {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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
      id: "estimate_line",
      version: 1,
      overheads: 0,
      profit: 0,
      contingency: 0,
      escalation: 0,
      totalIncGST: null,
      lineItems: [
        {
          id: "line_1",
          code: null,
          category: "Equipment",
          isPassThrough: false,
          taxType: "OUTPUT",
          xeroAccountCode: null,
          ...line,
        },
      ],
    });
    txInvoiceCreate.mockImplementation(async ({ data }: any) => ({
      id: "inv_line",
      invoiceNumber: "RA-2026-0001",
      totalIncGST: data.totalIncGST,
      lineItems: [{ id: "li1" }],
    }));

    const res = await POST(
      new NextRequest("http://localhost/api/x", { method: "POST" }),
      { params: Promise.resolve({ id: "insp_1" }) },
    );
    expect(res.status).toBe(201);
    return txInvoiceCreate.mock.calls[0][0].data;
  }

  // RA-7705: save the generated invoice unchanged through PUT
  // /api/invoices/[id], exactly as the edit page sends it (unit price loaded
  // as dollars, sent back through dollarsToCents).
  async function resaveUnchanged(created: any) {
    invoiceFindUnique.mockResolvedValue({
      id: "inv_line",
      userId: "u_1",
      status: "DRAFT",
      currency: "AUD",
      invoiceNumber: created.invoiceNumber,
      subtotalExGST: created.subtotalExGST,
    });
    txInvoiceUpdate.mockImplementation(async (arg: any) => ({
      id: "inv_line",
      ...arg.data,
      lineItems: [],
    }));
    const res = await PUT_INVOICE(
      new NextRequest("http://localhost/api/invoices/inv_line", {
        method: "PUT",
        body: JSON.stringify({
          lineItems: created.lineItems.create.map((li: any) => ({
            description: li.description,
            category: li.category,
            quantity: li.quantity,
            unitPrice: dollarsToCents(li.unitPrice / 100),
            gstRate: li.gstRate,
            estimateLineItemId: li.estimateLineItemId,
          })),
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "inv_line" }) },
    );
    expect(res.status).toBe(200);
    return txInvoiceUpdate.mock.calls[0][0].data;
  }

  const expectLinesConsistent = (lines: any[]) => {
    for (const li of lines) {
      expect(lineSubtotalCents(li.quantity, li.unitPrice)).toBe(li.subtotal);
    }
  };

  const weeklyLine = {
    description: "Air movers, 2 weeks",
    qty: 10,
    unit: "day",
    rate: 25,
    // Weekly pricing: 2 x $112.505, not 10 x $25.
    subtotal: 225.01,
  };
  const subCentRateLine = {
    description: "Labour",
    qty: 50,
    unit: "hr",
    rate: 65.005,
    // As the estimates route stores it: 50 * 65.005 === 3250.25 in float.
    subtotal: 50 * 65.005,
  };
  const floatNoiseLine = {
    description: "Labour",
    qty: 0.69,
    unit: "hr",
    rate: 22.5,
    subtotal: 0.69 * 22.5,
  };

  it("RA-7705 case A: a weekly-priced line invoices the approved $225.01 as one unit, so qty x unit price equals the subtotal", async () => {
    const data = await generateFromEstimateLine(weeklyLine);

    expect(data.lineItems.create[0]).toMatchObject({
      description: "Air movers, 2 weeks (10 day x $25)",
      quantity: 1,
      unit: "item",
      unitPrice: 22_501,
      subtotal: 22_501,
      gstAmount: 2_250,
      total: 24_751,
    });
    expectLinesConsistent(data.lineItems.create);
    expect(data.subtotalExGST).toBe(22_501);
    expect(data.totalIncGST).toBe(24_751);
  });

  it("RA-7705 case B: a $65.005 rate does not reprice the approved $3,250.25 to $3,250.50", async () => {
    // Guard the premise: float equality cannot tell this line apart from a
    // plain qty x rate line.
    expect(subCentRateLine.subtotal).toBe(3250.25);

    const data = await generateFromEstimateLine(subCentRateLine);

    expect(data.lineItems.create[0]).toMatchObject({
      description: "Labour (50 hr x $65.005)",
      quantity: 1,
      unitPrice: 325_025,
      subtotal: 325_025,
      gstAmount: 32_503,
      total: 357_528,
    });
    expectLinesConsistent(data.lineItems.create);
    expect(data.subtotalExGST).toBe(325_025);
    expect(data.totalIncGST).toBe(357_528);
  });

  it("RA-7705: a line whose qty x whole-cent rate already equals the approved cents keeps its qty and rate", async () => {
    const data = await generateFromEstimateLine(floatNoiseLine);

    expect(data.lineItems.create[0]).toMatchObject({
      description: "Labour",
      quantity: 0.69,
      unit: "hr",
      unitPrice: 2_250,
      subtotal: 1_553,
    });
  });

  it.each([
    ["weekly pricing", weeklyLine],
    ["sub-cent rate", subCentRateLine],
    ["float-noise subtotal", floatNoiseLine],
  ])(
    "RA-7705: an unchanged re-save through PUT /api/invoices/[id] keeps every line and total (%s)",
    async (_name, line) => {
      const created = await generateFromEstimateLine(line);
      const saved = await resaveUnchanged(created);

      expect(saved.subtotalExGST).toBe(created.subtotalExGST);
      expect(saved.gstAmount).toBe(created.gstAmount);
      expect(saved.totalIncGST).toBe(created.totalIncGST);
      expect(
        saved.lineItems.create.map((li: any) => [li.subtotal, li.gstAmount, li.total]),
      ).toEqual(
        created.lineItems.create.map((li: any) => [li.subtotal, li.gstAmount, li.total]),
      );
    },
  );

  it("rejects a report client outside the inspection tenant", async () => {
    inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
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
