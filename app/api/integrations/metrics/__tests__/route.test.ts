/**
 * RA-8445 — GET /api/integrations/metrics must take "connected" from the
 * readiness owner (getOAuthReadiness via describeOAuthCard), not from the raw
 * Integration.status column. A CONNECTED Xero row with no organisation cannot
 * sync, so it must not be counted or shown as connected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findMany: vi.fn() },
    integrationSyncLog: { findMany: vi.fn() },
    invoicePayment: { count: vi.fn() },
    webhookEvent: { count: vi.fn() },
  },
}));
vi.mock("@/lib/jobs/webhook-queue", () => ({ getQueueStats: vi.fn(async () => ({})) }));
vi.mock("@/lib/integrations/sync-queue", () => ({ getSyncQueueStats: vi.fn(() => ({})) }));
vi.mock("@/lib/integrations/circuit-breaker", () => ({
  circuitBreakerManager: { getAllStats: vi.fn(() => []) },
}));
vi.mock("@/lib/integrations/rate-limiter", () => ({
  rateLimiterManager: { getAllStats: vi.fn(() => []) },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  integration: { findMany: ReturnType<typeof vi.fn> };
  integrationSyncLog: { findMany: ReturnType<typeof vi.fn> };
  invoicePayment: { count: ReturnType<typeof vi.fn> };
  webhookEvent: { count: ReturnType<typeof vi.fn> };
};

const SECRET = "tok_must_never_leak";

type Row = {
  id: string;
  provider: string;
  name: string;
  icon: string | null;
  config: string | null;
  status: string;
  tenantId: string | null;
  realmId: string | null;
  companyId: string | null;
  tokenExpiresAt: Date | null;
  lastSyncAt: Date | null;
  accessToken: string | null;
};

function row(over: Partial<Row>): Row {
  return {
    id: "i_1",
    provider: "XERO",
    name: "Xero",
    icon: null,
    config: null,
    status: "CONNECTED",
    tenantId: "tenant-1",
    realmId: null,
    companyId: null,
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastSyncAt: null,
    accessToken: SECRET,
    ...over,
  };
}

const queries: any[] = [];

/** Projects rows through `select` and answers credential-presence queries. */
function seed(rows: Row[]) {
  db.integration.findMany.mockImplementation(async (args: any) => {
    queries.push(args);
    const where = args?.where ?? {};
    let out = rows;
    if (where.id?.in) out = out.filter((r) => where.id.in.includes(r.id));
    if (where.accessToken) out = out.filter((r) => Boolean(r.accessToken?.trim()));
    const select = args?.select ?? {};
    return out.map((r) =>
      Object.fromEntries(Object.keys(select).map((k) => [k, (r as any)[k]])),
    );
  });
}

async function call() {
  const res = await GET(new NextRequest("http://localhost/api/integrations/metrics"));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  mockSession.mockResolvedValue({ user: { id: "user-1" } });
  db.integrationSyncLog.findMany.mockResolvedValue([]);
  db.invoicePayment.count.mockResolvedValue(0);
  db.webhookEvent.count.mockResolvedValue(0);
});

describe("GET /api/integrations/metrics connection state", () => {
  it("does not count or show a CONNECTED Xero row with no organisation as connected", async () => {
    seed([row({ tenantId: null })]);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.integrations.connected).toBe(0);
    expect(body.integrations.byProvider.XERO.connected).toBe(false);
    expect(body.integrations.byProvider.XERO.status).not.toBe("CONNECTED");
  });

  it("still counts and shows a fully ready Xero row as connected", async () => {
    seed([row({})]);
    const { body } = await call();
    expect(body.integrations.connected).toBe(1);
    expect(body.integrations.byProvider.XERO).toMatchObject({ status: "CONNECTED", connected: true });
  });

  it("does not count a CONNECTED row without a stored access token", async () => {
    seed([row({ accessToken: null })]);
    const { body } = await call();
    expect(body.integrations.connected).toBe(0);
    expect(body.integrations.byProvider.XERO.connected).toBe(false);
  });

  it("never selects or returns token material", async () => {
    seed([row({})]);
    const { body } = await call();
    for (const q of queries) {
      expect(q.select?.accessToken).toBeUndefined();
      expect(q.select?.refreshToken).toBeUndefined();
    }
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });
});
