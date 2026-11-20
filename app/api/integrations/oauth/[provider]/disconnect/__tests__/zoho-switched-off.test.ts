/**
 * RA-8215 review finding: turning the Zoho switch off must not trap an
 * existing Zoho connection. Disconnect is the path that revokes its tokens,
 * so it still has to find the row, through the real selector.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const integrationFindMany = vi.fn();
const disconnectIntegration = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "user_1" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/oauth-handler", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/oauth-handler")
  >("@/lib/integrations/oauth-handler");
  return {
    ...actual,
    disconnectIntegration: (...args: unknown[]) => disconnectIntegration(...args),
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findMany: (...args: unknown[]) => integrationFindMany(...args),
    },
  },
}));

const zoho = {
  id: "zoho_1", userId: "user_1", workspaceId: null, provider: "ZOHO",
  name: "Zoho CRM", icon: null, config: null, status: "CONNECTED",
  tenantId: null, realmId: null, companyId: "AU", tokenExpiresAt: null,
};

function disconnect(provider: string) {
  return import("../route").then(({ POST }) =>
    POST(
      new NextRequest(`http://localhost/api/integrations/oauth/${provider}/disconnect`, {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ provider }) },
    ),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_ZOHO_ENABLED", "");
  integrationFindMany.mockResolvedValue([zoho]);
  disconnectIntegration.mockResolvedValue(undefined);
});

describe("disconnect with the Zoho switch off", () => {
  it("still finds and revokes an existing Zoho connection", async () => {
    const res = await disconnect("zoho");
    expect(res.status).toBe(200);
    expect(disconnectIntegration).toHaveBeenCalledWith("zoho_1", "ZOHO");
    const where = JSON.stringify(integrationFindMany.mock.calls[0][0].where);
    expect(where).toContain('"ZOHO"');
    expect(where).not.toContain('"XERO"');
  });

  it("a Xero disconnect never names ZOHO in SQL", async () => {
    integrationFindMany.mockResolvedValue([]);
    const res = await disconnect("xero");
    expect(res.status).toBe(404);
    expect(JSON.stringify(integrationFindMany.mock.calls[0][0].where)).not.toContain('"ZOHO"');
  });
});
