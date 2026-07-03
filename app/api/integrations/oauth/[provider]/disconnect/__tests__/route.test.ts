import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const integrationFindFirst = vi.fn();
const externalClientDeleteMany = vi.fn();
const externalJobDeleteMany = vi.fn();
const disconnectIntegration = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/oauth-handler", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/oauth-handler")
  >("@/lib/integrations/oauth-handler");
  return {
    ...actual,
    disconnectIntegration: (...args: unknown[]) =>
      disconnectIntegration(...args),
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: (...args: unknown[]) => integrationFindFirst(...args),
    },
    externalClient: {
      deleteMany: (...args: unknown[]) => externalClientDeleteMany(...args),
    },
    externalJob: {
      deleteMany: (...args: unknown[]) => externalJobDeleteMany(...args),
    },
  },
}));

import { POST } from "../route";

function postRequest(body: unknown = {}) {
  return new NextRequest(
    "http://localhost/api/integrations/oauth/xero/disconnect",
    { method: "POST", body: JSON.stringify(body) },
  );
}

function routeContext() {
  return { params: Promise.resolve({ provider: "xero" }) };
}

beforeEach(() => {
  getServerSession.mockReset();
  integrationFindFirst.mockReset();
  externalClientDeleteMany.mockReset();
  externalJobDeleteMany.mockReset();
  disconnectIntegration.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  integrationFindFirst.mockResolvedValue({ id: "integration_1" });
  disconnectIntegration.mockResolvedValue(undefined);
});

describe("POST /api/integrations/oauth/[provider]/disconnect", () => {
  it("does not gate on subscription status — a CANCELED user can still disconnect", async () => {
    // No subscription-guard mock is wired up at all: if the route still
    // imported/called checkIntegrationAccess this test would fail because
    // there'd be no such module to resolve, or (if left stale) it would
    // 403 by default. Getting a clean 200 proves the gate is gone.
    const response = await POST(postRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(disconnectIntegration).toHaveBeenCalledWith("integration_1");
  });

  it("still 404s when the user has no integration of that provider", async () => {
    integrationFindFirst.mockResolvedValue(null);

    const response = await POST(postRequest(), routeContext());

    expect(response.status).toBe(404);
    expect(disconnectIntegration).not.toHaveBeenCalled();
  });
});
