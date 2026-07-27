import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const harness = vi.hoisted(() => {
  type Variation = Record<string, unknown> & {
    id: string;
    invoiceNumber: string;
  };
  type State = {
    nextNumber: number;
    variations: Variation[];
    audits: unknown[];
  };

  let state: State = { nextNumber: 1, variations: [], audits: [] };
  let auditAttempts = 0;
  const responseCache = new Map<string, { status: number; body: string }>();

  const defaultOriginalInvoice = {
    id: "invoice-original",
    invoiceNumber: "RA-2026-0042",
    originalInvoiceId: null,
    customerName: "Acme Restoration",
    customerEmail: "accounts@example.com",
    customerPhone: null,
    customerAddress: null,
    customerABN: null,
    reportId: null,
    estimateId: null,
    clientId: null,
    contactId: null,
    companyId: null,
    templateId: null,
    terms: "Due in 30 days",
    footer: null,
    lineItems: [{ id: "line-original", gstRate: 10 }],
  };
  let originalInvoice: typeof defaultOriginalInvoice | null = {
    ...defaultOriginalInvoice,
  };

  const cloneState = (): State => ({
    nextNumber: state.nextNumber,
    variations: state.variations.map((variation) => ({ ...variation })),
    audits: [...state.audits],
  });

  const sequenceUpsert = async (target: State) => {
    const allocated = target.nextNumber;
    target.nextNumber += 1;
    return { id: "sequence-1", prefix: "RA", lastNumber: allocated };
  };

  const invoiceCreate = async (
    target: State,
    args: {
      data: {
        invoiceNumber: string;
        lineItems?: { create?: unknown[] };
        [key: string]: unknown;
      };
    },
  ) => {
    const variation = {
      id: `variation-${target.variations.length + 1}`,
      ...args.data,
      invoiceNumber: args.data.invoiceNumber,
      lineItems: args.data.lineItems?.create ?? [],
    };
    target.variations.push(variation);
    return variation;
  };

  const auditCreate = async (target: State, args: unknown) => {
    auditAttempts += 1;
    if (auditAttempts === 1) {
      throw new Error("forced audit failure");
    }
    target.audits.push(args);
    return args;
  };

  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    const draft = cloneState();
    const result = await callback({
      invoiceSequence: { upsert: (_args: unknown) => sequenceUpsert(draft) },
      invoice: {
        create: (args: Parameters<typeof invoiceCreate>[1]) =>
          invoiceCreate(draft, args),
      },
      invoiceAuditLog: {
        create: (args: unknown) => auditCreate(draft, args),
      },
    });
    state = draft;
    return result;
  });

  const prisma = {
    invoice: {
      findUnique: vi.fn(async () => originalInvoice),
      create: vi.fn((args: Parameters<typeof invoiceCreate>[1]) =>
        invoiceCreate(state, args),
      ),
    },
    invoiceSequence: {
      upsert: vi.fn(() => sequenceUpsert(state)),
    },
    invoiceAuditLog: {
      create: vi.fn((args: unknown) => auditCreate(state, args)),
    },
    $transaction: transaction,
  };

  return {
    prisma,
    transaction,
    responseCache,
    reset() {
      state = { nextNumber: 1, variations: [], audits: [] };
      auditAttempts = 0;
      originalInvoice = { ...defaultOriginalInvoice };
      responseCache.clear();
      transaction.mockClear();
      prisma.invoice.findUnique.mockClear();
      prisma.invoice.create.mockClear();
      prisma.invoiceSequence.upsert.mockClear();
      prisma.invoiceAuditLog.create.mockClear();
    },
    snapshot() {
      return cloneState();
    },
    allowAudits() {
      auditAttempts = 1;
    },
    setOriginalInvoice(value: typeof originalInvoice) {
      originalInvoice = value;
    },
    setParentGstRate(gstRate: number) {
      originalInvoice = {
        ...defaultOriginalInvoice,
        lineItems: [{ id: "line-original", gstRate }],
      };
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: harness.prisma }));
vi.mock("@/lib/api-errors", () => ({
  apiError: (
    _request: NextRequest,
    input: { code: string; message: string; status: number },
  ) =>
    NextResponse.json(
      { error: { code: input.code, message: input.message } },
      { status: input.status },
    ),
  fromException: () =>
    NextResponse.json(
      { error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 },
    ),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      request: NextRequest,
      userId: string,
      handler: (rawBody: string) => Promise<Response>,
    ) => {
      const body = await request.text();
      const key = `${userId}:${request.headers.get("idempotency-key") ?? ""}:${body}`;
      const cached = harness.responseCache.get(key);
      if (cached) {
        return new NextResponse(cached.body, { status: cached.status });
      }

      const response = await handler(body);
      if (response.status < 500) {
        harness.responseCache.set(key, {
          status: response.status,
          body: await response.clone().text(),
        });
      }
      return response;
    },
  ),
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const params = Promise.resolve({ id: "invoice-original" });
const body = {
  lineItems: [
    {
      description: "Additional drying labour",
      quantity: 1,
      unitPrice: 100,
      gstRate: 10,
    },
  ],
};

function makeRequest(requestBody: unknown = body) {
  return new NextRequest(
    "http://localhost/api/invoices/invoice-original/variations",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "variation-retry-001",
      },
      body:
        typeof requestBody === "string"
          ? requestBody
          : JSON.stringify(requestBody),
    },
  );
}

describe("POST /api/invoices/[id]/variations transaction and retry", () => {
  beforeEach(() => {
    harness.reset();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rolls back an audit failure, then retries once without consuming a duplicate number", async () => {
    const failed = await POST(makeRequest(), { params });

    expect(failed.status).toBe(500);
    expect(harness.snapshot()).toEqual({
      nextNumber: 1,
      variations: [],
      audits: [],
    });

    const retried = await POST(makeRequest(), { params });
    const replayed = await POST(makeRequest(), { params });
    const snapshot = harness.snapshot();

    expect(retried.status).toBe(201);
    expect(replayed.status).toBe(201);
    expect(snapshot.nextNumber).toBe(2);
    expect(snapshot.variations).toHaveLength(1);
    expect(snapshot.variations[0].invoiceNumber).toMatch(/-0001-V$/u);
    expect(snapshot.audits).toHaveLength(2);
    expect(harness.transaction).toHaveBeenCalledTimes(2);
  });

  it("creates one variation and both custody logs on the success path", async () => {
    harness.allowAudits();

    const response = await POST(makeRequest(), { params });

    expect(response.status).toBe(201);
    expect(harness.snapshot().variations).toHaveLength(1);
    expect(harness.snapshot().audits).toHaveLength(2);
  });

  it("rejects malformed JSON without allocating an invoice number", async () => {
    const response = await POST(makeRequest("{"), { params });

    expect(response.status).toBe(400);
    expect(harness.snapshot()).toEqual({
      nextNumber: 1,
      variations: [],
      audits: [],
    });
  });

  it("returns ownership-scoped 404 without allocating an invoice number", async () => {
    harness.setOriginalInvoice(null);

    const response = await POST(makeRequest(), { params });

    expect(response.status).toBe(404);
    expect(harness.snapshot().nextNumber).toBe(1);
    expect(harness.snapshot().variations).toHaveLength(0);
  });

  it("inherits a GST-free parent and keeps header totals equal to its lines", async () => {
    harness.allowAudits();
    harness.setParentGstRate(0);

    const response = await POST(
      makeRequest({
        lineItems: [
          {
            description: "GST-free labour",
            quantity: 1,
            unitPrice: 100,
          },
        ],
      }),
      { params },
    );
    const [variation] = harness.snapshot().variations;
    const [line] = variation.lineItems as Array<Record<string, number>>;

    expect(response.status).toBe(201);
    expect(variation.subtotalExGST).toBe(10_000);
    expect(variation.gstAmount).toBe(0);
    expect(variation.totalIncGST).toBe(10_000);
    expect(line.gstRate).toBe(0);
    expect(line.total).toBe(10_000);
    expect(variation.totalIncGST).toBe(line.total);
  });
});
