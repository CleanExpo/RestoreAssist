/**
 * RA-6974 item 1 — QBO payment stubs must be marked SKIPPED, not COMPLETED.
 *
 * QuickBooks' Change Data Capture (CDC) webhook notification for a Payment
 * entity only ever carries { name, id, operation, lastUpdated } — never
 * LinkedTxn/TotalAmt. The downstream payment handler cannot resolve a real
 * settled payment from that stub and returns without recording it, but the
 * generic completion path then marks the event COMPLETED — invisible to
 * FAILED-status monitoring even though nothing was ever reconciled.
 *
 * Covers:
 *   - A Payment "Create" event is queued as SKIPPED with an errorMessage.
 *   - Other Payment operations (Update/Delete/Void) are unaffected (PENDING).
 *   - Non-payment entities (Invoice, Customer) are unaffected (PENDING).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const integrationFindFirst = vi.fn();
const integrationFindMany = vi.fn();
const webhookEventCreate = vi.fn();
const recordWebhookFailure = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: (...args: unknown[]) => integrationFindFirst(...args),
      findMany: (...args: unknown[]) => integrationFindMany(...args),
    },
    webhookEvent: {
      create: (...args: unknown[]) => webhookEventCreate(...args),
    },
  },
}));
vi.mock("@/lib/webhook-audit", () => ({
  recordWebhookFailure: (...args: unknown[]) => recordWebhookFailure(...args),
}));

import { POST } from "../route";
import { fakeFindFirst, fakeFindMany, type FakeIntegrationRow } from "@/tests/helpers/fake-integration-table";

/** A connection the readiness owner calls ready (RA-8446). */
function connection(overrides: Partial<FakeIntegrationRow> = {}): FakeIntegrationRow {
  return { id: "integration_1", userId: "owner_1", workspaceId: "workspace_1", provider: "QUICKBOOKS",
    name: "QuickBooks Online", icon: null, config: null, status: "CONNECTED", tenantId: null, realmId: "realm_1",
    companyId: null, tokenExpiresAt: null, accessToken: "ciphertext", ...overrides };
}

/** Serve findMany/findFirst from these rows, honouring the route's where. */
function useConnections(rows: FakeIntegrationRow[]) {
  integrationFindMany.mockImplementation(fakeFindMany(rows));
  integrationFindFirst.mockImplementation(fakeFindFirst(rows));
}

const TOKEN = "test-qbo-token";

function requestWithNotifications(entities: unknown[]) {
  const raw = JSON.stringify({
    eventNotifications: [
      {
        realmId: "realm_1",
        dataChangeEvent: { entities },
      },
    ],
  });
  const signature = createHmac("sha256", TOKEN).update(raw).digest("base64");
  return new NextRequest("http://localhost/api/webhooks/quickbooks", {
    method: "POST",
    body: raw,
    headers: { "intuit-signature": signature },
  });
}

beforeEach(() => {
  integrationFindFirst.mockReset();
  webhookEventCreate.mockReset();
  recordWebhookFailure.mockReset();
  process.env.QUICKBOOKS_WEBHOOK_TOKEN = TOKEN;

  integrationFindMany.mockReset();
  useConnections([connection()]);
  webhookEventCreate.mockResolvedValue({ id: "event_1" });
});

describe("POST /api/webhooks/quickbooks — unresolvable payment stub", () => {
  it("queues a Payment Create event as SKIPPED with an errorMessage, not PENDING", async () => {
    const response = await POST(
      requestWithNotifications([
        { name: "Payment", id: "pay_1", operation: "Create" },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(webhookEventCreate).toHaveBeenCalledTimes(1);
    const createArgs = webhookEventCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe("SKIPPED");
    expect(createArgs.data.errorMessage).toEqual(expect.any(String));
    expect(createArgs.data.errorMessage.length).toBeGreaterThan(0);
  });

  it("still queues Payment Update events as PENDING", async () => {
    const response = await POST(
      requestWithNotifications([
        { name: "Payment", id: "pay_2", operation: "Update" },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    const createArgs = webhookEventCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe("PENDING");
  });

  it("still queues non-payment entities (Invoice Create) as PENDING", async () => {
    const response = await POST(
      requestWithNotifications([
        { name: "Invoice", id: "inv_1", operation: "Create" },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    const createArgs = webhookEventCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe("PENDING");
  });
});

describe("POST /api/webhooks/quickbooks — readiness owner (RA-8446)", () => {
  const invoiceCreate = [{ name: "Invoice", id: "inv_1", operation: "Create", lastUpdated: "2026-11-21T00:00:00Z" }];

  it.each(["SYNCING", "ERROR"])("queues for a %s connection the owner calls ready", async (status) => {
    useConnections([connection({ status })]);
    const response = await POST(requestWithNotifications(invoiceCreate));
    expect((await response.json()).processed).toBe(1);
    expect(webhookEventCreate.mock.calls[0][0].data.integrationId).toBe("integration_1");
  });

  it("does not store an event for a CONNECTED connection with no stored credentials", async () => {
    useConnections([connection({ accessToken: null })]);
    const response = await POST(requestWithNotifications(invoiceCreate));
    expect(response.status).toBe(200);
    expect((await response.json()).processed).toBe(0);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("uses the ready connection when a not-ready one shares the realm", async () => {
    useConnections([connection({ id: "a_not_ready", accessToken: "" }), connection({ id: "b_ready", status: "SYNCING" })]);
    await POST(requestWithNotifications(invoiceCreate));
    expect(webhookEventCreate.mock.calls.map(([arg]) => arg.data.integrationId)).toEqual(["b_ready"]);
  });

  it("does not choose between two ready connections for one realm", async () => {
    useConnections([connection({ id: "a", userId: "owner_a" }), connection({ id: "b", userId: "owner_b" })]);
    const response = await POST(requestWithNotifications(invoiceCreate));
    expect((await response.json()).processed).toBe(0);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("never reads token material to decide", async () => {
    await POST(requestWithNotifications(invoiceCreate));
    for (const [arg] of integrationFindMany.mock.calls) {
      expect(Object.keys(arg.select)).not.toContain("accessToken");
      expect(Object.keys(arg.select)).not.toContain("refreshToken");
    }
  });
});
