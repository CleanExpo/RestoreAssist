import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const checkIntegrationAccess = vi.fn();
const integrationFindFirst = vi.fn();
const externalJobFindMany = vi.fn();
const externalClientFindFirst = vi.fn();
const clientFindFirst = vi.fn();
const reportCreate = vi.fn();
const reportFindFirst = vi.fn();
const externalJobUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/subscription-guard", () => ({
  checkIntegrationAccess: (...args: unknown[]) =>
    checkIntegrationAccess(...args),
  createSubscriptionRequiredResponse: (result: unknown) => ({
    error: "Subscription required",
    result,
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: (...args: unknown[]) => integrationFindFirst(...args),
    },
    externalJob: {
      findMany: (...args: unknown[]) => externalJobFindMany(...args),
      update: (...args: unknown[]) => externalJobUpdate(...args),
    },
    externalClient: {
      findFirst: (...args: unknown[]) => externalClientFindFirst(...args),
    },
    client: {
      findFirst: (...args: unknown[]) => clientFindFirst(...args),
    },
    report: {
      create: (...args: unknown[]) => reportCreate(...args),
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
    },
  },
}));

import { POST } from "../route";

function postRequest(body: unknown) {
  return new NextRequest(
    "http://localhost/api/integrations/oauth/xero/jobs",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

function routeContext() {
  return { params: Promise.resolve({ provider: "xero" }) };
}

beforeEach(() => {
  getServerSession.mockReset();
  checkIntegrationAccess.mockReset();
  integrationFindFirst.mockReset();
  externalJobFindMany.mockReset();
  externalClientFindFirst.mockReset();
  clientFindFirst.mockReset();
  reportCreate.mockReset();
  reportFindFirst.mockReset();
  externalJobUpdate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  checkIntegrationAccess.mockResolvedValue({ isAllowed: true });
  integrationFindFirst.mockResolvedValue({ id: "integration_1" });
  reportCreate.mockResolvedValue({ id: "report_1" });
  externalJobUpdate.mockResolvedValue({});
});

describe("POST /api/integrations/oauth/[provider]/jobs", () => {
  it("resolves the linked Client's contactId directly (no `as any` masking a dropped column)", async () => {
    externalJobFindMany.mockResolvedValue([
      {
        id: "job_1",
        externalId: "xero-job-1",
        title: "Water damage — Unit 4",
        status: "IN_PROGRESS",
        clientExternalId: "xero-client-1",
        address: "1 Test St",
        description: "Test job",
      },
    ]);
    externalClientFindFirst.mockResolvedValue({
      id: "extclient_1",
      contactId: "client_1",
    });
    clientFindFirst.mockResolvedValue({ id: "client_1" });

    const response = await POST(postRequest({ jobIds: ["xero-job-1"] }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "client_1" }),
      }),
    );
  });

  it("leaves clientId undefined when the linked external client has no contactId yet", async () => {
    externalJobFindMany.mockResolvedValue([
      {
        id: "job_2",
        externalId: "xero-job-2",
        title: "Fire damage — Unit 9",
        status: "QUOTE",
        clientExternalId: "xero-client-2",
        address: "2 Test St",
        description: "Test job 2",
      },
    ]);
    externalClientFindFirst.mockResolvedValue({
      id: "extclient_2",
      contactId: null,
    });

    const response = await POST(postRequest({ jobIds: ["xero-job-2"] }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: undefined }),
      }),
    );
  });

  it("is idempotent on re-import — does not create a second Report for an already-linked job", async () => {
    externalJobFindMany.mockResolvedValue([
      {
        id: "job_3",
        externalId: "xero-job-3",
        title: "Mould remediation",
        status: "COMPLETED",
        clientExternalId: null,
        address: "3 Test St",
        description: "Test job 3",
        claimId: "report_existing", // already imported previously
      },
    ]);
    reportFindFirst.mockResolvedValue({ id: "report_existing" }); // link still valid

    const response = await POST(
      postRequest({ jobIds: ["xero-job-3"] }),
      routeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(reportCreate).not.toHaveBeenCalled();
    expect(externalJobUpdate).not.toHaveBeenCalled();
  });

  it("re-links an external job whose Report was deleted instead of leaving it orphaned", async () => {
    externalJobFindMany.mockResolvedValue([
      {
        id: "job_4",
        externalId: "xero-job-4",
        title: "Fire damage",
        status: "IN_PROGRESS",
        clientExternalId: null,
        address: "4 Test St",
        description: "Test job 4",
        claimId: "report_deleted",
      },
    ]);
    reportFindFirst.mockResolvedValue(null); // stale link — Report no longer exists

    const response = await POST(
      postRequest({ jobIds: ["xero-job-4"] }),
      routeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(reportCreate).toHaveBeenCalledTimes(1);
  });

  it("reports a partial import honestly: 200, success, imported 1, failed 1 (RA-7663)", async () => {
    const job = (id: string, externalId: string) => ({
      id,
      externalId,
      title: "Synthetic job",
      status: null,
      clientExternalId: null,
      address: null,
      description: null,
    });
    externalJobFindMany.mockResolvedValue([
      job("job_5", "xero-job-5"),
      job("job_6", "xero-job-6"),
    ]);
    reportCreate
      .mockResolvedValueOnce({ id: "report_5" })
      .mockRejectedValueOnce(new Error("rejected by the database"));

    const response = await POST(
      postRequest({ jobIds: ["xero-job-5", "xero-job-6"] }),
      routeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.errors).toEqual([
      { id: "xero-job-6", error: expect.any(String) },
    ]);
  });

  it("persists the selected workspace and scopes report and client links", async () => {
    integrationFindFirst.mockResolvedValue({ id: "integration_1", workspaceId: "workspace-a" });
    externalJobFindMany.mockResolvedValue([{ id: "job_a", externalId: "xero-job-a", title: "Scoped job",
      status: null, clientExternalId: "client-a", address: null, description: null, claimId: "foreign-report" }]);
    reportFindFirst.mockResolvedValue(null);
    externalClientFindFirst.mockResolvedValue({ contactId: "client-a" });
    clientFindFirst.mockResolvedValue({ id: "client-a" });

    const response = await POST(postRequest({ jobIds: ["xero-job-a"] }), routeContext());
    expect(response.status).toBe(200);
    expect(reportFindFirst).toHaveBeenCalledWith({
      where: { id: "foreign-report", userId: "user_1", workspaceId: "workspace-a" }, select: { id: true },
    });
    expect(clientFindFirst).toHaveBeenCalledWith({
      where: { id: "client-a", userId: "user_1", workspaceId: "workspace-a" }, select: { id: true },
    });
    expect(reportCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "user_1", workspaceId: "workspace-a", clientId: "client-a" }),
    }));
  });

  it("refuses a linked client from another workspace before creating a report", async () => {
    integrationFindFirst.mockResolvedValue({ id: "integration_1", workspaceId: "workspace-a" });
    externalJobFindMany.mockResolvedValue([{ id: "job_a", externalId: "xero-job-a", title: "Scoped job",
      status: null, clientExternalId: "client-a", address: null, description: null }]);
    externalClientFindFirst.mockResolvedValue({ contactId: "foreign-client" });
    clientFindFirst.mockResolvedValue(null);

    const response = await POST(postRequest({ jobIds: ["xero-job-a"] }), routeContext());
    expect(response.status).toBe(422);
    expect((await response.json()).imported).toBe(0);
    expect(reportCreate).not.toHaveBeenCalled();
  });
});

// These tests cover route policy/import behaviour; provider identity has dedicated real-service regressions.
vi.mock("@/lib/services/integrations/select-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/integrations/select-oauth")>();
  return { ...actual, selectOAuthIntegration: vi.fn(async (input: { prisma: any; userId: string; provider: string; requireReady?: boolean }) => {
    const row = await input.prisma.integration.findFirst({ where: { userId: input.userId, provider: input.provider,
      ...(input.requireReady ? { status: { in: ["CONNECTED", "ERROR", "SYNCING"] } } : {}) } });
    return row ? { ok: true, data: row } : { ok: false, reason: "NOT_FOUND" };
  }) };
});
