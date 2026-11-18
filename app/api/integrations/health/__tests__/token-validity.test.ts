/**
 * RA-8443 — the "Token Validity" check must take its per-connection verdict
 * from the readiness owner (getOAuthReadiness), not from `tokenExpiresAt`.
 *
 * - A lapsed access token is normal: the provider clients refresh it on the
 *   next call when a refresh token is stored (lib/integrations/base-client.ts).
 * - A connection with no organisation selected cannot sync, whatever its
 *   token says.
 * - SYNCING and ERROR rows are connected rows and must be checked too.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findMany: vi.fn() },
    webhookEvent: { count: vi.fn() },
    integrationSyncLog: { findMany: vi.fn() },
    ascoraIntegration: { findUnique: vi.fn() },
    drNrpgIntegration: { findUnique: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  integration: { findMany: ReturnType<typeof vi.fn> };
  webhookEvent: { count: ReturnType<typeof vi.fn> };
  integrationSyncLog: { findMany: ReturnType<typeof vi.fn> };
  ascoraIntegration: { findUnique: ReturnType<typeof vi.fn> };
  drNrpgIntegration: { findUnique: ReturnType<typeof vi.fn> };
};

const PAST = new Date(Date.now() - 6 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const SECRET = "tok_must_never_leak";

type Row = {
  id: string;
  provider: string;
  name: string;
  status: string;
  tenantId: string | null;
  realmId: string | null;
  companyId: string | null;
  tokenExpiresAt: Date | null;
  accessToken: string | null;
  refreshToken: string | null;
};

function row(over: Partial<Row>): Row {
  return {
    id: "i_1",
    provider: "XERO",
    name: "Xero",
    status: "CONNECTED",
    tenantId: "tenant-1",
    realmId: null,
    companyId: null,
    tokenExpiresAt: FUTURE,
    accessToken: SECRET,
    refreshToken: SECRET,
    ...over,
  };
}

/**
 * Simulates the database: the main query returns rows filtered by status and
 * projected by `select`; credential-presence queries return ids only. Records
 * every query so the test can assert no token column is selected.
 */
function seed(rows: Row[]) {
  db.integration.findMany.mockImplementation(async (args: any) => {
    const where = args?.where ?? {};
    let out = rows.filter((r) => {
      if (where.status === "ERROR" && where.updatedAt) return false;
      if (typeof where.status === "string") return r.status === where.status;
      if (where.status?.in) return where.status.in.includes(r.status);
      return true;
    });
    if (where.id?.in) out = out.filter((r) => where.id.in.includes(r.id));
    for (const col of ["accessToken", "refreshToken"] as const) {
      if (where[col]) {
        out = out.filter((r) => r[col] != null && r[col] !== "");
      }
    }
    const select = args?.select ?? {};
    return out.map((r) =>
      Object.fromEntries(
        Object.keys(select)
          .filter((k) => select[k])
          .map((k) => [k, (r as any)[k] ?? null]),
      ),
    );
  });
}

async function tokenCheck() {
  const res = await GET(new NextRequest("http://localhost/api/integrations/health"));
  const body = await res.json();
  return {
    body,
    raw: JSON.stringify(body),
    check: body.checks.find((c: any) => c.name === "Token Validity"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  db.webhookEvent.count.mockResolvedValue(0);
  db.integrationSyncLog.findMany.mockResolvedValue([]);
  db.ascoraIntegration.findUnique.mockResolvedValue(null);
  db.drNrpgIntegration.findUnique.mockResolvedValue(null);
});

describe("GET /api/integrations/health — Token Validity (RA-8443)", () => {
  it("passes a lapsed access token when a refresh token is stored", async () => {
    seed([row({ tokenExpiresAt: PAST })]);
    const { body, check } = await tokenCheck();

    expect(check.status).toBe("pass");
    expect(check.details).toEqual([]);
    expect(body.status).not.toBe("degraded");
  });

  it("fails a QuickBooks connection with no organisation, using the integrations page wording", async () => {
    seed([
      row({ provider: "QUICKBOOKS", name: "QuickBooks", tenantId: null, realmId: null }),
    ]);
    const { check } = await tokenCheck();

    expect(check.status).toBe("fail");
    expect(check.details).toEqual([
      expect.objectContaining({
        provider: "QUICKBOOKS",
        reason: "ORGANISATION_REQUIRED",
        message: expect.stringMatching(/No organisation is selected/),
      }),
    ]);
  });

  it("fails a lapsed access token with no refresh token", async () => {
    seed([row({ tokenExpiresAt: PAST, refreshToken: null })]);
    const { check } = await tokenCheck();

    expect(check.status).toBe("fail");
    expect(check.details).toEqual([
      expect.objectContaining({ provider: "XERO", reason: "REFRESH_REQUIRED" }),
    ]);
  });

  it("fails a connection with no access token as CREDENTIALS_REQUIRED", async () => {
    seed([row({ accessToken: "" })]);
    const { check } = await tokenCheck();

    expect(check.status).toBe("fail");
    expect(check.details).toEqual([
      expect.objectContaining({ provider: "XERO", reason: "CREDENTIALS_REQUIRED" }),
    ]);
  });

  it("includes SYNCING and ERROR rows in the check", async () => {
    seed([
      row({ id: "i_s", provider: "MYOB", name: "MYOB", status: "SYNCING", tenantId: null }),
      row({ id: "i_e", provider: "QUICKBOOKS", name: "QuickBooks", status: "ERROR", tenantId: null, realmId: null }),
    ]);
    const { check } = await tokenCheck();

    expect(check.status).toBe("fail");
    expect(check.details.map((d: any) => d.provider).sort()).toEqual([
      "MYOB",
      "QUICKBOOKS",
    ]);
  });

  it("never reads a token value into a query result or the response", async () => {
    seed([row({ tokenExpiresAt: PAST, refreshToken: null })]);
    const { raw } = await tokenCheck();

    expect(raw).not.toContain(SECRET);
    for (const [args] of db.integration.findMany.mock.calls) {
      expect(args.select?.accessToken).toBeFalsy();
      expect(args.select?.refreshToken).toBeFalsy();
    }
  });
});
