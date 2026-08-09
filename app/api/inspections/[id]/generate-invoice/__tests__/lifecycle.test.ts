import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  inspectionFindFirst: vi.fn(),
  invoiceFindFirst: vi.fn(),
  estimateFindFirst: vi.fn(),
  transaction: vi.fn(),
  txInvoiceFindFirst: vi.fn(),
  txInvoiceCreate: vi.fn(),
  txEstimateUpdateMany: vi.fn(),
  txInspectionUpdateMany: vi.fn(),
  txInspectionFindFirst: vi.fn(),
  txSequenceUpsert: vi.fn(),
  txInvoiceAuditCreate: vi.fn(),
  txAuditCreate: vi.fn(),
  txClaimProgressUpdateMany: vi.fn(),
  canTransition: vi.fn(),
  writeLifecycleTransition: vi.fn(),
  onNextAction: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@prisma/client", () => ({
  InspectionStatus: {
    SUBMITTED: "SUBMITTED",
    IN_BILLING: "IN_BILLING",
  },
  ClaimState: {
    CLOSEOUT: "CLOSEOUT",
    INVOICE_ISSUED: "INVOICE_ISSUED",
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    _request: NextRequest,
    _userId: string,
    fn: () => Promise<Response>,
  ) => fn(),
}));
vi.mock("@/lib/lifecycle/inspection-state-machine", () => ({
  canTransition: (...args: unknown[]) => mocks.canTransition(...args),
}));
vi.mock("@/lib/audit/lifecycle-event", () => ({
  writeLifecycleTransition: (...args: unknown[]) =>
    mocks.writeLifecycleTransition(...args),
}));
vi.mock("@/lib/lifecycle/subscribers/next-action", () => ({
  onNextAction: (...args: unknown[]) => mocks.onNextAction(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: mocks.inspectionFindFirst },
    invoice: { findFirst: mocks.invoiceFindFirst },
    estimate: { findFirst: mocks.estimateFindFirst },
    invoiceSequence: { upsert: vi.fn() },
    $transaction: mocks.transaction,
  },
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const mockSession = vi.mocked(getServerSession);

describe("inspection invoice lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({
      user: { id: "u1", name: "Tech" },
    } as never);
    mocks.canTransition.mockReturnValue({ ok: true, softGaps: [] });
    mocks.invoiceFindFirst.mockResolvedValue(null);
    mocks.txInvoiceFindFirst.mockResolvedValue(null);
    mocks.txEstimateUpdateMany.mockResolvedValue({ count: 1 });
    mocks.txInspectionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.txSequenceUpsert.mockResolvedValue({ prefix: "RA", lastNumber: 1 });
    mocks.txInvoiceAuditCreate.mockResolvedValue({});
    mocks.txAuditCreate.mockResolvedValue({});
    mocks.txClaimProgressUpdateMany.mockResolvedValue({ count: 1 });
    mocks.writeLifecycleTransition.mockResolvedValue({
      id: "transition-1",
      auditLogId: "audit-1",
    });
    mocks.onNextAction.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          invoice: {
            findFirst: mocks.txInvoiceFindFirst,
            create: mocks.txInvoiceCreate,
          },
          estimate: { updateMany: mocks.txEstimateUpdateMany },
          inspection: {
            updateMany: mocks.txInspectionUpdateMany,
            findFirst: mocks.txInspectionFindFirst,
          },
          invoiceSequence: { upsert: mocks.txSequenceUpsert },
          invoiceAuditLog: { create: mocks.txInvoiceAuditCreate },
          auditLog: { create: mocks.txAuditCreate },
          claimProgress: { updateMany: mocks.txClaimProgressUpdateMany },
        }),
    );
    mocks.inspectionFindFirst.mockResolvedValue({
      id: "i1",
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
      reportId: "r1",
      inspectionNumber: "NIR-1",
      propertyAddress: "1 Test St",
      report: {
        id: "r1",
        userId: "u1",
        title: "Test report",
        propertyAddress: "1 Test St",
        clientId: "c1",
        client: {
          id: "c1",
          userId: "u1",
          name: "Test Client",
          email: "client@example.com",
          phone: null,
          address: "1 Test St",
        },
      },
    });
    mocks.estimateFindFirst.mockResolvedValue({
      id: "e1",
      version: 1,
      overheads: 0,
      profit: 0,
      contingency: 0,
      escalation: 0,
      totalIncGST: 110,
      lineItems: [
        {
          id: "el1",
          code: null,
          category: "Drying",
          description: "Air mover",
          qty: 1,
          unit: "item",
          rate: 100,
          subtotal: 100,
          isPassThrough: false,
          taxType: "OUTPUT",
          xeroAccountCode: null,
        },
      ],
    });
    mocks.txInvoiceCreate.mockResolvedValue({
      id: "inv1",
      invoiceNumber: "RA-2026-0001",
      totalIncGST: 11_000,
      lineItems: [{ id: "li1" }],
    });
  });

  it("creates the invoice and atomically advances signed SUBMITTED work to IN_BILLING", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/inspections/i1/generate-invoice", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.canTransition).toHaveBeenCalledWith(
      "SUBMITTED",
      "IN_BILLING",
      expect.any(Object),
    );
    expect(mocks.txInspectionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "i1",
        userId: "u1",
        status: "SUBMITTED",
        signedAt: { not: null },
      },
      data: { status: "IN_BILLING" },
    });
    expect(mocks.txInvoiceCreate).toHaveBeenCalledOnce();
    expect(mocks.writeLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionId: "i1",
        transitionKey: "issue_invoice",
        fromState: "CLOSEOUT",
        toState: "INVOICE_ISSUED",
      }),
    );
  });

  it("does not create an invoice when the billing compare-and-set loses a race", async () => {
    mocks.txInspectionUpdateMany.mockResolvedValue({ count: 0 });
    mocks.txInspectionFindFirst.mockResolvedValue({
      status: "SUBMITTED",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
    });

    const response = await POST(
      new NextRequest("http://localhost/api/inspections/i1/generate-invoice", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.txInvoiceCreate).not.toHaveBeenCalled();
    expect(mocks.writeLifecycleTransition).not.toHaveBeenCalled();
  });

  it("idempotently returns an existing invoice when already in billing", async () => {
    mocks.inspectionFindFirst.mockResolvedValue({
      id: "i1",
      status: "IN_BILLING",
      signedAt: new Date("2026-08-09T00:00:00.000Z"),
      reportId: "r1",
      inspectionNumber: "NIR-1",
      propertyAddress: "1 Test St",
      report: {
        id: "r1",
        userId: "u1",
        title: "Test report",
        propertyAddress: "1 Test St",
        clientId: "c1",
        client: {
          id: "c1",
          userId: "u1",
          name: "Test Client",
          email: "client@example.com",
          phone: null,
          address: "1 Test St",
        },
      },
    });
    mocks.invoiceFindFirst.mockResolvedValue({
      id: "inv-existing",
      invoiceNumber: "RA-2026-0042",
      totalIncGST: 11_000,
      lineItems: [{ id: "li1" }],
    });

    const response = await POST(
      new NextRequest("http://localhost/api/inspections/i1/generate-invoice", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txInvoiceCreate).not.toHaveBeenCalled();
    expect(mocks.onNextAction).not.toHaveBeenCalled();
  });

  it("heals a signed SUBMITTED inspection when its invoice already exists", async () => {
    mocks.invoiceFindFirst.mockResolvedValue({
      id: "inv-existing",
      invoiceNumber: "RA-2026-0042",
      totalIncGST: 11_000,
      lineItems: [{ id: "li1" }],
    });

    const response = await POST(
      new NextRequest("http://localhost/api/inspections/i1/generate-invoice", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.txInspectionUpdateMany).toHaveBeenCalledOnce();
    expect(mocks.txInvoiceCreate).not.toHaveBeenCalled();
    expect(mocks.onNextAction).toHaveBeenCalledWith("i1", "IN_BILLING");
  });
});
