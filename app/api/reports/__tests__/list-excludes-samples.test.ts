/**
 * RA-7711 (A2) — sample rows (isSample = true) must not reach the dashboard
 * counts or the Clients / Reports lists. The dashboard derives its counts
 * from GET /api/reports and GET /api/clients (app/dashboard/page.tsx), so
 * both list handlers, and the `count` each returns, exclude samples.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/get-api-session", () => ({
  getApiSession: async () => ({ user: { id: "u1" } }),
}));
const TENANCY = { AND: [{ OR: [{ userId: "u1" }] }] };
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportReach: async () => ({ ok: true, data: TENANCY }),
  resolveClientReach: async () => ({ ok: true, data: TENANCY }),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    new Response(JSON.stringify({ error: o.message }), { status: o.status }),
  fromException: (_r: unknown, e: unknown) =>
    new Response(JSON.stringify({ error: String(e) }), { status: 500 }),
}));
vi.mock("@/lib/anthropic", () => ({ generateDetailedReport: vi.fn() }));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: vi.fn(),
  NoWorkspaceKeyError: class extends Error {},
}));

const reportFindMany = vi.fn();
const reportCount = vi.fn();
const clientFindMany = vi.fn();
const clientCount = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findMany: (...a: unknown[]) => reportFindMany(...a),
      count: (...a: unknown[]) => reportCount(...a),
      groupBy: vi.fn(async () => []),
    },
    client: {
      findMany: (...a: unknown[]) => clientFindMany(...a),
      count: (...a: unknown[]) => clientCount(...a),
    },
  },
}));

import { GET as getReports } from "../route";
import { GET as getClients } from "../../clients/route";

beforeEach(() => {
  vi.clearAllMocks();
  reportFindMany.mockResolvedValue([]);
  reportCount.mockResolvedValue(0);
  clientFindMany.mockResolvedValue([]);
  clientCount.mockResolvedValue(0);
});

describe("list handlers exclude sample rows (RA-7711)", () => {
  it("GET /api/reports lists and counts non-sample reports only", async () => {
    const res = await getReports(new NextRequest("http://localhost/api/reports?limit=40"));
    expect(res.status).toBe(200);
    expect(reportFindMany.mock.calls[0][0].where.isSample).toBe(false);
    expect(reportCount.mock.calls[0][0].where.isSample).toBe(false);
    // Tenancy is untouched.
    expect(reportFindMany.mock.calls[0][0].where.AND).toEqual(TENANCY.AND);
  });

  it("GET /api/clients lists and counts non-sample clients only", async () => {
    const res = await getClients(new NextRequest("http://localhost/api/clients"));
    expect(res.status).toBe(200);
    expect(clientFindMany.mock.calls[0][0].where.isSample).toBe(false);
    expect(clientCount.mock.calls[0][0].where.isSample).toBe(false);
    expect(clientFindMany.mock.calls[0][0].where.AND).toEqual(TENANCY.AND);
  });
});
