import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), clientFind: vi.fn(), clientCreate: vi.fn(),
  clientUpdate: vi.fn(), create: vi.fn(), reportFind: vi.fn(), reportUpdate: vi.fn(),
  deduct: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.user },
  client: { findFirst: mocks.clientFind, create: mocks.clientCreate, update: mocks.clientUpdate },
  report: { create: mocks.create, findFirst: mocks.reportFind, update: mocks.reportUpdate },
} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: async (
  request: { text: () => Promise<string> }, _id: string, callback: (body: string) => unknown,
) => callback(await request.text()) }));
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: async () => ({ allowed: true }), deductCreditsAndTrackUsage: mocks.deduct,
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({ recordFirstReportSaved: async () => undefined }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ resolveReportFinancialReach: vi.fn(), resolveInspectionWrite: vi.fn() }));
vi.mock("@/lib/services/ai/generate-enhanced-report", () => ({
  enhancedReportJurisdiction: vi.fn(), resolveEnhancedReportStateInfo: vi.fn(),
}));

import { POST } from "../route";
import { PUT } from "../../[id]/route";

const base = { clientName: "Synthetic Client", propertyAddress: "1 Test Street",
  propertyPostcode: "4000", technicianFieldReport: "Synthetic attendance notes." };
const request = (body: unknown, method = "POST") => new NextRequest("http://localhost/api/reports/initial-entry", {
  method, body: JSON.stringify(body), headers: { "content-type": "application/json" },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "synthetic-owner" } });
  mocks.user.mockResolvedValue({ id: "synthetic-owner", subscriptionStatus: "TRIAL" });
  mocks.clientFind.mockResolvedValue(null);
  mocks.clientCreate.mockResolvedValue({ id: "synthetic-client" });
  mocks.create.mockResolvedValue({ id: "synthetic-report" });
  mocks.deduct.mockResolvedValue(undefined);
  mocks.reportFind.mockResolvedValue({ id: "synthetic-report", userId: "synthetic-owner", inspectionDate: null });
  mocks.reportUpdate.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "synthetic-report", ...data as object }));
});

async function saved(extra: Record<string, unknown> = {}) {
  const response = await POST(request({ ...base, ...extra }));
  expect(response.status).toBe(200);
  expect(mocks.create).toHaveBeenCalledOnce();
  return mocks.create.mock.calls[0][0].data;
}

describe("truthful initial-entry metadata", () => {
  it("keeps attendance unknown when no date was supplied", async () => {
    expect((await saved()).inspectionDate).toBeNull();
  });
  it("keeps incident date separate from unknown attendance", async () => {
    const data = await saved({ incidentDate: "2026-10-01" });
    expect(data.inspectionDate).toBeNull();
    expect(data.incidentDate).toEqual(new Date("2026-10-01"));
  });
  it("does not invent attendance when the supplied date is invalid", async () => {
    const data = await saved({ technicianAttendanceDate: "not-a-date", incidentDate: "2026-10-01" });
    expect(data.inspectionDate).toBeNull();
    expect(data.technicianAttendanceDate).toBeNull();
  });
  it("preserves valid attendance and separate incident dates", async () => {
    const data = await saved({ technicianAttendanceDate: "2026-10-02T09:15:00Z", incidentDate: "2026-10-01" });
    expect(data.inspectionDate).toEqual(new Date("2026-10-02T09:15:00Z"));
    expect(data.technicianAttendanceDate).toEqual(data.inspectionDate);
    expect(data.incidentDate).toEqual(new Date("2026-10-01"));
  });
  it("stores unspecified insurance without claiming building or contents coverage", async () => {
    expect((await saved()).insuranceType).toBe("");
  });
  it("preserves authorisation and refuses creation without a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request(base))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
  });
  it("creates nothing when the existing atomic credit check refuses the charge", async () => {
    mocks.deduct.mockRejectedValue(new Error("INSUFFICIENT_CREDITS"));
    expect((await POST(request(base))).status).toBe(402);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("existing PUT attendance contract", () => {
  it("accepts null for an unknown stored date and retains creator scope", async () => {
    const response = await PUT(request({ inspectionDate: null, insuranceType: "" }, "PUT"), {
      params: Promise.resolve({ id: "synthetic-report" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.reportUpdate).toHaveBeenCalledOnce();
    expect(mocks.reportUpdate.mock.calls[0][0].data.inspectionDate).toBeNull();
    expect(mocks.reportUpdate.mock.calls[0][0].where).toEqual({ id: "synthetic-report", userId: "synthetic-owner" });
  });
  it("explicitly rejects clearing a known date with the existing empty-string request", async () => {
    const date = new Date("2026-09-01T09:00:00Z");
    mocks.reportFind.mockResolvedValue({ id: "synthetic-report", inspectionDate: date });
    const response = await PUT(request({ inspectionDate: "" }, "PUT"), { params: Promise.resolve({ id: "synthetic-report" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("inspectionDate");
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
  });
});
