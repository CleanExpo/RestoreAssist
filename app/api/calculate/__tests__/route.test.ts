import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/pricing/effective-pricing", () => ({
  resolveEffectivePricing: vi.fn().mockResolvedValue(null),
}));

const { userFindUnique } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique },
  },
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockReset();
  mockSession.mockResolvedValue({ user: { id: "user_abcd" } });
  userFindUnique
    .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" })
    .mockResolvedValueOnce({
      businessName: "Test Co",
      businessABN: "53 004 085 616",
      businessAddress: "1 St",
      businessPhone: null,
      businessEmail: "a@test.com",
      businessLogo: null,
      organization: { country: "AU" },
    });
});

function calcReq(body: unknown) {
  return new NextRequest("http://localhost/api/calculate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  jobType: "water",
  affectedAreaM2: 10,
  numberOfRooms: 1,
  dryingDays: 1,
  labourHours: 1,
  airMoversAxial: 0,
  dehumidifiersLGR: 0,
  includeCallOut: false,
  includeAdminFee: false,
};

describe("POST /api/calculate", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(calcReq(validBody));
    expect(res.status).toBe(401);
  });

  it("400 on invalid payload", async () => {
    const res = await POST(calcReq({ jobType: "water" }));
    expect(res.status).toBe(400);
  });

  it("402 when subscription inactive", async () => {
    userFindUnique.mockReset();
    userFindUnique.mockResolvedValueOnce({ subscriptionStatus: "CANCELED" });
    const res = await POST(calcReq(validBody));
    expect(res.status).toBe(402);
  });

  it("enforces minimum charge and returns pricing honesty fields", async () => {
    const res = await POST(calcReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.minimumApplied).toBe(true);
    expect(json.subtotalExGST).toBe(2750);
    expect(json.gst).toBe(275);
    expect(json.totalIncGST).toBe(3025);
    expect(json.pricingSource).toBe("default_rates");
    expect(String(json.pricingNote)).toMatch(/Cost Libraries/i);
  });

  it("uses the organisation country for NZ GST", async () => {
    userFindUnique.mockReset();
    userFindUnique
      .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" })
      .mockResolvedValueOnce({
        businessName: "NZ Test Co",
        businessABN: "9429041922228",
        businessAddress: "1 Queen St",
        businessPhone: null,
        businessEmail: "nz@test.example",
        businessLogo: null,
        organization: { country: "NZ" },
      });

    const res = await POST(calcReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gst).toBe(412.5);
    expect(json.totalIncGST).toBe(3162.5);
  });

  it("fails closed when the organisation country is missing", async () => {
    userFindUnique.mockReset();
    userFindUnique
      .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" })
      .mockResolvedValueOnce({
        businessName: "Incomplete Co",
        businessABN: "53 004 085 616",
        businessAddress: "1 St",
        businessPhone: null,
        businessEmail: "missing@test.example",
        businessLogo: null,
        organization: null,
      });

    const res = await POST(calcReq(validBody));
    expect(res.status).toBe(422);
  });
});

/**
 * The customer-facing quote was the ONLY priced document with no safety
 * reconciliation at all. It prices air movers by unit-days and treats "mould"
 * as a job type, so it could carry mould remediation and Phase 1 air movers on
 * the same page — what `reconcile-pricing-safety.ts` calls "remediation
 * negligence (S520)".
 *
 * Sabotage that proves these: delete the `reconcilePricingSafety` call in the
 * route. All the mould cases below go red; the clean-job case stays green,
 * because "no advisories" is also what a missing reconciliation looks like —
 * which is exactly why the clean case alone would be worthless.
 */
describe("POST /api/calculate — S520 air-mover gate", () => {
  const withAirMovers = {
    ...validBody,
    affectedAreaM2: 40,
    dryingDays: 3,
    airMoversAxial: 6,
  };

  async function safetyOf(body: unknown) {
    const res = await POST(calcReq(body));
    expect(res.status).toBe(200);
    return (await res.json()).safety;
  }

  it("flags air movers priced on a mould job as critical", async () => {
    const safety = await safetyOf({ ...withAirMovers, jobType: "mould" });

    expect(safety.mouldActive).toBe(true);
    expect(safety.airMoverQty).toBe(6);
    const critical = safety.advisories.filter(
      (a: { severity: string }) => a.severity === "critical",
    );
    expect(critical).toHaveLength(1);
    expect(critical[0].text).toMatch(/S520/);
    expect(critical[0].text).toMatch(/air mover/i);
  });

  /**
   * THE LOAD-BEARING CASE. `jobType` alone cannot express a water job with
   * mould growth, and that is the one most likely to be mis-priced — nobody
   * relabels a burst-pipe claim as a "mould job". A gate that only fires on
   * jobType would look safe and catch almost nothing.
   */
  it("flags a WATER job carrying mould, which jobType alone cannot express", async () => {
    const safety = await safetyOf({
      ...withAirMovers,
      jobType: "water",
      mouldActive: true,
    });

    expect(safety.mouldActive).toBe(true);
    expect(
      safety.advisories.some((a: { severity: string }) => a.severity === "critical"),
    ).toBe(true);
  });

  it("counts centrifugal air movers too, not just axial", async () => {
    const safety = await safetyOf({
      ...validBody,
      affectedAreaM2: 40,
      jobType: "mould",
      airMoversAxial: 0,
      airMoversCentrifugal: 4,
    });

    expect(safety.airMoverQty).toBe(4);
    expect(
      safety.advisories.some((a: { severity: string }) => a.severity === "critical"),
    ).toBe(true);
  });

  it("raises nothing on a clean water job with air movers", async () => {
    const safety = await safetyOf(withAirMovers);

    expect(safety.mouldActive).toBe(false);
    expect(
      safety.advisories.filter((a: { severity: string }) => a.severity === "critical"),
    ).toHaveLength(0);
  });

  // A mould job with no air movers priced is the CORRECT sequence, not a
  // finding. Flagging it would train estimators to ignore the advisories.
  it("raises nothing on a mould job that priced no air movers", async () => {
    const safety = await safetyOf({
      ...validBody,
      affectedAreaM2: 40,
      jobType: "mould",
      airMoversAxial: 0,
    });

    expect(safety.mouldActive).toBe(true);
    expect(
      safety.advisories.filter((a: { severity: string }) => a.severity === "critical"),
    ).toHaveLength(0);
  });

  // The quote has affectedAreaM2 as a plain number and no scope rows at all;
  // before the passthrough the reconciler saw zero area and planned nothing.
  it("sizes the plan from affectedAreaM2, with the budget marked assumed", async () => {
    const safety = await safetyOf(withAirMovers);

    expect(safety.equipmentPlan).not.toBeNull();
    expect(safety.equipmentPlan.budget.circuits).toBe(2);
    expect(safety.equipmentPlan.budget.circuitRatingA).toBe(20);
  });
});
