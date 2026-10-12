/**
 * RA-871: Unit tests for Xero webhook-processor + signature verification.
 *
 * Covers: signature verification (timing-safe, malformed inputs),
 * batch processing (invoice.updated, invoice.paid, payment.created),
 * idempotency, error handling, unrecognised event skip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }), // atomic claim: always succeeds in tests
      update: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    integration: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/sync-queue", () => ({
  queueInvoiceSync: vi.fn(),
}));

vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: vi
    .fn()
    .mockResolvedValue({ ok: true, data: "test-token" }),
}));

import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
import { prisma } from "@/lib/prisma";
import { queueInvoiceSync } from "@/lib/integrations/sync-queue";
import {
  processXeroWebhookBatch,
  verifyXeroWebhookSignature,
} from "../webhook-processor";

const mockFindManyEvents = prisma.webhookEvent.findMany as ReturnType<
  typeof vi.fn
>;
const mockUpdateEvent = prisma.webhookEvent.update as ReturnType<typeof vi.fn>;
const mockFindFirstInvoice = prisma.invoice.findFirst as ReturnType<
  typeof vi.fn
>;
const mockUpdateInvoice = prisma.invoice.update as ReturnType<typeof vi.fn>;
const mockFindUniqueIntegration = prisma.integration.findUnique as ReturnType<
  typeof vi.fn
>;
const mockQueueInvoiceSync = queueInvoiceSync as ReturnType<typeof vi.fn>;

const binding = {
  id: "integ-1", userId: "u-1", workspaceId: "workspace-1", provider: "XERO",
  name: "Custom bookkeeping connection", icon: null, tenantId: "tenant-abc", status: "CONNECTED",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(global, "fetch").mockRejectedValue(new Error("External network prohibited in synthetic webhook tests"));
  mockFindUniqueIntegration.mockResolvedValue(binding);
  vi.mocked(prisma.webhookEvent.updateMany).mockResolvedValue({ count: 1 });
});
afterEach(() => { vi.restoreAllMocks(); });

// ─── Signature verification ───────────────────────────────────────────────────

describe("verifyXeroWebhookSignature", () => {
  const KEY = "test-webhook-key-12345";
  const body = '{"events":[]}';
  const validSig = createHmac("sha256", KEY).update(body).digest("base64");

  it("returns true for a valid signature", () => {
    expect(verifyXeroWebhookSignature(body, validSig, KEY)).toBe(true);
  });

  it("returns false for a wrong signature", () => {
    const wrong = createHmac("sha256", "different-key")
      .update(body)
      .digest("base64");
    expect(verifyXeroWebhookSignature(body, wrong, KEY)).toBe(false);
  });

  it("returns false when body is tampered", () => {
    expect(
      verifyXeroWebhookSignature(
        '{"events":[{"tampered":true}]}',
        validSig,
        KEY,
      ),
    ).toBe(false);
  });

  it("returns false when header missing", () => {
    expect(verifyXeroWebhookSignature(body, null, KEY)).toBe(false);
    expect(verifyXeroWebhookSignature(body, undefined, KEY)).toBe(false);
    expect(verifyXeroWebhookSignature(body, "", KEY)).toBe(false);
  });

  it("returns false when webhook key missing", () => {
    expect(verifyXeroWebhookSignature(body, validSig, null)).toBe(false);
    expect(verifyXeroWebhookSignature(body, validSig, undefined)).toBe(false);
    expect(verifyXeroWebhookSignature(body, validSig, "")).toBe(false);
  });

  it("returns false for malformed base64 signature (no throw)", () => {
    expect(verifyXeroWebhookSignature(body, "!!!not-base64!!!", KEY)).toBe(
      false,
    );
  });

  it("returns false when signature length differs from expected", () => {
    expect(verifyXeroWebhookSignature(body, "YWJj", KEY)).toBe(false); // 3-byte sig
  });
});

// ─── processXeroWebhookBatch — invoice.updated ────────────────────────────────

describe("processXeroWebhookBatch — invoice.updated", () => {
  it("re-queues the invoice for sync and marks event COMPLETED", async () => {
    mockFindManyEvents.mockResolvedValue([
      {
        id: "evt-1",
        provider: "XERO",
        status: "PENDING",
        eventType: "invoice.updated",
        integrationId: "integ-1",
        payload: { tenantId: "tenant-abc", resourceId: "xero-inv-123", resourceType: "INVOICE" },
        integration: { id: "integ-1" },
      },
    ]);
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-inv-1",
      userId: "u-1",
    });
    mockQueueInvoiceSync.mockResolvedValue(undefined);

    const result = await processXeroWebhookBatch(10);

    expect(result).toEqual({ processed: 1, failed: 0, skipped: 0 });
    expect(mockQueueInvoiceSync).toHaveBeenCalledWith(
      "local-inv-1",
      "XERO",
      "NORMAL",
    );
    // Event went PENDING → PROCESSING → COMPLETED
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("skips unknown Xero invoice IDs gracefully (no failure)", async () => {
    mockFindManyEvents.mockResolvedValue([
      {
        id: "evt-x",
        provider: "XERO",
        status: "PENDING",
        eventType: "invoice.updated",
        integrationId: "integ-1",
        payload: { tenantId: "tenant-abc", resourceId: "xero-unknown", resourceType: "INVOICE" },
        integration: { id: "integ-1" },
      },
    ]);
    mockFindFirstInvoice.mockResolvedValue(null);

    const result = await processXeroWebhookBatch(10);

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockQueueInvoiceSync).not.toHaveBeenCalled();
  });
});

// ─── processXeroWebhookBatch — invoice.paid ───────────────────────────────────

describe("processXeroWebhookBatch — invoice.paid", () => {
  it("marks local invoice as PAID with paidDate", async () => {
    const eventDate = "2026-04-17T10:00:00.000Z";
    mockFindManyEvents.mockResolvedValue([
      {
        id: "evt-2",
        provider: "XERO",
        status: "PENDING",
        eventType: "invoice.paid",
        integrationId: "integ-1",
        payload: { tenantId: "tenant-abc",
          resourceId: "xero-inv-paid-1",
          resourceType: "INVOICE",
          eventDateUtc: eventDate,
        },
        integration: { id: "integ-1" },
      },
    ]);
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-inv-2",
      status: "SENT",
      totalIncGST: 110000, // $1,100 inc GST (cents)
    });

    const result = await processXeroWebhookBatch(10);

    expect(result.processed).toBe(1);
    expect(mockUpdateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "local-inv-2", userId: "u-1", workspaceId: "workspace-1", externalSyncProvider: { in: ["XERO", "xero"] } }),
        data: expect.objectContaining({
          status: "PAID",
          amountPaid: 110000,
          amountDue: 0,
        }),
      }),
    );
  });

  it("is idempotent — skips invoice already marked PAID", async () => {
    mockFindManyEvents.mockResolvedValue([
      {
        id: "evt-3",
        provider: "XERO",
        status: "PENDING",
        eventType: "invoice.paid",
        integrationId: "integ-1",
        payload: { tenantId: "tenant-abc", resourceId: "xero-inv-3", resourceType: "INVOICE" },
        integration: { id: "integ-1" },
      },
    ]);
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-inv-3",
      status: "PAID", // already paid
    });

    const result = await processXeroWebhookBatch(10);

    expect(result.processed).toBe(1);
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });
});

// ─── payment.created — RA-1277: flip Invoice.status to PAID ──────────────────

describe("processXeroWebhookBatch — payment.created", () => {
  it("resolves PaymentID → InvoiceID via Xero API and marks invoice PAID", async () => {
    const eventDate = "2026-04-18T09:00:00.000Z";
    mockFindManyEvents.mockResolvedValue([
      {
        id: "evt-pc-1",
        provider: "XERO",
        status: "PENDING",
        eventType: "payment.created",
        integrationId: "integ-1",
        payload: { tenantId: "tenant-abc",
          resourceId: "xero-payment-abc",
          resourceType: "PAYMENT",
          eventDateUtc: eventDate,
        },
        integration: { id: "integ-1" },
      },
    ]);
    mockFindUniqueIntegration.mockResolvedValue(binding);
    mockFindFirstInvoice.mockResolvedValue({
      id: "local-inv-pc-1",
      status: "SENT",
      totalIncGST: 110000, // $1,100 inc GST (cents)
    });

    // Mock the fetch call to Xero Payments API — full payment (AmountDue: 0)
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Payments: [
            {
              Amount: 1100,
              Invoice: { InvoiceID: "xero-inv-pc-1", AmountDue: 0 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await processXeroWebhookBatch(10);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api.xro/2.0/Payments/xero-payment-abc"),
      expect.any(Object),
    );
    expect(result.processed).toBe(1);
    expect(mockUpdateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "local-inv-pc-1", userId: "u-1", workspaceId: "workspace-1", externalSyncProvider: { in: ["XERO", "xero"] } }),
        data: expect.objectContaining({
          status: "PAID",
          amountPaid: 110000,
          amountDue: 0,
        }),
      }),
    );

    fetchSpy.mockRestore();
  });

  it("skips gracefully when PaymentID has no linked invoice", async () => {
    mockFindManyEvents.mockResolvedValue([
      {
        id: "evt-pc-2",
        provider: "XERO",
        status: "PENDING",
        eventType: "payment.created",
        integrationId: "integ-1",
        payload: { tenantId: "tenant-abc",
          resourceId: "xero-payment-standalone",
          resourceType: "PAYMENT",
        },
        integration: { id: "integ-1" },
      },
    ]);
    mockFindUniqueIntegration.mockResolvedValue(binding);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Payments: [
            {
              /* no Invoice */
            },
          ],
        }),
        {
          status: 200,
        },
      ),
    );

    const result = await processXeroWebhookBatch(10);

    expect(result.processed).toBe(1);
    expect(mockUpdateInvoice).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

// ─── Unrecognised + error handling ────────────────────────────────────────────

describe("processXeroWebhookBatch — edge cases", () => {
  it("marks unrecognised event types SKIPPED (no retry)", async () => {
    mockFindManyEvents.mockResolvedValue([
      {
        id: "evt-4",
        provider: "XERO",
        status: "PENDING",
        eventType: "contact.updated",
        integrationId: "integ-1",
        payload: { tenantId: "tenant-abc", resourceId: "xero-contact-1", resourceType: "CONTACT" },
        integration: { id: "integ-1" },
      },
    ]);

    const result = await processXeroWebhookBatch(10);

    expect(result).toEqual({ processed: 0, failed: 0, skipped: 1 });
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-4" },
        data: expect.objectContaining({ status: "SKIPPED" }),
      }),
    );
  });

  it("marks event FAILED with error message when handler throws", async () => {
    mockFindManyEvents.mockResolvedValue([
      {
        id: "evt-5",
        provider: "XERO",
        status: "PENDING",
        eventType: "invoice.updated",
        integrationId: "integ-1",
        payload: { tenantId: "tenant-abc", resourceId: null, resourceType: "INVOICE" }, // missing resourceId
        integration: { id: "integ-1" },
      },
    ]);

    const result = await processXeroWebhookBatch(10);

    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0 });
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-5" },
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("resourceId"),
        }),
      }),
    );
  });

  it("respects maxEvents parameter", async () => {
    mockFindManyEvents.mockResolvedValue([]);
    await processXeroWebhookBatch(25);
    expect(mockFindManyEvents).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
  });

  it("defaults maxEvents to 50", async () => {
    mockFindManyEvents.mockResolvedValue([]);
    await processXeroWebhookBatch();
    expect(mockFindManyEvents).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("returns zero counts when no pending events", async () => {
    mockFindManyEvents.mockResolvedValue([]);
    const result = await processXeroWebhookBatch();
    expect(result).toEqual({ processed: 0, failed: 0, skipped: 0 });
  });
});


function pendingEvent(eventType = "invoice.paid", overrides: Record<string, unknown> = {}) {
  return { id: "scoped-event", provider: "XERO", status: "PENDING", eventType,
    integrationId: "integ-1", integration: binding,
    payload: { tenantId: "tenant-abc", resourceId: "shared-id", resourceType: eventType === "payment.created" ? "PAYMENT" : "INVOICE" },
    ...overrides };
}

describe("Xero webhook dispatch isolation", () => {
  it.each([
    null,
    { ...binding, tenantId: "other-tenant" },
    { ...binding, tenantId: null },
    { ...binding, status: "DISCONNECTED" },
    { ...binding, provider: "QUICKBOOKS" },
    { ...binding, provider: "ASCORA" },
    { ...binding, name: "OpenAI GPT", icon: "[ra:ai]" },
    { ...binding, name: "Anthropic Claude", icon: null },
  ])("rejects a stale/invalid integration before credentials, fetch or invoice writes: %j", async (currentBinding) => {
    // The included relation deliberately still looks valid: dispatch must re-read.
    mockFindManyEvents.mockResolvedValue([pendingEvent("payment.created")]);
    mockFindUniqueIntegration.mockResolvedValue(currentBinding);
    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(new Error("unexpected provider call"));
    expect(await processXeroWebhookBatch()).toEqual({ processed: 0, failed: 1, skipped: 0 });
    expect(getValidXeroAccessToken).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockFindFirstInvoice).not.toHaveBeenCalled();
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
    expect(mockQueueInvoiceSync).not.toHaveBeenCalled();
  });

  it.each([null, {}, { resourceId: "shared-id", resourceType: "INVOICE" }, { tenantId: 42 }])("fails closed for malformed queued payload %j", async payload => {
    mockFindManyEvents.mockResolvedValue([pendingEvent("invoice.updated", { payload })]);
    expect(await processXeroWebhookBatch()).toEqual({ processed: 0, failed: 1, skipped: 0 });
    expect(mockFindFirstInvoice).not.toHaveBeenCalled();
    expect(mockQueueInvoiceSync).not.toHaveBeenCalled();
  });

  it.each(["invoice.updated", "invoice.paid", "payment.created"])("isolates %s when external IDs overlap between owners/workspaces/providers", async eventType => {
    mockFindManyEvents.mockResolvedValue([pendingEvent(eventType)]);
    // A realistic query-dependent fake: an unscoped lookup picks the other owner's row.
    const candidates = [
      { id: "foreign-owner", userId: "u-2", workspaceId: "workspace-1", externalSyncProvider: "XERO", externalInvoiceId: "shared-id" },
      { id: "foreign-workspace", userId: "u-1", workspaceId: "workspace-2", externalSyncProvider: "XERO", externalInvoiceId: "shared-id" },
      { id: "foreign-provider", userId: "u-1", workspaceId: "workspace-1", externalSyncProvider: "QUICKBOOKS", externalInvoiceId: "shared-id" },
      { id: "correct-invoice", userId: "u-1", workspaceId: "workspace-1", externalSyncProvider: "XERO", externalInvoiceId: "shared-id" },
    ];
    mockFindFirstInvoice.mockImplementation(({ where }) => candidates.find(candidate => Object.entries(where).every(([key, value]) => (typeof value === "object" && value !== null && "in" in value ? (value.in as string[]).includes(candidate[key as keyof typeof candidate]) : candidate[key as keyof typeof candidate] === value))) ?? null);
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ Payments: [{ Invoice: { InvoiceID: "shared-id", AmountDue: 0 } }] }), { status: 200 }));
    expect(await processXeroWebhookBatch()).toEqual({ processed: 1, failed: 0, skipped: 0 });
    expect(mockFindFirstInvoice).toHaveBeenCalledWith(expect.objectContaining({ where: { externalInvoiceId: "shared-id", externalSyncProvider: { in: ["XERO", "xero"] }, userId: "u-1", workspaceId: "workspace-1" } }));
    if (eventType === "invoice.updated") {
      expect(mockQueueInvoiceSync).toHaveBeenCalledWith("correct-invoice", "XERO", "NORMAL");
    } else {
      expect(mockUpdateInvoice).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "correct-invoice" }) }));
    }
  });

  it("includes explicit workspaceId null for personal invoices", async () => {
    mockFindManyEvents.mockResolvedValue([pendingEvent("invoice.updated")]);
    mockFindUniqueIntegration.mockResolvedValue({ ...binding, workspaceId: null });
    mockFindFirstInvoice.mockResolvedValue(null);
    await processXeroWebhookBatch();
    expect(mockFindFirstInvoice).toHaveBeenCalledWith(expect.objectContaining({ where: { externalInvoiceId: "shared-id", externalSyncProvider: { in: ["XERO", "xero"] }, userId: "u-1", workspaceId: null } }));
  });

  it("does not dispatch an event already claimed by another worker", async () => {
    mockFindManyEvents.mockResolvedValue([pendingEvent()]);
    vi.mocked(prisma.webhookEvent.updateMany).mockResolvedValue({ count: 0 });
    expect(await processXeroWebhookBatch()).toEqual({ processed: 0, failed: 0, skipped: 1 });
    expect(mockFindUniqueIntegration).not.toHaveBeenCalled();
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });
});


describe("Xero webhook legacy identity compatibility", () => {
  it("rejects config-only AI evidence before provider credentials are read", async () => {
    mockFindManyEvents.mockResolvedValue([pendingEvent("payment.created")]);
    const row = { ...binding, config: JSON.stringify({ apiKeyType: "OPENAI" }) };
    mockFindUniqueIntegration.mockImplementation(({ select }) => Object.fromEntries(Object.keys(select).map(key => [key, row[key as keyof typeof row]])));
    expect(await processXeroWebhookBatch()).toEqual({ processed: 0, failed: 1, skipped: 0 });
    expect(getValidXeroAccessToken).not.toHaveBeenCalled();
    expect(mockUpdateInvoice).not.toHaveBeenCalled();
  });

  it("accepts an explicitly legacy lowercase xero invoice without loosening owner/workspace scope", async () => {
    mockFindManyEvents.mockResolvedValue([pendingEvent()]);
    mockFindFirstInvoice.mockImplementation(({ where }) =>
      where.externalSyncProvider?.in?.includes("xero") && where.userId === "u-1" && where.workspaceId === "workspace-1"
        ? { id: "legacy-invoice", status: "SENT", totalIncGST: 10000 } : null);
    expect(await processXeroWebhookBatch()).toEqual({ processed: 1, failed: 0, skipped: 0 });
    expect(mockUpdateInvoice).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "legacy-invoice", externalInvoiceId: "shared-id", externalSyncProvider: { in: ["XERO", "xero"] }, userId: "u-1", workspaceId: "workspace-1",
    } }));
  });
});
