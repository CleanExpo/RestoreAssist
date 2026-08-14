/**
 * Integration health must not report a vacuous pass.
 *
 * With zero IntegrationSyncLog rows in the window the success rate was
 * previously substituted with 100 and reported as "pass" — a green tick that
 * read identically to a genuinely healthy connector. Absence of receipts is an
 * unverified state, so the check reports "unverified" and is counted apart
 * from the passes in the summary.
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

function request() {
  return new NextRequest("http://localhost/api/integrations/health");
}

async function getChecks(): Promise<{
  status: string;
  checks: { name: string; status: string; message: string; details?: any }[];
  summary: Record<string, number>;
}> {
  const res = await GET(request());
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  db.integration.findMany.mockResolvedValue([]);
  db.webhookEvent.count.mockResolvedValue(0);
  db.integrationSyncLog.findMany.mockResolvedValue([]);
  db.ascoraIntegration.findUnique.mockResolvedValue(null);
  db.drNrpgIntegration.findUnique.mockResolvedValue(null);
});

describe("GET /api/integrations/health — sync receipts", () => {
  it("reports the sync check as unverified, not pass, when there are zero receipts", async () => {
    const body = await getChecks();
    const syncCheck = body.checks.find((c) => c.name === "Sync Success Rate");

    expect(syncCheck).toBeDefined();
    expect(syncCheck!.status).toBe("unverified");
    expect(syncCheck!.status).not.toBe("pass");
    expect(syncCheck!.message).toMatch(/unverified/i);
    expect(syncCheck!.details.total).toBe(0);
  });

  it("does not count an unverified check as passed in the summary", async () => {
    const body = await getChecks();

    const passedNames = body.checks
      .filter((c) => c.status === "pass")
      .map((c) => c.name);

    expect(passedNames).not.toContain("Sync Success Rate");
    expect(body.summary.passed).toBe(passedNames.length);
    expect(body.summary.unverified).toBe(1);
    expect(body.summary.total).toBe(body.checks.length);
  });

  it("reports the run itself as unverified rather than healthy when nothing has synced yet", async () => {
    const body = await getChecks();

    // Not "degraded" — nothing failed. Not "healthy" either: a run that
    // measured nothing must not return the same word as a run that measured
    // everything and passed.
    expect(body.status).toBe("unverified");
  });

  it("lets a real failure take precedence over an unverified check", async () => {
    // Zero sync receipts (unverified) plus an integration stuck in ERROR for
    // >24h. The measured failure wins; "unverified" never masks it.
    db.integration.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { provider: "XERO", updatedAt: new Date("2020-01-01") },
      ]);

    const body = await getChecks();

    expect(body.status).toBe("unhealthy");
    expect(body.summary.unverified).toBe(1);
  });

  it("still reports a real pass once successful receipts exist", async () => {
    db.integrationSyncLog.findMany.mockResolvedValue([
      { status: "SUCCESS" },
      { status: "SUCCESS" },
    ]);

    const body = await getChecks();
    const syncCheck = body.checks.find((c) => c.name === "Sync Success Rate");

    expect(syncCheck!.status).toBe("pass");
    expect(syncCheck!.message).toMatch(/100% success rate \(2 syncs in 24h\)/);
    expect(body.summary.unverified).toBe(0);
  });

  it("still fails on a genuinely bad success rate", async () => {
    db.integrationSyncLog.findMany.mockResolvedValue([
      { status: "FAILED" },
      { status: "FAILED" },
      { status: "SUCCESS" },
    ]);

    const body = await getChecks();
    const syncCheck = body.checks.find((c) => c.name === "Sync Success Rate");

    expect(syncCheck!.status).toBe("fail");
    expect(body.status).not.toBe("healthy");
  });
});
