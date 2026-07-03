import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const checkIntegrationAccess = vi.fn();
const integrationFindFirst = vi.fn();
const externalJobFindMany = vi.fn();
const externalClientFindFirst = vi.fn();
const reportCreate = vi.fn();
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
    report: {
      create: (...args: unknown[]) => reportCreate(...args),
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
  reportCreate.mockReset();
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
});
