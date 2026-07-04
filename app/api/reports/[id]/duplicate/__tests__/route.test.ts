/**
 * RA-6982 — POST /api/reports/[id]/duplicate charges BEFORE creating.
 *
 * The old flow created the duplicate report first and deducted the credit
 * afterwards inside a try/catch that only console.error'd the throw. At-cap, or
 * in the race window past the advisory canCreateReport gate, the deduct threw
 * INSUFFICIENT_CREDITS, the throw was swallowed, and the user kept a free copy.
 *
 * The compliant flow: charge (atomic) first, map INSUFFICIENT_CREDITS to 402
 * and create NO report row; on a post-charge create failure, refund exactly
 * once and re-raise.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const withIdempotency = vi.fn();
const reportFindFirst = vi.fn();
const reportCreate = vi.fn();
const canCreateReport = vi.fn();
const deductCreditsAndTrackUsage = vi.fn();
const refundCreditsAndTrackUsage = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    req: Request,
    userId: string,
    fn: () => Promise<Response>,
  ) => withIdempotency(req, userId, fn),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...args: unknown[]) => reportFindFirst(...args),
      create: (...args: unknown[]) => reportCreate(...args),
    },
  },
}));
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: (...args: unknown[]) => canCreateReport(...args),
  deductCreditsAndTrackUsage: (...args: unknown[]) =>
    deductCreditsAndTrackUsage(...args),
  refundCreditsAndTrackUsage: (...args: unknown[]) =>
    refundCreditsAndTrackUsage(...args),
}));

import { POST } from "../route";

function makeRequest() {
  return new NextRequest("http://localhost/api/reports/src-1/duplicate", {
    method: "POST",
  });
}

function makeParams(id = "src-1") {
  return { params: Promise.resolve({ id }) };
}

const originalReport = {
  id: "src-1",
  title: "Kitchen flood",
  clientName: "Client",
  propertyAddress: "1 Test St",
  hazardType: "Water",
  insuranceType: "Building and Contents Insurance",
  clientId: null,
  waterCategory: null,
  waterClass: null,
  sourceOfWater: null,
  affectedArea: null,
  safetyHazards: null,
  structuralDamage: null,
  contentsDamage: null,
  hvacAffected: null,
  electricalHazards: null,
  microbialGrowth: null,
  dehumidificationCapacity: null,
  airmoversCount: null,
  targetHumidity: null,
  targetTemperature: null,
  estimatedDryingTime: null,
  equipmentPlacement: null,
  psychrometricReadings: null,
  moistureReadings: null,
  safetyPlan: null,
  containmentSetup: null,
  decontaminationProcedures: null,
  postRemediationVerification: null,
  propertyCover: null,
  contentsCover: null,
  liabilityCover: null,
  businessInterruption: null,
  additionalCover: null,
  description: null,
};

beforeEach(() => {
  getServerSession.mockReset();
  withIdempotency.mockReset();
  reportFindFirst.mockReset();
  reportCreate.mockReset();
  canCreateReport.mockReset();
  deductCreditsAndTrackUsage.mockReset();
  refundCreditsAndTrackUsage.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  withIdempotency.mockImplementation(
    (_req: Request, _userId: string, fn: () => Promise<Response>) => fn(),
  );
  reportFindFirst.mockResolvedValue(originalReport);
  canCreateReport.mockResolvedValue({ allowed: true });
  deductCreditsAndTrackUsage.mockResolvedValue(undefined);
  refundCreditsAndTrackUsage.mockResolvedValue({ refunded: true });
  reportCreate.mockResolvedValue({ id: "copy-1" });
});

describe("POST /api/reports/[id]/duplicate — RA-6982 charge-before-create", () => {
  it("happy path charges BEFORE creating and returns 201", async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(201);
    expect(deductCreditsAndTrackUsage).toHaveBeenCalledTimes(1);
    expect(reportCreate).toHaveBeenCalledTimes(1);
    // Order: the charge lands before the report row is created.
    expect(deductCreditsAndTrackUsage.mock.invocationCallOrder[0]).toBeLessThan(
      reportCreate.mock.invocationCallOrder[0],
    );
    expect(refundCreditsAndTrackUsage).not.toHaveBeenCalled();
  });

  it("at-cap past the advisory gate → atomic deduct 402, creates NO report row", async () => {
    // Gate allows (race window), but the authoritative atomic charge rejects.
    deductCreditsAndTrackUsage.mockRejectedValueOnce(
      new Error("INSUFFICIENT_CREDITS"),
    );

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.upgradeRequired).toBe(true);
    // The core fix: no free report is created when the charge fails.
    expect(reportCreate).not.toHaveBeenCalled();
    expect(refundCreditsAndTrackUsage).not.toHaveBeenCalled();
  });

  it("advisory gate blocks at-cap before any charge or create", async () => {
    canCreateReport.mockResolvedValueOnce({
      allowed: false,
      reason: "Monthly report limit reached.",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(402);
    expect(deductCreditsAndTrackUsage).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it("post-charge create failure triggers exactly one refund, then surfaces the error", async () => {
    reportCreate.mockRejectedValueOnce(new Error("DB write failed"));

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(500);
    expect(deductCreditsAndTrackUsage).toHaveBeenCalledTimes(1);
    expect(refundCreditsAndTrackUsage).toHaveBeenCalledTimes(1);
    expect(refundCreditsAndTrackUsage).toHaveBeenCalledWith("user-1");
  });
});
