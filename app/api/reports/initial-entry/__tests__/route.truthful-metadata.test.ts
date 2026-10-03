import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), clientFind: vi.fn(), clientCreate: vi.fn(),
  clientUpdate: vi.fn(), create: vi.fn(), reportFind: vi.fn(), reportUpdate: vi.fn(),
  deduct: vi.fn(), refund: vi.fn(), firstSaved: vi.fn(),
  transaction: vi.fn(), inspectionFind: vi.fn(), inspectionUpdate: vi.fn(), inspectionWrite: vi.fn(),
  idemComplete: vi.fn(), idemFind: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: mocks.transaction,
  user: { findUnique: mocks.user },
  client: { findFirst: mocks.clientFind, create: mocks.clientCreate, update: mocks.clientUpdate },
  report: { create: mocks.create, findFirst: mocks.reportFind, update: mocks.reportUpdate },
  inspection: { findFirst: mocks.inspectionFind, updateMany: mocks.inspectionUpdate },
  idempotencyRecord: { updateMany: mocks.idemComplete, findUnique: mocks.idemFind },
} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/idempotency", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/idempotency")>(),
  withIdempotency: async (
    request: { text: () => Promise<string> }, _id: string, callback: (body: string) => unknown,
  ) => callback(await request.text()),
}));
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: async () => ({ allowed: true }), deductCreditsAndTrackUsage: mocks.deduct,
  refundCreditsAndTrackUsage: mocks.refund,
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({ recordFirstReportSaved: mocks.firstSaved }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ resolveReportFinancialReach: vi.fn(), resolveInspectionWrite: mocks.inspectionWrite }));
vi.mock("@/lib/services/ai/generate-enhanced-report", () => ({
  enhancedReportJurisdiction: vi.fn(), resolveEnhancedReportStateInfo: vi.fn(),
}));

import { GET, POST } from "../route";
import { PUT } from "../../[id]/route";

const base = { clientName: "Synthetic Client", propertyAddress: "1 Test Street",
  propertyPostcode: "4000", technicianFieldReport: "Synthetic attendance notes." };
const request = (body: unknown, method = "POST") => new NextRequest("http://localhost/api/reports/initial-entry", {
  method, body: JSON.stringify(body), headers: {
    "content-type": "application/json", "Idempotency-Key": "report-initial-synthetic-key",
  },
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
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    report: { create: mocks.create }, inspection: { updateMany: mocks.inspectionUpdate },
    client: { findFirst: mocks.clientFind, create: mocks.clientCreate, update: mocks.clientUpdate },
    idempotencyRecord: { updateMany: mocks.idemComplete },
  }));
  mocks.idemComplete.mockResolvedValue({ count: 1 });
  mocks.idemFind.mockResolvedValue(null);
  mocks.inspectionWrite.mockResolvedValue({ ok: true, data: { inspectionManyWhere: { id: "synthetic-inspection" } } });
  mocks.inspectionFind.mockResolvedValue({ id: "synthetic-inspection", propertyAddress: "1 Test Street", propertyPostcode: "4000" });
  mocks.inspectionUpdate.mockResolvedValue({ count: 1 });
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
  it("creates a draft without inventing a technician observation", async () => {
    const { technicianFieldReport: _omitted, ...withoutFieldReport } = base;
    const response = await POST(request(withoutFieldReport));
    expect(response.status).toBe(200);
    expect(mocks.create.mock.calls[0][0].data.technicianFieldReport).toBeNull();
  });
  it("keeps an actual supplied technician report", async () => {
    expect((await saved()).technicianFieldReport).toBe(base.technicianFieldReport);
  });
  it("stores absent meth screening as unknown and no positive mould finding", async () => {
    const data = await saved();
    expect(data.methamphetamineScreen).toBeNull();
    expect(data.biologicalMouldDetected).toBe(false);
    expect(data.biologicalMouldCategory).toBeNull();
  });
  it("preserves an explicitly recorded screen and detected mould", async () => {
    const data = await saved({ methamphetamineScreen: "POSITIVE", biologicalMouldDetected: true, biologicalMouldCategory: "CAT 2" });
    expect(data.methamphetamineScreen).toBe("POSITIVE");
    expect(data.biologicalMouldDetected).toBe(true);
    expect(data.biologicalMouldCategory).toBe("CAT 2");
  });
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
  it("rolls back the whole report transaction if client creation fails", async () => {
    mocks.clientCreate.mockRejectedValue({ code: "P2002" });
    const response = await POST(request({ ...base, clientContactDetails: "known@example.test" }));
    expect(response.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
  it("rolls back the whole report transaction if client detail update fails", async () => {
    mocks.clientFind.mockResolvedValue({ id: "known-client", email: "known@example.test", phone: null, address: null });
    mocks.clientUpdate.mockRejectedValue(new Error("synthetic update failure"));
    const response = await POST(request(base));
    expect(response.status).toBe(500);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
  it("preserves authorisation and refuses creation without a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request(base))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.clientFind).not.toHaveBeenCalled();
    expect(mocks.clientCreate).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("creates nothing when the existing atomic credit check refuses the charge", async () => {
    mocks.deduct.mockRejectedValue(new Error("INSUFFICIENT_CREDITS"));
    expect((await POST(request(base))).status).toBe(402);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.clientFind).not.toHaveBeenCalled();
    expect(mocks.clientCreate).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("rolls back the charge with a failed report insert", async () => {
    mocks.create.mockRejectedValue(new Error("synthetic write failure"));
    expect((await POST(request(base))).status).toBe(500);
    expect(mocks.deduct).toHaveBeenCalledOnce();
    expect(mocks.deduct.mock.calls[0][1]).toBeDefined();
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("refuses an already linked job before charging or creating", async () => {
    mocks.inspectionFind.mockResolvedValue(null);
    expect((await POST(request({ ...base, inspectionId: "synthetic-inspection" }))).status).toBe(409);
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("refuses a colleague-owned job before charging or creating", async () => {
    mocks.inspectionWrite.mockResolvedValue({ ok: true, data: { inspectionManyWhere: { id: "synthetic-inspection" } } });
    mocks.inspectionFind.mockResolvedValue(null);
    expect((await POST(request({ ...base, inspectionId: "synthetic-inspection" }))).status).toBe(409);
    expect(mocks.deduct).not.toHaveBeenCalled();
  });
  it("rolls back a concurrent link or property change and its charge", async () => {
    mocks.inspectionUpdate.mockResolvedValue({ count: 0 });
    expect((await POST(request({ ...base, inspectionId: "synthetic-inspection" }))).status).toBe(409);
    expect(mocks.deduct).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.clientFind).toHaveBeenCalledOnce();
    expect(mocks.inspectionUpdate.mock.calls[0][0].where.AND[1]).toEqual({
      userId: "synthetic-owner", reportId: null,
      propertyAddress: "1 Test Street", propertyPostcode: "4000",
    });
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("links the matching owner job in the same transaction", async () => {
    const response = await POST(request({ ...base, inspectionId: "synthetic-inspection" }));
    expect(response.status).toBe(200);
    expect((await response.json()).inspectionLinked).toBe(true);
    expect(mocks.inspectionUpdate).toHaveBeenCalledOnce();
    expect(mocks.deduct.mock.calls[0][1]).toBeDefined();
  });
  it("completes the owner-scoped success cache inside the charge and report transaction", async () => {
    expect((await POST(request(base))).status).toBe(200);
    expect(mocks.idemComplete).toHaveBeenCalledOnce();
    const args = mocks.idemComplete.mock.calls[0][0];
    expect(args.where).toMatchObject({
      cacheKey: "idem:synthetic-owner:report-initial-synthetic-key",
      scope: "synthetic-owner", key: "report-initial-synthetic-key", status: "PENDING",
    });
    expect(args.where.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(args.data.status).toBe("COMPLETE");
    expect(JSON.parse(args.data.responseBody).report.id).toBe("synthetic-report");
    expect(mocks.deduct.mock.calls[0][1]).toBeDefined();
  });
  it("accepts an existing caller's valid unprefixed key for a charged report", async () => {
    const legacyKey = "legacy-valid-key";
    const response = await POST(new NextRequest("http://localhost/api/reports/initial-entry", {
      method: "POST", body: JSON.stringify(base),
      headers: { "content-type": "application/json", "Idempotency-Key": legacyKey },
    }));
    expect(response.status).toBe(200);
    expect(mocks.idemComplete.mock.calls[0][0].where.cacheKey).toBe(`idem:synthetic-owner:${legacyKey}`);
  });
  it("rolls back a charge and report when the reserved fingerprint cannot be completed", async () => {
    let committedReports = 0;
    let committedCharges = 0;
    mocks.idemComplete.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      let pendingReports = 0;
      let pendingCharges = 0;
      const tx = {
        report: { create: async () => { pendingReports++; return { id: "synthetic-report" }; } },
        client: { findFirst: mocks.clientFind, create: mocks.clientCreate, update: mocks.clientUpdate },
        inspection: { updateMany: mocks.inspectionUpdate },
        idempotencyRecord: { updateMany: mocks.idemComplete },
      };
      mocks.deduct.mockImplementationOnce(async () => { pendingCharges++; });
      const result = await callback(tx);
      committedReports += pendingReports;
      committedCharges += pendingCharges;
      return result;
    });
    expect((await POST(request(base))).status).toBe(409);
    expect(committedReports).toBe(0);
    expect(committedCharges).toBe(0);
  });
  it("reads a committed result only within the signed-in owner scope", async () => {
    mocks.idemFind.mockResolvedValue({
      scope: "another-owner", key: "report-initial-synthetic-key", status: "COMPLETE",
      responseStatus: 200, responseBody: JSON.stringify({ initialEntry: true, report: { id: "synthetic-report" } }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const response = await GET(new NextRequest("http://localhost/api/reports/initial-entry", {
      headers: { "Idempotency-Key": "report-initial-synthetic-key" },
    }));
    expect((await response.json()).state).toBe("missing");
    expect(mocks.reportFind).not.toHaveBeenCalled();
  });
  it("offers same-key retry only for a fresh absent record, never an expired one", async () => {
    const key = `report-initial-${Date.now()}-123e4567-e89b-42d3-a456-426614174000`;
    const get = () => new NextRequest("http://localhost/api/reports/initial-entry", {
      headers: { "Idempotency-Key": key },
    });
    expect(await (await GET(get())).json()).toEqual({ state: "retryable_missing" });
    mocks.idemFind.mockResolvedValueOnce({
      scope: "synthetic-owner", key, status: "PENDING", responseStatus: null,
      responseBody: null, expiresAt: new Date(Date.now() - 1000),
    });
    expect(await (await GET(get())).json()).toEqual({ state: "retryable_missing" });
    mocks.idemFind.mockResolvedValueOnce({
      scope: "synthetic-owner", key, status: "COMPLETE", responseStatus: 200,
      responseBody: JSON.stringify({ initialEntry: true, report: { id: "synthetic-report" } }),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await (await GET(get())).json()).toEqual({ state: "missing" });
  });
  it("recovers a committed standalone report for its owner", async () => {
    mocks.idemFind.mockResolvedValue({
      scope: "synthetic-owner", key: "report-initial-synthetic-key", status: "COMPLETE",
      responseStatus: 200, responseBody: JSON.stringify({ initialEntry: true, report: { id: "synthetic-report" } }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const get = new NextRequest("http://localhost/api/reports/initial-entry", {
      headers: { "Idempotency-Key": "report-initial-synthetic-key" },
    });
    expect(await (await GET(get)).json()).toEqual({ state: "complete", reportId: "synthetic-report" });
  });
  it("does not confuse a same-key result from another route with initial entry", async () => {
    mocks.idemFind.mockResolvedValue({
      scope: "synthetic-owner", key: "report-initial-synthetic-key", status: "COMPLETE",
      responseStatus: 200, responseBody: JSON.stringify({ report: { id: "synthetic-report" } }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const get = new NextRequest("http://localhost/api/reports/initial-entry", {
      headers: { "Idempotency-Key": "report-initial-synthetic-key" },
    });
    expect((await (await GET(get)).json()).state).toBe("unconfirmed");
    expect(mocks.reportFind).not.toHaveBeenCalled();
  });
  it("does not recover a report without the requested inspection link", async () => {
    mocks.idemFind.mockResolvedValue({
      scope: "synthetic-owner", key: "report-initial-synthetic-key", status: "COMPLETE",
      responseStatus: 200, responseBody: JSON.stringify({ initialEntry: true, report: { id: "synthetic-report" } }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.inspectionFind.mockResolvedValue(null);
    const get = new NextRequest("http://localhost/api/reports/initial-entry?inspectionId=synthetic-inspection", {
      headers: { "Idempotency-Key": "report-initial-synthetic-key" },
    });
    expect((await (await GET(get)).json()).state).toBe("unconfirmed");
  });
  it("does not turn a committed report into a retryable 500 if analytics fails", async () => {
    mocks.firstSaved.mockRejectedValue(new Error("synthetic analytics failure"));
    expect((await POST(request(base))).status).toBe(200);
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
