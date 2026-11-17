/**
 * RA-8439 — a user with two Xero rows (workspaceId NULL on both) must be able
 * to disconnect the row they name. Uses the real selection service; only the
 * database and the provider revocation are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const disconnectIntegration = vi.fn();

type Row = Record<string, unknown>;
const rows: Row[] = [];
const base = { provider: "XERO", name: "Xero", icon: null, config: null, status: "CONNECTED", tenantId: "org", realmId: null, companyId: null, tokenExpiresAt: null, workspaceId: null };

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const key of ["userId", "provider", "id", "workspaceId"]) {
    if (key in where && row[key] !== where[key]) return false;
  }
  return true;
}

vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/oauth-handler", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/oauth-handler")>("@/lib/integrations/oauth-handler");
  return { ...actual, disconnectIntegration: (...args: unknown[]) => disconnectIntegration(...args) };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter(row => matches(row, where))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find(row => matches(row, where)) ?? null),
    },
    externalClient: { deleteMany: vi.fn() },
    externalJob: { deleteMany: vi.fn() },
  },
}));

import { POST } from "../route";

function post(query = "") {
  return new NextRequest(`http://localhost/api/integrations/oauth/xero/disconnect${query}`, { method: "POST", body: "{}" });
}
const context = () => ({ params: Promise.resolve({ provider: "xero" }) });

beforeEach(() => {
  rows.length = 0;
  rows.push({ ...base, id: "row_a", userId: "user_1" }, { ...base, id: "row_b", userId: "user_1" }, { ...base, id: "row_other", userId: "user_2" });
  getServerSession.mockReset().mockResolvedValue({ user: { id: "user_1" } });
  disconnectIntegration.mockReset().mockResolvedValue(undefined);
});

describe("disconnect with two connections for one provider", () => {
  it("disconnects only the row the caller names", async () => {
    const response = await POST(post("?integrationId=row_b"), context());
    expect(response.status).toBe(200);
    expect(disconnectIntegration).toHaveBeenCalledTimes(1);
    expect(disconnectIntegration).toHaveBeenCalledWith("row_b", "XERO");
  });

  it("without a selection, refuses with a 409 that names the field to send", async () => {
    const response = await POST(post(), context());
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(JSON.stringify(body)).toContain("integrationId");
    expect(disconnectIntegration).not.toHaveBeenCalled();
  });

  it("never selects another user's row by id", async () => {
    const response = await POST(post("?integrationId=row_other"), context());
    expect(response.status).toBe(404);
    expect(disconnectIntegration).not.toHaveBeenCalled();
  });
});
