/**
 * RA-8043c (21/10/2026): routes that return platform-wide data, or start a
 * platform action, were gated on `role: "ADMIN"` alone. Every self-registered
 * firm owner is an ADMIN, so any firm could read every firm's figures. They
 * now also require the platform support allowlist (or, for store assets, the
 * store publishing allowlist).
 *
 * The real admin-auth gates run; prisma is a recorder, so a refused call must
 * leave no platform query behind.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ id: "firm_owner_a" }));
const calls = vi.hoisted(() => [] as string[]);

vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: viewer.id, role: "ADMIN" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/connections/status", () => ({
  buildRestoreAssistConnectionStatus: () => {
    calls.push("connections.status");
    return { ok: true };
  },
  buildRestoreAssistConnectionStatusWithProbes: async () => {
    calls.push("connections.probe");
    return { ok: true };
  },
}));
vi.mock("@/lib/prisma", () => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => async () => {
          if (name === "user" && method === "findUnique") {
            return { id: viewer.id, role: "ADMIN", organizationId: "org_a" };
          }
          calls.push(`${name}.${method}`);
          return method === "count" ? 0 : [];
        },
      },
    );
  return {
    prisma: new Proxy({}, { get: (_t, name: string) => model(name) }),
  };
});

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  calls.length = 0;
  viewer.id = "firm_owner_a";
  delete process.env.PLATFORM_SUPPORT_USER_IDS;
  delete process.env.STORE_PUBLISHING_OPERATOR_USER_IDS;
  delete process.env.CONNECTIONS_STATUS_TOKEN;
});

describe("platform-only routes refuse a firm owner (RA-8043c)", () => {
  it("override governance reports [ra-8043c]", async () => {
    const { GET } = await import("../progress/governance/route");
    const res = await GET(req("/api/progress/governance"));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("activation funnel counts [ra-8043c]", async () => {
    const { GET } = await import("../analytics/activation-funnel/route");
    const res = await GET(req("/api/analytics/activation-funnel"));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("cron run history [ra-8043c]", async () => {
    const { GET } = await import("../admin/cron-runs/route");
    const res = await GET(req("/api/admin/cron-runs"));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("restoration insights [ra-8043c]", async () => {
    const { GET } = await import("../admin/restoration-insights/route");
    const res = await GET(req("/api/admin/restoration-insights"));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("restoration insights annual report [ra-8043c]", async () => {
    const { GET } = await import(
      "../admin/restoration-insights/annual-report/route"
    );
    const res = await GET(req("/api/admin/restoration-insights/annual-report"));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("beta signup totals [ra-8043c]", async () => {
    const { GET } = await import("../mobile/beta-signup/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("connection status manifest, including live probes [ra-8043c]", async () => {
    const { GET } = await import("../v1/connections/status/route");
    const res = await GET(req("/api/v1/connections/status?probe=1"));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("gate-check records list [ra-8043c]", async () => {
    const { GET } = await import("../harness/gate-check/route");
    const res = await GET(req("/api/harness/gate-check"));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("prompt evaluation on the platform AI key [ra-8043c]", async () => {
    const { POST } = await import("../admin/evaluation/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/evaluation", {
        method: "POST",
        body: JSON.stringify({ promptOverride: "x" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("prompt optimiser on the platform AI key [ra-8043c]", async () => {
    const { POST } = await import("../admin/optimize-prompts/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/optimize-prompts", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("platform cron job list [ra-8043c]", async () => {
    const { GET } = await import("../admin/cron-jobs/route");
    const res = await GET(req("/api/admin/cron-jobs"));
    expect(res.status).toBe(403);
  });

  it("store asset generation status [ra-8043c]", async () => {
    const { GET } = await import("../admin/publish/assets/route");
    const res = await GET(req("/api/admin/publish/assets"));
    expect(res.status).toBe(403);
  });
});

describe("platform support staff still get through", () => {
  beforeEach(() => {
    viewer.id = "staff_1";
    process.env.PLATFORM_SUPPORT_USER_IDS = "staff_1";
  });

  it("override governance reports", async () => {
    const { GET } = await import("../progress/governance/route");
    const res = await GET(req("/api/progress/governance"));
    expect(res.status).toBe(200);
    expect(calls).toContain("overrideGovernanceReport.findMany");
  });

  it("cron run history", async () => {
    const { GET } = await import("../admin/cron-runs/route");
    const res = await GET(req("/api/admin/cron-runs"));
    expect(res.status).toBe(200);
    expect(calls).toContain("cronJobRun.findMany");
  });

  it("connection status manifest", async () => {
    const { GET } = await import("../v1/connections/status/route");
    const res = await GET(req("/api/v1/connections/status"));
    expect(res.status).toBe(200);
    expect(calls).toEqual(["connections.status"]);
  });
});
