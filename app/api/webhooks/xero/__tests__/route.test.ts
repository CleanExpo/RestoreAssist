import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const integrationFindFirst = vi.fn();
const webhookEventCreate = vi.fn();
const verifyXeroWebhookSignature = vi.fn();
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
vi.mock("@/lib/integrations/xero/webhook-processor", () => ({
  verifyXeroWebhookSignature: (...args: unknown[]) =>
    verifyXeroWebhookSignature(...args),
}));
vi.mock("@/lib/webhook-audit", () => ({
  recordWebhookFailure: (...args: unknown[]) => recordWebhookFailure(...args),
}));

import { POST } from "../route";

function requestWithEvents(events: unknown[]) {
  const raw = JSON.stringify({ events });
  return new NextRequest("http://localhost/api/webhooks/xero", {
    method: "POST",
    body: raw,
    headers: { "x-xero-signature": "sig" },
  });
}

beforeEach(() => {
  integrationFindFirst.mockReset();
  webhookEventCreate.mockReset();
  verifyXeroWebhookSignature.mockReset();
  recordWebhookFailure.mockReset();
  process.env.XERO_WEBHOOK_KEY = "key";

  verifyXeroWebhookSignature.mockReturnValue(true);
  integrationFindFirst.mockResolvedValue({ id: "integration_1" });
  webhookEventCreate.mockResolvedValue({ id: "event_1" });
});

describe("POST /api/webhooks/xero — freshness gate", () => {
  it("accepts a genuine provider retry a couple of hours old (previously rejected at the 5-minute gate)", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const response = await POST(
      requestWithEvents([
        {
          tenantId: "tenant_1",
          eventDateUtc: twoHoursAgo,
          eventType: "CREATE",
          resourceType: "INVOICE",
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
          tenantId: "tenant_1",
          eventDateUtc: twoDaysAgo,
          eventType: "CREATE",
          resourceType: "INVOICE",
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
          tenantId: "tenant_1",
          eventDateUtc: oneHourAgo,
          eventType: "CREATE",
          resourceType: "INVOICE",
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // The duplicate create was swallowed (P2002) — not queued twice.
    expect(body.processed).toBe(0);
    expect(webhookEventCreate).toHaveBeenCalledTimes(1);
  });
});
