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
const webhookEventCreate = vi.fn();
const recordWebhookFailure = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: (...args: unknown[]) => integrationFindFirst(...args),
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

  integrationFindFirst.mockResolvedValue({ id: "integration_1" });
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
