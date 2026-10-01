import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), clientFind: vi.fn(), clientCreate: vi.fn(),
  clientUpdate: vi.fn(), create: vi.fn(), reportFind: vi.fn(), reportUpdate: vi.fn(),
  deduct: vi.fn(), refund: vi.fn(), firstSaved: vi.fn(),
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
  refundCreditsAndTrackUsage: mocks.refund,
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({ recordFirstReportSaved: mocks.firstSaved }));
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
  mocks.refund.mockResolvedValue({ refunded: true });
  mocks.firstSaved.mockResolvedValue(undefined);
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
  it("does not create a colliding blank-email client and clearly reports the missing link", async () => {
    const response = await POST(request(base));
    expect(response.status).toBe(200);
    expect(mocks.clientFind.mock.calls[0][0].where.OR).toEqual([{ name: "Synthetic Client" }]);
    expect(mocks.clientCreate).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0].data.clientId).toBeNull();
    expect((await response.json()).clientLinkWarning).toMatch(/without a client link/);
  });
  it("allows distinct no-email reports without creating duplicate blank-email clients", async () => {
    const first = await POST(request(base));
    const second = await POST(request({ ...base, clientName: "Another Synthetic Client" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.clientCreate).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("uses a provided client email for the existing name-or-email lookup", async () => {
    await saved({ clientContactDetails: "Contact known@example.test" });
    expect(mocks.clientFind.mock.calls[0][0].where.OR).toEqual([
      { name: "Synthetic Client" }, { email: "known@example.test" },
    ]);
    expect(mocks.clientCreate.mock.calls[0][0].data.email).toBe("known@example.test");
  });
  it("retains a matched client's real email when intake provides none", async () => {
    mocks.clientFind.mockResolvedValue({ id: "known-client", email: "known@example.test", phone: null, address: null });
    const data = await saved();
    expect(mocks.clientUpdate.mock.calls[0][0].data.email).toBe("known@example.test");
    expect(data.clientId).toBe("known-client");
    expect(mocks.clientCreate).not.toHaveBeenCalled();
  });
  it("surfaces a client-link warning if creation with a provided email fails", async () => {
    mocks.clientCreate.mockRejectedValue({ code: "P2002" });
    const response = await POST(request({ ...base, clientContactDetails: "known@example.test" }));
    expect(response.status).toBe(200);
    expect(mocks.create.mock.calls[0][0].data.clientId).toBeNull();
    expect((await response.json()).clientLinkWarning).toMatch(/without a client link/);
  });
  it("describes an existing link honestly when client detail update fails", async () => {
    mocks.clientFind.mockResolvedValue({ id: "known-client", email: "known@example.test", phone: null, address: null });
    mocks.clientUpdate.mockRejectedValue(new Error("synthetic update failure"));
    const response = await POST(request(base));
    expect(response.status).toBe(200);
    expect(mocks.create.mock.calls[0][0].data.clientId).toBe("known-client");
    expect((await response.json()).clientLinkWarning).toMatch(/linked.*details.*not updated/i);
  });
  it("preserves authorisation and refuses creation without a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request(base))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("creates nothing when the existing atomic credit check refuses the charge", async () => {
    mocks.deduct.mockRejectedValue(new Error("INSUFFICIENT_CREDITS"));
    expect((await POST(request(base))).status).toBe(402);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("refunds once when the charged report cannot be persisted", async () => {
    mocks.create.mockRejectedValue(new Error("synthetic write failure"));
    expect((await POST(request(base))).status).toBe(500);
    expect(mocks.deduct).toHaveBeenCalledOnce();
    expect(mocks.refund).toHaveBeenCalledExactlyOnceWith("synthetic-owner");
  });
  it("returns the original failure when compensation fails", async () => {
    mocks.create.mockRejectedValue(new Error("synthetic write failure"));
    mocks.refund.mockRejectedValue(new Error("synthetic refund failure"));
    expect((await POST(request(base))).status).toBe(500);
    expect(mocks.refund).toHaveBeenCalledOnce();
  });
  it("does not refund a persisted report if a later side effect fails", async () => {
    mocks.firstSaved.mockRejectedValue(new Error("synthetic analytics failure"));
    expect((await POST(request(base))).status).toBe(500);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.refund).not.toHaveBeenCalled();
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
