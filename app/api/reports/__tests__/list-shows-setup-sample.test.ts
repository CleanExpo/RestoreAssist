/**
 * RA-7711 — the setup demo client and report (app/api/setup/activate,
 * lib/demo-data, marked isSample since RA-1239) are what the first-run tour
 * opens, and the user deletes them from the Clients and Reports pages. Those
 * pages and the dashboard read GET /api/reports and GET /api/clients, so
 * neither list handler may filter on isSample: lists behave as on main.
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

describe("list handlers keep the setup sample visible (RA-7711)", () => {
  it("GET /api/reports does not filter on isSample", async () => {
    const res = await getReports(new NextRequest("http://localhost/api/reports?limit=40"));
    expect(res.status).toBe(200);
    expect(reportFindMany.mock.calls[0][0].where).not.toHaveProperty("isSample");
    expect(reportCount.mock.calls[0][0].where).not.toHaveProperty("isSample");
    // Tenancy is untouched.
    expect(reportFindMany.mock.calls[0][0].where.AND).toEqual(TENANCY.AND);
  });

  it("GET /api/clients does not filter on isSample", async () => {
    const res = await getClients(new NextRequest("http://localhost/api/clients"));
    expect(res.status).toBe(200);
    expect(clientFindMany.mock.calls[0][0].where).not.toHaveProperty("isSample");
    expect(clientCount.mock.calls[0][0].where).not.toHaveProperty("isSample");
    expect(clientFindMany.mock.calls[0][0].where.AND).toEqual(TENANCY.AND);
  });
});
