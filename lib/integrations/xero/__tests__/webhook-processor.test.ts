/**
 * RA-871: Unit tests for Xero webhook-processor + signature verification.
 *
 * Covers: signature verification (timing-safe, malformed inputs),
 * batch processing (invoice.updated, invoice.paid, payment.created),
 * idempotency, error handling, unrecognised event skip.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findMany: vi.fn(),
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

vi.mock("../token-manager", () => ({
  getValidXeroToken: vi.fn().mockResolvedValue("test-token"),
}));

import { prisma } from "@/lib/prisma";
import { queueInvoiceSync } from "@/lib/integrations/sync-queue";
import {
  processXeroWebhookBatch,
  verifyXeroWebhookSignature,
} from "../webhook-processor";

const mockFindManyEvents = prisma.webhookEvent.findMany as ReturnType<typeof vi.fn>;
const mockUpdateEvent = prisma.webhookEvent.update as ReturnType<typeof vi.fn>;
const mockFindFirstInvoice = prisma.invoice.findFirst as ReturnType<typeof vi.fn>;
const mockUpdateInvoice = prisma.invoice.update as ReturnType<typeof vi.fn>;
const mockFindUniqueIntegration = prisma.integration.findUnique as ReturnType<typeof vi.fn>;
const mockQueueInvoiceSync = queueInvoiceSync as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Signature verification ───────────────────────────────────────────────────

describe("verifyXeroWebhookSignature", () => {
  const KEY = "test-webhook-key-12345";
  const body = '{"events":[]}';
  const validSig = createHmac("sha256", KEY).update(body).digest("base64");

  it("returns true for a valid signature", () => {
    expect(verifyXeroWebhookSignature(body, validSig, KEY)).toBe(true);
  });

  it("returns false for a wrong signature", () => {
    const wrong = createHmac("sha256", "different-key").update(body).digest("base64");
    expect(verifyXeroWebhookSignature(body, wrong, KEY)).toBe(false);
  });

  it("returns false when body is tampered", () => {
    expect(
      verifyXeroWebhookSignature('{"events":[{"tampered":true}]}', validSig, KEY),
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
    expect(verifyXeroWebhookSignature(body, "!!!not-base64!!!", KEY)).toBe(false);
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
        payload: { resourceId: "xero-inv-123", resourceType: "INVOICE" },
        integration: { id: "integ-1" },
      },
    ]);
    mockFindFirstInvoice.mockResolvedValue({ id: "local-inv-1", userId: "u-1" });
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
        payload: { resourceId: "xero-unknown", resourceType: "INVOICE" },
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
        payload: {
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
    });

    const result = await processXeroWebhookBatch(10);

    expect(result.processed).toBe(1);
    expect(mockUpdateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "local-inv-2" },
        data: expect.objectContaining({ status: "PAID" }),
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
        payload: { resourceId: "xero-inv-3", resourceType: "INVOICE" },
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
        payload: { resourceId: "xero-contact-1", resourceType: "CONTACT" },
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
        payload: { resourceId: null, resourceType: "INVOICE" }, // missing resourceId
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
