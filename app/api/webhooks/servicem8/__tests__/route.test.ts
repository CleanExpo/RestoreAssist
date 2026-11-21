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
import { fakeFindMany, type FakeIntegrationRow } from "@/tests/helpers/fake-integration-table";

/** A ServiceM8 connection the readiness owner calls ready (RA-8446). */
function connection(id: string, overrides: Partial<FakeIntegrationRow> = {}): FakeIntegrationRow {
  return { id, userId: `owner_${id}`, workspaceId: null, provider: "SERVICEM8", name: "ServiceM8",
    icon: null, config: null, status: "CONNECTED", tenantId: null, realmId: null,
    companyId: `company_${id}`, tokenExpiresAt: null, accessToken: "ciphertext", ...overrides };
}

function useConnections(rows: FakeIntegrationRow[]) {
  integrationFindMany.mockImplementation(fakeFindMany(rows));
}

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
  useConnections([connection("integration_A"), connection("integration_B")]);
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
    // Never had to fall back to "first connected": the only integration read
    // is the readiness check of the matched connection (RA-8446).
    expect(integrationFindMany).toHaveBeenCalledTimes(1);
    expect(integrationFindMany.mock.calls[0][0].where.id).toEqual({ in: ["integration_B"] });
  });

  it("rejects (does not misattribute) when the company_uuid doesn't match and multiple integrations are CONNECTED", async () => {
    externalClientFindMany.mockResolvedValue([]); // no match
    useConnections([connection("integration_A"), connection("integration_B")]);

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
    useConnections([connection("integration_only")]);

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
    useConnections([]);

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


describe("POST /api/webhooks/servicem8 — readiness owner (RA-8446)", () => {
  const job = { service: "Job", entry: [{ uuid: "job-1", active: 1, company_uuid: "new-company" }] };

  it.each(["SYNCING", "ERROR"])("falls back to the sole %s connection the owner calls ready", async (status) => {
    externalClientFindMany.mockResolvedValue([]);
    useConnections([connection("integration_only", { status })]);
    const response = await POST(signedRequest(job));
    expect(response.status).toBe(200);
    expect(webhookEventCreate.mock.calls[0][0].data.integrationId).toBe("integration_only");
  });

  it("does not fall back to a CONNECTED connection with no stored credentials", async () => {
    externalClientFindMany.mockResolvedValue([]);
    useConnections([connection("integration_only", { accessToken: null })]);
    const response = await POST(signedRequest(job));
    expect(response.status).toBe(400);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("counts a ready ERROR connection when deciding the fallback is unique", async () => {
    externalClientFindMany.mockResolvedValue([]);
    useConnections([connection("integration_A"), connection("integration_B", { status: "ERROR" })]);
    const response = await POST(signedRequest(job));
    expect(response.status).toBe(400);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("does not store a matched event when the owner calls the matched connection not ready", async () => {
    externalClientFindMany.mockResolvedValue([{ integrationId: "integration_B" }]);
    useConnections([connection("integration_A"), connection("integration_B", { name: "OpenAI GPT", icon: "[ra:ai]" })]);
    const response = await POST(signedRequest({ service: "Job", entry: [{ uuid: "job-1", active: 1, company_uuid: "b-customer" }] }));
    expect(response.status).toBe(400);
    expect(webhookEventCreate).not.toHaveBeenCalled();
  });

  it("scopes the ExternalClient match to the owner's statuses and stored credentials", async () => {
    externalClientFindMany.mockResolvedValue([{ integrationId: "integration_B" }]);
    await POST(signedRequest({ service: "Job", entry: [{ uuid: "job-1", active: 1, company_uuid: "b-customer" }] }));
    expect(externalClientFindMany.mock.calls[0][0].where.integration).toEqual({
      provider: "SERVICEM8",
      status: { in: ["CONNECTED", "SYNCING", "ERROR"] },
      accessToken: { not: null, notIn: [""] },
    });
  });
});
