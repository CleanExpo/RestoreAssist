/**
 * RA-6973 item 2 — POST /api/webhooks/myob freshness-gate retry window.
 * RA-6974 item 1 — QBO/MYOB payment stubs must be marked SKIPPED, not
 * COMPLETED, because the CDC/raw-notification payload MYOB sends for
 * Sale.CustomerPayment "Created" events never carries Amount/InvoiceUID —
 * it is permanently unresolvable by the downstream payment handler.
 *
 * Covers:
 *   - A genuine MYOB retry a couple of hours old is no longer rejected by
 *     the freshness gate (previously hard-coded to 5 minutes, identical to
 *     the bug #1683 fixed on the Xero route).
 *   - A replay older than the 24h retry window is still rejected.
 *   - The (provider, externalEventId) idempotency guard still dedupes an
 *     accepted retry.
 *   - A payment.created (Sale.CustomerPayment "Created") event is queued as
 *     SKIPPED with an errorMessage instead of PENDING.
 *   - Other event types are unaffected and still queued as PENDING.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const integrationFindFirst = vi.fn();
const webhookEventCreate = vi.fn();

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

import { POST } from "../route";

const SECRET = "test-myob-secret";

function requestWithEvents(events: unknown[]) {
  const raw = JSON.stringify({ Events: events });
  const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/myob", {
    method: "POST",
    body: raw,
    headers: { "x-myob-signature": signature },
  });
}

beforeEach(() => {
  integrationFindFirst.mockReset();
  webhookEventCreate.mockReset();
  process.env.MYOB_WEBHOOK_SECRET = SECRET;

  integrationFindFirst.mockResolvedValue({ id: "integration_1" });
  webhookEventCreate.mockResolvedValue({ id: "event_1" });
});

describe("POST /api/webhooks/myob — freshness gate", () => {
  it("accepts a genuine provider retry a couple of hours old (previously rejected at the 5-minute gate)", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const response = await POST(
      requestWithEvents([
        {
          CompanyFileId: "cf_1",
          EventDateTime: twoHoursAgo,
          EventType: "Created",
          ResourceType: "Contact.Customer",
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
  });

  it("still rejects a replay older than the 24h retry window", async () => {
    const twoDaysAgo = new Date(
      Date.now() - 48 * 60 * 60 * 1000,
    ).toISOString();

    const response = await POST(
      requestWithEvents([
        {
          CompanyFileId: "cf_1",
          EventDateTime: twoDaysAgo,
          EventType: "Created",
          ResourceType: "Contact.Customer",
        },
      ]),
    );

    expect(response.status).toBe(400);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("relies on the idempotency guard so an accepted retry within the window is not double-processed", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const err = Object.assign(new Error("dup"), { code: "P2002" });
    webhookEventCreate.mockRejectedValueOnce(err);

    const response = await POST(
      requestWithEvents([
        {
          CompanyFileId: "cf_1",
          EventDateTime: oneHourAgo,
          EventType: "Created",
          ResourceType: "Contact.Customer",
          ResourceUID: "res_1",
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(0);
    expect(webhookEventCreate).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/webhooks/myob — unresolvable payment stub", () => {
  it("queues a Sale.CustomerPayment Created event as SKIPPED with an errorMessage, not PENDING", async () => {
    const response = await POST(
      requestWithEvents([
        {
          CompanyFileId: "cf_1",
          EventDateTime: new Date().toISOString(),
          EventType: "Created",
          ResourceType: "Sale.CustomerPayment",
          ResourceUID: "payment_1",
        },
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

  it("still queues other Sale.CustomerPayment operations (e.g. Updated) as PENDING", async () => {
    const response = await POST(
      requestWithEvents([
        {
          CompanyFileId: "cf_1",
          EventDateTime: new Date().toISOString(),
          EventType: "Updated",
          ResourceType: "Sale.CustomerPayment",
          ResourceUID: "payment_2",
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    const createArgs = webhookEventCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe("PENDING");
  });

  it("still queues non-payment events (e.g. Sale.Invoice Created) as PENDING", async () => {
    const response = await POST(
      requestWithEvents([
        {
          CompanyFileId: "cf_1",
          EventDateTime: new Date().toISOString(),
          EventType: "Created",
          ResourceType: "Sale.Invoice",
          ResourceUID: "invoice_1",
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    const createArgs = webhookEventCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe("PENDING");
  });
});
