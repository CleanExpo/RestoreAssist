import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn() },
    inspectionWorkflow: { findUnique: vi.fn() },
    reportApproval: { findMany: vi.fn() },
    dryingGoalRecord: { findUnique: vi.fn() },
  },
}));

import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mLookup = lookupPortalAccount as unknown as ReturnType<typeof vi.fn>;
const mRate = applyRateLimit as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findFirst: ReturnType<typeof vi.fn> };
  inspectionWorkflow: { findUnique: ReturnType<typeof vi.fn> };
  reportApproval: { findMany: ReturnType<typeof vi.fn> };
  dryingGoalRecord: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mRate.mockResolvedValue(null);
  mLookup.mockResolvedValue({ clientId: "c_1" });
  p.inspection.findFirst.mockResolvedValue({
    id: "insp_1",
    status: "SCOPED",
    report: { id: "r_1", status: "DRAFT" },
    affectedAreas: [{ id: "area_1", roomZoneId: "Master Bedroom" }],
    moistureReadings: [
      {
        location: "Master Bedroom",
        surfaceType: "plasterboard",
        moistureLevel: 1.2,
        recordedAt: new Date("2026-06-30T00:00:00Z"),
      },
    ],
  });
  p.inspectionWorkflow.findUnique.mockResolvedValue({ submissionScore: 80 });
  p.reportApproval.findMany.mockResolvedValue([
    { id: "ra_1", approvalType: "SCOPE_OF_WORK" },
  ]);
  p.dryingGoalRecord.findUnique.mockResolvedValue(null);
});

const req = () =>
  new NextRequest("http://localhost/api/portal/tok/updates", { method: "GET" });
const params = { params: Promise.resolve({ token: "tok" }) };

describe("GET /api/portal/[token]/updates", () => {
  it("404 on an invalid/expired link", async () => {
    mLookup.mockResolvedValueOnce(null);
    expect((await GET(req(), params)).status).toBe(404);
  });

  it("returns the client-safe feed scoped to the token's client", async () => {
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect(p.inspection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { report: { clientId: "c_1" } },
      }),
    );
    const feed = (await res.json()).data;
    expect(feed.currentStep).toBe("Scope prepared");
    expect(feed.progressPct).toBe(80); // from submissionScore
    expect(feed.reportReady).toBe(false);
    expect(feed.pendingApprovals[0].label).toBe("Scope of works");
  });

  it("404 when the client has no claim", async () => {
    p.inspection.findFirst.mockResolvedValueOnce(null);
    expect((await GET(req(), params)).status).toBe(404);
  });

  it("includes the curated per-area drying timeline with no raw moisture values", async () => {
    const res = await GET(req(), params);
    const feed = (await res.json()).data;
    expect(feed.dryingTimeline).toEqual([
      {
        areaId: "area_1",
        areaLabel: "Master Bedroom",
        status: "on-track",
        estimateLabel: "Estimate: drying complete for this area.",
      },
    ]);
    const serialized = JSON.stringify(feed.dryingTimeline);
    expect(serialized).not.toContain("1.2"); // the raw moistureLevel reading
  });
});
