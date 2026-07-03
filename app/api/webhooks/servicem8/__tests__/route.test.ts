import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const externalClientFindMany = vi.fn();
const integrationFindMany = vi.fn();
const webhookEventCreate = vi.fn();
const recordWebhookFailure = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalClient: {
      findMany: (...args: unknown[]) => externalClientFindMany(...args),
    },
    integration: {
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

const SECRET = "test-secret";

function signedRequest(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/servicem8", {
    method: "POST",
    body: raw,
    headers: { "x-servicem8-signature": signature },
  });
}

beforeEach(() => {
  externalClientFindMany.mockReset();
  integrationFindMany.mockReset();
  webhookEventCreate.mockReset();
  recordWebhookFailure.mockReset();
  process.env.SERVICEM8_WEBHOOK_SECRET = SECRET;

  webhookEventCreate.mockResolvedValue({ id: "event_1" });
});

describe("POST /api/webhooks/servicem8 — tenant attribution", () => {
  it("resolves a Job event to the integration whose synced ExternalClient matches company_uuid, not just the first CONNECTED integration", async () => {
    // Two CONNECTED SERVICEM8 integrations exist (multi-tenant). The event's
    // company_uuid belongs to integration_B's synced customer.
    externalClientFindMany.mockResolvedValue([
      { integrationId: "integration_B" },
    ]);

    const response = await POST(
      signedRequest({
        service: "Job",
        entry: [
          {
            uuid: "job-1",
            active: 1,
            company_uuid: "company-b-customer",
          },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(webhookEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ integrationId: "integration_B" }),
      }),
    );
    // Never had to fall back to "first connected" — the DB wasn't even
    // queried for the full CONNECTED list.
    expect(integrationFindMany).not.toHaveBeenCalled();
  });

  it("rejects (does not misattribute) when the company_uuid doesn't match and multiple integrations are CONNECTED", async () => {
    externalClientFindMany.mockResolvedValue([]); // no match
    integrationFindMany.mockResolvedValue([
      { id: "integration_A" },
      { id: "integration_B" },
    ]);

    const response = await POST(
      signedRequest({
        service: "Job",
        entry: [{ uuid: "job-1", active: 1, company_uuid: "unknown-company" }],
      }),
    );

    expect(response.status).toBe(400);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("falls back to the sole CONNECTED integration when there's no match and only one integration exists (no regression for single-tenant)", async () => {
    externalClientFindMany.mockResolvedValue([]);
    integrationFindMany.mockResolvedValue([{ id: "integration_only" }]);

    const response = await POST(
      signedRequest({
        service: "Job",
        entry: [{ uuid: "job-1", active: 1, company_uuid: "brand-new-company" }],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(webhookEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ integrationId: "integration_only" }),
      }),
    );
  });

  it("rejects when there is no CONNECTED SERVICEM8 integration at all", async () => {
    externalClientFindMany.mockResolvedValue([]);
    integrationFindMany.mockResolvedValue([]);

    const response = await POST(
      signedRequest({
        service: "Job",
        entry: [{ uuid: "job-1", active: 1, company_uuid: "x" }],
      }),
    );

    expect(response.status).toBe(400);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("resolves a Client event using the entry's own uuid as the company identifier", async () => {
    externalClientFindMany.mockResolvedValue([
      { integrationId: "integration_B" },
    ]);

    const response = await POST(
      signedRequest({
        service: "Client",
        entry: [{ uuid: "client-company-uuid", active: 1 }],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(externalClientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalId: { in: ["client-company-uuid"] },
        }),
      }),
    );
  });
});
