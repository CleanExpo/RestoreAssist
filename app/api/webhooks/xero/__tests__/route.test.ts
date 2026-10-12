import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const integrationFindFirst = vi.fn();
const integrationFindMany = vi.fn();
const webhookEventCreate = vi.fn();
const verifyXeroWebhookSignature = vi.fn();
const recordWebhookFailure = vi.fn();

vi.mock("@/lib/integrations/sync-queue", () => ({ queueInvoiceSync: vi.fn() }));
vi.mock("@/lib/services/xero/credentials", () => ({ getValidXeroAccessToken: vi.fn() }));
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
vi.mock("@/lib/integrations/xero/webhook-processor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/xero/webhook-processor")>()),
  verifyXeroWebhookSignature: (...args: unknown[]) =>
    verifyXeroWebhookSignature(...args),
}));
vi.mock("@/lib/webhook-audit", () => ({
  recordWebhookFailure: (...args: unknown[]) => recordWebhookFailure(...args),
}));

import { POST } from "../route";

function integration(overrides: Record<string, unknown> = {}) {
  return { id: "integration_1", userId: "owner_1", workspaceId: "workspace_1",
    provider: "XERO", name: "Custom accounting connection", icon: null,
    tenantId: "tenant_1", status: "CONNECTED", ...overrides };
}

function event(tenantId: unknown = "tenant_1") {
  return { tenantId, resourceId: "shared-external-id", resourceType: "INVOICE", eventType: "UPDATE" };
}

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
  integrationFindMany.mockReset();
  webhookEventCreate.mockReset();
  verifyXeroWebhookSignature.mockReset();
  recordWebhookFailure.mockReset();
  process.env.XERO_WEBHOOK_KEY = "key";

  verifyXeroWebhookSignature.mockReturnValue(true);
  integrationFindFirst.mockResolvedValue(integration());
  integrationFindMany.mockResolvedValue([integration()]);
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

  it("rejects an event dated more than 5 minutes in the future (RA-6987 clock-skew bound)", async () => {
    const sixMinutesAhead = new Date(
      Date.now() + 6 * 60 * 1000,
    ).toISOString();

    const response = await POST(
      requestWithEvents([
        {
          tenantId: "tenant_1",
          eventDateUtc: sixMinutesAhead,
          eventType: "CREATE",
          resourceType: "INVOICE",
        },
      ]),
    );

    expect(response.status).toBe(400);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("accepts an event within the 5 minute future clock-skew allowance", async () => {
    const twoMinutesAhead = new Date(
      Date.now() + 2 * 60 * 1000,
    ).toISOString();

    const response = await POST(
      requestWithEvents([
        {
          tenantId: "tenant_1",
          eventDateUtc: twoMinutesAhead,
          eventType: "CREATE",
          resourceType: "INVOICE",
        },
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
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


describe("POST /api/webhooks/xero — tenant and provider isolation", () => {
  it("binds each event in a mixed-tenant batch to its own integration", async () => {
    const rows = [integration(), integration({ id: "integration_2", userId: "owner_2", workspaceId: "workspace_2", tenantId: "tenant_2" })];
    integrationFindMany.mockImplementation(({ where }) => rows.filter(row => row.tenantId === where.tenantId));
    const response = await POST(requestWithEvents([event(), event("tenant_2")]));
    expect(response.status).toBe(200);
    expect((await response.json()).processed).toBe(2);
    expect(webhookEventCreate.mock.calls.map(([arg]) => [arg.data.integrationId, arg.data.payload.tenantId]))
      .toEqual([["integration_1", "tenant_1"], ["integration_2", "tenant_2"]]);
    const selects = integrationFindMany.mock.calls.map(([arg]) => arg.select);
    for (const select of selects) {
      expect(select).toEqual({ id: true, userId: true, workspaceId: true, provider: true, name: true, icon: true, config: true, tenantId: true, status: true });
    }
  });

  it("acknowledges an unknown tenant without dropping a later known event", async () => {
    integrationFindMany.mockImplementation(({ where }) => where.tenantId === "tenant_1" ? [integration()] : []);
    const response = await POST(requestWithEvents([event("unknown"), event()]));
    expect(response.status).toBe(200);
    expect((await response.json()).processed).toBe(1);
    expect(webhookEventCreate).toHaveBeenCalledTimes(1);
    expect(webhookEventCreate.mock.calls[0][0].data.payload.tenantId).toBe("tenant_1");
  });

  it.each([undefined, null, "", "   ", 42])("rejects missing/invalid tenant %s anywhere before queueing", async (tenantId) => {
    const malformed = { ...event(), tenantId };
    const response = await POST(requestWithEvents([event(), malformed]));
    expect(response.status).toBe(400);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it.each([
    { name: "OpenAI GPT", icon: "[ra:ai]" },
    { name: "Anthropic Claude", icon: null },
    { provider: "ASCORA" },
    { provider: "QUICKBOOKS" },
    { tenantId: "different-tenant" },
    { status: "DISCONNECTED" },
  ])("does not queue a nonmatching/AI integration %j", async (overrides) => {
    integrationFindMany.mockResolvedValue([integration(overrides)]);
    integrationFindFirst.mockResolvedValue(integration(overrides));
    const response = await POST(requestWithEvents([event()]));
    expect(response.status).toBe(200);
    expect((await response.json()).processed).toBe(0);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("does not arbitrarily choose an owner when two genuine connections share a tenant", async () => {
    integrationFindMany.mockResolvedValue([integration(), integration({ id: "second", userId: "other-owner" })]);
    const response = await POST(requestWithEvents([event()]));
    expect(response.status).toBe(200);
    expect((await response.json()).processed).toBe(0);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("ignores a legacy AI collision and uses the genuine tenant connection", async () => {
    integrationFindMany.mockResolvedValue([integration({ id: "legacy-ai", name: "OpenAI GPT", icon: "[ra:ai]" }), integration()]);
    const response = await POST(requestWithEvents([event()]));
    expect(response.status).toBe(200);
    expect(webhookEventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ integrationId: "integration_1" }) }));
  });

  it("rejects a bad signature before any tenant lookup", async () => {
    verifyXeroWebhookSignature.mockReturnValue(false);
    const response = await POST(requestWithEvents([event()]));
    expect(response.status).toBe(401);
    expect(integrationFindMany).not.toHaveBeenCalled();
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });
});


describe("Xero webhook bounded identity lookup", () => {
  it("includes internal config-only AI identity before deciding to queue", async () => {
    const row = integration({ config: JSON.stringify({ apiKeyType: "ANTHROPIC" }) });
    integrationFindMany.mockImplementation(({ select }) => [Object.fromEntries(Object.keys(select).map(key => [key, row[key as keyof typeof row]]))]);
    const response = await POST(requestWithEvents([event()]));
    expect((await response.json()).processed).toBe(0);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("bounds candidate reads and fails closed on overflow before filtering legacy AI rows", async () => {
    const rows = [integration(), ...Array.from({ length: 100 }, (_, index) => integration({ id: `ai-${index}`, name: "OpenAI GPT", icon: "[ra:ai]" }))];
    integrationFindMany.mockImplementation(({ take }) => take ? rows.slice(0, take) : rows);
    const response = await POST(requestWithEvents([event()]));
    expect((await response.json()).processed).toBe(0);
    expect(webhookEventCreate).not.toHaveBeenCalled();
    expect(integrationFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
  });
});
