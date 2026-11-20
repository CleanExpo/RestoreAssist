/**
 * RA-8043 (21/10/2026): the claims board listed every tenant's claims to any
 * ADMIN, and every self-registered firm owner is an ADMIN, so one firm saw
 * another firm's property addresses. The board now uses the tenancy helper's
 * report reach.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const viewer = vi.hoisted(() => ({ role: "USER" }));
const reportReach = vi.hoisted(() => vi.fn());
const progressFindMany = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "u1", role: viewer.role } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportReach: (...a: unknown[]) => reportReach(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { claimProgress: { findMany: (...a: unknown[]) => progressFindMany(...a) } },
}));

import ClaimsIndexPage from "../page";

// The workspace reach the tenancy helper gives an admin of org-1.
const ORG_REACH = { AND: [{ OR: [{ userId: "u1" }, { user: { organizationId: "org-1" } }] }] };

// Active claims in two workspaces: org-1 (the viewer u1 and member u2) and org-9.
const rows = [
  { id: "cp-own", userId: "u1", org: "org-1", address: "1 Alpha Own St" },
  { id: "cp-member", userId: "u2", org: "org-1", address: "2 Alpha Member St" },
  { id: "cp-other", userId: "u9", org: "org-9", address: "9 Bravo Firm St" },
];

/** Applies the where the page sends, as the database would. */
const fakeDb = async (args: unknown) => {
  const report = (args as { where?: { report?: Record<string, unknown> } } | undefined)?.where?.report;
  const visible = rows.filter((r) =>
    report === undefined
      ? true
      : report.userId !== undefined
        ? r.userId === report.userId
        : JSON.stringify(report) === JSON.stringify(ORG_REACH)
          ? r.userId === "u1" || r.org === "org-1"
          : JSON.stringify(report) === "{}",
  );
  return visible.map((r) => ({
    id: r.id,
    reportId: `rep-${r.id}`,
    currentState: "DRYING_ACTIVE",
    version: 1,
    closedAt: null,
    managerReviewRequired: false,
    createdAt: new Date("2026-10-18T01:00:00Z"),
    updatedAt: new Date("2026-10-20T01:00:00Z"),
    report: { id: `rep-${r.id}`, propertyAddress: r.address, hazardType: "Water", title: null },
  }));
};

const whereSent = () => (progressFindMany.mock.calls[0]?.[0] as { where?: unknown } | undefined)?.where;

async function boardAs(role: string) {
  viewer.role = role;
  return renderToStaticMarkup(await ClaimsIndexPage());
}

beforeEach(() => {
  viewer.role = "USER";
  reportReach.mockReset().mockResolvedValue({ ok: true, data: ORG_REACH });
  progressFindMany.mockReset().mockImplementation(fakeDb);
});

describe("claims board scope (RA-8043)", () => {
  it("scopes a firm admin to their own workspace's claims, never another firm's [r8-c55]", async () => {
    const html = await boardAs("ADMIN");
    expect(whereSent()).toEqual({ report: ORG_REACH });
    expect(html).toContain("2 Alpha Member St");
    expect(html).not.toContain("9 Bravo Firm St");
  });

  it("gives platform-wide reach only when the tenancy helper grants it [r8-c55]", async () => {
    reportReach.mockResolvedValue({ ok: true, data: {} });
    const html = await boardAs("ADMIN");
    expect(whereSent()).toEqual({ report: {} });
    expect(html).toContain("9 Bravo Firm St");
  });

  it("scopes a non-admin to their own claims [r8-c55]", async () => {
    const html = await boardAs("USER");
    expect(whereSent()).toEqual({ report: { userId: "u1" } });
    expect(reportReach).not.toHaveBeenCalled();
    expect(html).toContain("1 Alpha Own St");
    expect(html).not.toContain("2 Alpha Member St");
    expect(html).not.toContain("9 Bravo Firm St");
  });

  it("falls back to the admin's own claims when the reach is refused [r8-c55]", async () => {
    reportReach.mockResolvedValue({ ok: false, status: 403, reason: "Forbidden" });
    const html = await boardAs("ADMIN");
    expect(whereSent()).toEqual({ report: { userId: "u1" } });
    expect(html).not.toContain("9 Bravo Firm St");
  });

  it("falls back to the admin's own claims when the reach throws [r8-c55]", async () => {
    reportReach.mockRejectedValue(new Error("db down"));
    const html = await boardAs("ADMIN");
    expect(whereSent()).toEqual({ report: { userId: "u1" } });
    expect(html).not.toContain("9 Bravo Firm St");
  });
});
