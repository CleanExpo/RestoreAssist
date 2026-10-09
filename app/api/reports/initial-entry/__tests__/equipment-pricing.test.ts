/**
 * Commercial equipment pricing on the initial-entry save.
 *
 * USER and MANAGER are refused the admin rate card (GET /api/pricing-config
 * 403), so the browser cannot know daily rates. The save must price selected
 * equipment from the organisation's own card on the server, discard any money
 * the browser sends, and refuse with VALIDATION 422 before any charge or write
 * when the card cannot price a selection.
 *
 * Only infrastructure is replaced here (session, Prisma rows, rate limiter,
 * idempotency reservation, credits, analytics, AI key and standards fetch).
 * The pricing resolver, effective-subscription owner lookup, equipment matrix
 * and structured report builder all run for real against coherent rows keyed
 * by where.id / where.organizationId / where.userId.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  userFind: vi.fn(),
  orgPricingFind: vi.fn(),
  legacyPricingFind: vi.fn(),
  transaction: vi.fn(),
  reportCreate: vi.fn(),
  clientFind: vi.fn(),
  clientCreate: vi.fn(),
  clientUpdate: vi.fn(),
  inspectionUpdate: vi.fn(),
  idemComplete: vi.fn(),
  rateLimit: vi.fn(),
  canCreate: vi.fn(),
  deduct: vi.fn(),
  firstSaved: vi.fn(),
  inspectionWrite: vi.fn(),
  aiKey: vi.fn(),
  standards: vi.fn(),
  hasAi: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    user: { findUnique: mocks.userFind },
    organizationPricingConfig: { findUnique: mocks.orgPricingFind },
    companyPricingConfig: { findUnique: mocks.legacyPricingFind },
    report: { create: mocks.reportCreate },
    client: { findFirst: mocks.clientFind, create: mocks.clientCreate, update: mocks.clientUpdate },
    inspection: { updateMany: mocks.inspectionUpdate },
    idempotencyRecord: { updateMany: mocks.idemComplete },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: mocks.rateLimit }));
vi.mock("@/lib/idempotency", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/idempotency")>()),
  withIdempotency: async (
    request: { text: () => Promise<string> },
    _scope: string,
    callback: (body: string) => unknown,
  ) => callback(await request.text()),
}));
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: mocks.canCreate,
  deductCreditsAndTrackUsage: mocks.deduct,
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({ recordFirstReportSaved: mocks.firstSaved }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ resolveInspectionWrite: mocks.inspectionWrite }));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({ resolveWorkspaceAiKey: mocks.aiKey }));
vi.mock("@/lib/standards-retrieval", () => ({ retrieveRelevantStandards: mocks.standards }));
vi.mock("@/lib/services/integrations/ai-readiness", () => ({ hasConfiguredAi: mocks.hasAi }));

import { POST } from "../route";
import { GET as getPricingConfig } from "../../../pricing-config/route";
import { buildStructuredBasicReport } from "@/lib/reports/build-structured-report";

type Row = Record<string, unknown>;

const ORG = "org-synthetic";
const OWNER = "owner-synthetic";

const ownerRow: Row = {
  id: OWNER, role: "ADMIN", organizationId: ORG, organization: { ownerId: OWNER },
  subscriptionStatus: "ACTIVE", trialEndsAt: null, lifetimeAccess: false, creditsRemaining: 20,
  subscriptionPlan: "Pro", monthlyReportsUsed: 0, monthlyResetDate: null, addonReports: 0,
};
const memberRow = (id: string, role: "USER" | "MANAGER"): Row => ({
  id, role, organizationId: ORG, organization: { ownerId: OWNER },
  subscriptionStatus: null, trialEndsAt: null, lifetimeAccess: false, creditsRemaining: 0,
  subscriptionPlan: null, monthlyReportsUsed: 0, monthlyResetDate: null, addonReports: 0,
});

const card = (overrides: Row = {}): Row => ({
  id: "card-synthetic",
  dehumidifierLGRDailyRate: 110,
  dehumidifierDesiccantDailyRate: 140,
  airMoverAxialDailyRate: 30,
  airMoverCentrifugalDailyRate: 35,
  afdUnitLargeDailyRate: 80,
  injectionDryingSystemDailyRate: 150,
  customFields: null,
  ...overrides,
});

let users: Record<string, Row>;
let orgCards: Record<string, Row>;
let legacyCards: Record<string, Row>;

const base = {
  clientName: "Synthetic Client",
  propertyAddress: "1 Test Street",
  propertyPostcode: "4000",
};

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/reports/initial-entry", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", "Idempotency-Key": "report-initial-synthetic-key" },
  });

const signIn = (id: string, role: string) => mocks.session.mockResolvedValue({ user: { id, role } });

beforeEach(() => {
  vi.resetAllMocks();
  users = {
    [OWNER]: ownerRow,
    "user-synthetic": memberRow("user-synthetic", "USER"),
    "manager-synthetic": memberRow("manager-synthetic", "MANAGER"),
  };
  orgCards = { [ORG]: card() };
  legacyCards = { [OWNER]: card({ id: "legacy-card", dehumidifierLGRDailyRate: 95 }) };

  mocks.userFind.mockImplementation(async ({ where }: { where: { id: string } }) => users[where.id] ?? null);
  mocks.orgPricingFind.mockImplementation(
    async ({ where }: { where: { organizationId: string } }) => orgCards[where.organizationId] ?? null,
  );
  mocks.legacyPricingFind.mockImplementation(
    async ({ where }: { where: { userId: string } }) => legacyCards[where.userId] ?? null,
  );
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    report: { create: mocks.reportCreate },
    client: { findFirst: mocks.clientFind, create: mocks.clientCreate, update: mocks.clientUpdate },
    inspection: { updateMany: mocks.inspectionUpdate },
    idempotencyRecord: { updateMany: mocks.idemComplete },
  }));
  mocks.reportCreate.mockImplementation(async ({ data }: { data: Row }) => ({ id: "report-synthetic", ...data }));
  mocks.clientFind.mockResolvedValue(null);
  mocks.idemComplete.mockResolvedValue({ count: 1 });
  mocks.rateLimit.mockResolvedValue(null);
  mocks.canCreate.mockResolvedValue({ allowed: true });
  mocks.deduct.mockResolvedValue(undefined);
  mocks.firstSaved.mockResolvedValue(undefined);
  mocks.aiKey.mockResolvedValue({ apiKey: "synthetic-not-a-key" });
  mocks.standards.mockResolvedValue([]);
  mocks.hasAi.mockResolvedValue(false);
  signIn("user-synthetic", "USER");
});

async function savedRow(body: unknown): Promise<Row> {
  const response = await POST(post(body));
  expect(response.status).toBe(200);
  expect(mocks.reportCreate).toHaveBeenCalledOnce();
  return mocks.reportCreate.mock.calls[0][0].data;
}

function expectNoSideEffects() {
  expect(mocks.canCreate).not.toHaveBeenCalled();
  expect(mocks.deduct).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.reportCreate).not.toHaveBeenCalled();
  expect(mocks.clientFind).not.toHaveBeenCalled();
  expect(mocks.clientCreate).not.toHaveBeenCalled();
  expect(mocks.clientUpdate).not.toHaveBeenCalled();
  expect(mocks.inspectionUpdate).not.toHaveBeenCalled();
  expect(mocks.idemComplete).not.toHaveBeenCalled();
  expect(mocks.firstSaved).not.toHaveBeenCalled();
  expect(mocks.aiKey).not.toHaveBeenCalled();
  expect(mocks.standards).not.toHaveBeenCalled();
}

async function expectRefused(body: unknown, status: number) {
  const response = await POST(post(body));
  expect(response.status).toBe(status);
  const json = await response.json();
  expect(json.error.code).toBe("VALIDATION");
  expectNoSideEffects();
  return json;
}

const withEquipment = (equipmentData: unknown) => ({ ...base, equipmentData });

describe("USER and MANAGER: no rate card in the browser, canonical prices on save", () => {
  it("USER is refused the rate card, then a forged-money save persists organisation prices", async () => {
    expect((await getPricingConfig(new NextRequest("http://localhost/api/pricing-config"))).status).toBe(403);

    const data = await savedRow(withEquipment({
      equipmentSelection: [{ groupId: "lgr-85", quantity: 2, dailyRate: 999, totalCost: 999999 }],
      estimatedDryingDuration: 3,
      equipmentCostTotal: 9999999,
      metrics: { totalDailyCost: 777, totalAffectedArea: 42, waterRemovalTarget: 120, airMoversRequired: 5 },
      psychrometricAssessment: { waterClass: 2, temperature: 24, humidity: 65 },
      scopeAreas: [{ name: "Lounge", length: 5, width: 4, height: 2.7, wetPercentage: 100 }],
    }));

    expect(JSON.parse(data.equipmentSelection as string)).toEqual([
      { groupId: "lgr-85", quantity: 2, dailyRate: 110, totalCost: 660 },
    ]);
    expect(data.equipmentCostTotal).toBe(660);
    expect(data.estimatedDryingDuration).toBe(3);
    // Technical capture survives untouched.
    expect(data.affectedArea).toBe(42);
    expect(data.dehumidificationCapacity).toBe(120);
    expect(data.airmoversCount).toBe(5);
    expect(data.waterClass).toBe("2");
    expect(JSON.parse(data.scopeAreas as string)[0].name).toBe("Lounge");
    // Organisation card won; the owner's legacy card was never read.
    expect(mocks.legacyPricingFind).not.toHaveBeenCalled();

    // The persisted row drives the real report builder to the canonical cost line.
    const built = buildStructuredBasicReport({
      report: { ...data, id: "report-synthetic" },
      analysis: null,
      stateInfo: null,
      equipmentSelection: JSON.parse(data.equipmentSelection as string),
    });
    expect(built.costEstimates).toEqual([
      expect.objectContaining({ quantity: 2, rate: 110, subtotal: 220, total: 660 }),
    ]);
    expect(built.summary.totalCost).toBe(660);
    expect(mocks.deduct).toHaveBeenCalledOnce();
  });

  it("MANAGER is refused the rate card, then mixed groups default to one day at organisation prices", async () => {
    signIn("manager-synthetic", "MANAGER");
    expect((await getPricingConfig(new NextRequest("http://localhost/api/pricing-config"))).status).toBe(403);

    const data = await savedRow(withEquipment({
      equipmentSelection: [
        { groupId: "airmover-1500", quantity: 3, dailyRate: 1 },
        { groupId: "afd-500", quantity: 1 },
        { groupId: "airmover-800", quantity: 2 },
      ],
      equipmentCostTotal: 1,
    }));

    expect(JSON.parse(data.equipmentSelection as string)).toEqual([
      { groupId: "airmover-1500", quantity: 3, dailyRate: 35, totalCost: 105 },
      { groupId: "afd-500", quantity: 1, dailyRate: 80, totalCost: 80 },
      { groupId: "airmover-800", quantity: 2, dailyRate: 30, totalCost: 60 },
    ]);
    expect(data.equipmentCostTotal).toBe(245);
    expect(data.estimatedDryingDuration).toBe(1);

    const built = buildStructuredBasicReport({
      report: { ...data, id: "report-synthetic" },
      analysis: null,
      stateInfo: null,
      equipmentSelection: JSON.parse(data.equipmentSelection as string),
    });
    expect(built.costEstimates.map((c: { total: number }) => c.total)).toEqual([105, 80, 60]);
  });

  it("a stale JWT ADMIN claim does not open the rate card or change the pricing owner", async () => {
    signIn("user-synthetic", "ADMIN");
    expect((await getPricingConfig(new NextRequest("http://localhost/api/pricing-config"))).status).toBe(403);
    const data = await savedRow({ ...withEquipment({ equipmentSelection: [{ groupId: "lgr-35", quantity: 1 }] }),
      ownerId: "someone-else", organizationId: "org-forged" });
    expect(JSON.parse(data.equipmentSelection as string)[0].dailyRate).toBe(110);
    expect(mocks.orgPricingFind).toHaveBeenCalledWith({ where: { organizationId: ORG } });
  });
});

describe("pricing source precedence", () => {
  it("keeps a configured numeric zero rate and never falls back to legacy", async () => {
    orgCards[ORG] = card({ dehumidifierLGRDailyRate: 0 });
    const data = await savedRow(withEquipment({
      equipmentSelection: [{ groupId: "lgr-55", quantity: 4 }], estimatedDryingDuration: 2,
    }));
    expect(JSON.parse(data.equipmentSelection as string)).toEqual([
      { groupId: "lgr-55", quantity: 4, dailyRate: 0, totalCost: 0 },
    ]);
    expect(data.equipmentCostTotal).toBe(0);
    expect(mocks.legacyPricingFind).not.toHaveBeenCalled();
  });

  it("uses the DB-derived owner's legacy card only when no organisation card exists", async () => {
    delete orgCards[ORG];
    const data = await savedRow(withEquipment({ equipmentSelection: [{ groupId: "lgr-85", quantity: 1 }] }));
    expect(JSON.parse(data.equipmentSelection as string)[0].dailyRate).toBe(95);
    expect(mocks.legacyPricingFind).toHaveBeenCalledWith({ where: { userId: OWNER } });
  });

  it("refuses 422 before any effect when neither card exists", async () => {
    delete orgCards[ORG];
    delete legacyCards[OWNER];
    const json = await expectRefused(withEquipment({ equipmentSelection: [{ groupId: "lgr-85", quantity: 1 }] }), 422);
    expect(json.error.message).toMatch(/pricing/i);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["a string", "110"],
    ["negative", -5],
    ["not finite", Number.NaN],
  ])("refuses 422 when the organisation's mapped rate is %s, without legacy fallback", async (_label, rate) => {
    const broken = card();
    if (rate === undefined) delete broken.dehumidifierLGRDailyRate;
    else broken.dehumidifierLGRDailyRate = rate;
    orgCards[ORG] = broken;
    const json = await expectRefused(withEquipment({ equipmentSelection: [{ groupId: "lgr-105", quantity: 1 }] }), 422);
    expect(json.error.fields).toHaveProperty("dehumidifierLGRDailyRate");
    expect(mocks.legacyPricingFind).not.toHaveBeenCalled();
  });

  it("refuses 422 when the arithmetic overflows", async () => {
    orgCards[ORG] = card({ dehumidifierLGRDailyRate: 1e300 });
    await expectRefused(withEquipment({
      equipmentSelection: [{ groupId: "lgr-85", quantity: Number.MAX_SAFE_INTEGER }],
      estimatedDryingDuration: 2_147_483_647,
    }), 422);
  });
});

describe("request shape refusals happen before pricing and before any effect", () => {
  it.each([
    ["unknown group", { groupId: "lgr-999", quantity: 1 }],
    ["bare prefix", { groupId: "lgr-", quantity: 1 }],
    ["non-string group", { groupId: 85, quantity: 1 }],
    ["zero quantity", { groupId: "lgr-85", quantity: 0 }],
    ["negative quantity", { groupId: "lgr-85", quantity: -1 }],
    ["fractional quantity", { groupId: "lgr-85", quantity: 1.5 }],
    ["string quantity", { groupId: "lgr-85", quantity: "2" }],
    ["boolean quantity", { groupId: "lgr-85", quantity: true }],
    ["array quantity", { groupId: "lgr-85", quantity: [2] }],
    ["unsafe quantity", { groupId: "lgr-85", quantity: 2 ** 53 }],
    ["null entry", null],
    ["array entry", ["lgr-85", 1]],
  ])("refuses a selection with %s", async (_label, entry) => {
    await expectRefused(withEquipment({ equipmentSelection: [entry] }), 400);
    expect(mocks.orgPricingFind).not.toHaveBeenCalled();
  });

  it.each([
    ["zero", 0], ["negative", -2], ["fractional", 1.5], ["a string", "3"], ["a boolean", true],
    ["above the Int column maximum", 2_147_483_648],
  ])("refuses a duration that is %s", async (_label, estimatedDryingDuration) => {
    await expectRefused(withEquipment({
      equipmentSelection: [{ groupId: "lgr-85", quantity: 1 }], estimatedDryingDuration,
    }), 400);
  });

  it("accepts the largest duration the Int column can store", async () => {
    const data = await savedRow(withEquipment({
      equipmentSelection: [{ groupId: "lgr-85", quantity: 1 }], estimatedDryingDuration: 2_147_483_647,
    }));
    expect(data.estimatedDryingDuration).toBe(2_147_483_647);
    expect(data.equipmentCostTotal).toBe(110 * 2_147_483_647);
  });

  it("refuses a non-finite duration from raw JSON", async () => {
    await expectRefused(
      `{"clientName":"Synthetic Client","propertyAddress":"1 Test Street","propertyPostcode":"4000",` +
      `"equipmentData":{"equipmentSelection":[{"groupId":"lgr-85","quantity":1}],"estimatedDryingDuration":1e400}}`,
      400,
    );
  });

  it.each([
    ["a string", "lgr-85"], ["an array", [{ groupId: "lgr-85", quantity: 1 }]], ["a boolean", true],
  ])("refuses equipmentData that is %s", async (_label, equipmentData) => {
    await expectRefused(withEquipment(equipmentData), 400);
  });

  it("refuses an equipmentSelection that is not an array", async () => {
    await expectRefused(withEquipment({ equipmentSelection: { groupId: "lgr-85", quantity: 1 } }), 400);
  });
});

describe("no equipment estimate needs no pricing and keeps no forged money", () => {
  beforeEach(() => {
    delete orgCards[ORG];
    delete legacyCards[OWNER];
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["without a selection", { equipmentCostTotal: 999, estimatedDryingDuration: 0 }],
    ["with an empty selection", { equipmentSelection: [], equipmentCostTotal: 999, estimatedDryingDuration: 0,
      metrics: { totalDailyCost: 50 } }],
  ])("saves equipmentData %s with no estimate", async (_label, equipmentData) => {
    const data = await savedRow(equipmentData === undefined ? base : withEquipment(equipmentData));
    expect(data.equipmentSelection).toBeNull();
    expect(data.equipmentCostTotal).toBeNull();
    expect(data.estimatedDryingDuration).toBeNull();
    expect(mocks.orgPricingFind).not.toHaveBeenCalled();
    expect(mocks.legacyPricingFind).not.toHaveBeenCalled();
  });
});
