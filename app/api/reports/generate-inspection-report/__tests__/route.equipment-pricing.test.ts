import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeTwoWorkspaces,
  project,
} from "@/lib/reports/__tests__/two-workspace-fixture";

// RA-8281 B1 class fix (review round 9): the exact path the reviewer ran. A
// report with an already stored lgr-85 selection reaches this route; the
// structured report must price it from the business's CURRENT price list
// (resolveReportPricing), never from the rate cached on the selection.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const reportUpdate = vi.fn();
const resolveReportProvider = vi.fn();
const resolveReportPricing = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    report: {
      findUnique: (...args: unknown[]) => reportFindUnique(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));
vi.mock("@/lib/pricing/report-pricing", () => ({
  resolveReportPricing: (...args: unknown[]) => resolveReportPricing(...args),
}));
vi.mock("../provider", () => ({
  resolveReportProvider: (...args: unknown[]) => resolveReportProvider(...args),
}));
const callAIProvider = vi.fn();
vi.mock("@/lib/ai-provider", () => ({
  getLatestAIIntegration: vi.fn().mockResolvedValue(null),
  callAIProvider: (...args: unknown[]) => callAIProvider(...args),
}));
vi.mock("@/lib/standards-retrieval", () => ({
  retrieveRelevantStandards: vi.fn().mockRejectedValue(new Error("offline")),
  buildStandardsContextPrompt: vi.fn(),
}));
vi.mock("@/lib/rag/retrieve", () => ({
  retrieveForCitation: vi.fn().mockRejectedValue(new Error("offline")),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
// The AI report path is a paid-plan feature; the plan gate is not under test.
vi.mock("@/lib/billing/paid-base-plan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/paid-base-plan")>()),
  requirePaidBasePlan: vi.fn().mockResolvedValue(null),
}));

import { POST } from "../route";

const DAYS = 4;

function storedReport(cachedRate: number, asObject = false, column?: string) {
  return {
    id: "report-1",
    userId: "owner-a",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    technicianReportAnalysis: null,
    tier1Responses: null,
    tier2Responses: null,
    tier3Responses: null,
    psychrometricAssessment: null,
    scopeAreas: null,
    equipmentSelection:
      column ??
      JSON.stringify(
        asObject
          ? { groupId: "lgr-85", quantity: 1, dailyRate: cachedRate }
          : [{ groupId: "lgr-85", quantity: 1, dailyRate: cachedRate }],
      ),
    equipmentCostTotal: cachedRate * DAYS,
    estimatedDryingDuration: DAYS,
    propertyPostcode: "4000",
    reportDepthLevel: "Basic",
    client: { company: "Acme", name: "Pat" },
    inspection: { propertyCountry: "AU" },
    authorityForms: [],
  };
}

async function structured(
  cachedRate: number,
  currentRate: number | null,
  asObject = false,
) {
  const fixture = makeTwoWorkspaces();
  getServerSession.mockResolvedValue({ user: { id: "owner-a" } });
  userFindUnique.mockImplementation(
    async (args: { where: { id: string }; select: Record<string, unknown> }) => {
      const row = fixture.userRow(args.where.id);
      return row
        ? {
            ...(project(row, args.select) as object),
            subscriptionStatus: "TRIAL",
            trialEndsAt: new Date("2099-01-01"),
          }
        : null;
    },
  );
  reportFindUnique.mockResolvedValue(storedReport(cachedRate, asObject));
  resolveReportPricing.mockResolvedValue({
    ok: true,
    pricingConfig: { dehumidifierLGRDailyRate: currentRate },
  });
  const res = await POST(
    new NextRequest("http://localhost/api/reports/generate-inspection-report", {
      method: "POST",
      body: JSON.stringify({ reportId: "report-1", reportType: "basic" }),
      headers: { "Content-Type": "application/json" },
    }),
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.report.structuredData;
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  reportFindUnique.mockReset();
  reportUpdate.mockReset();
  resolveReportProvider.mockReset();
  resolveReportPricing.mockReset();
  reportUpdate.mockResolvedValue({});
  resolveReportProvider.mockResolvedValue({
    id: "conn-1",
    name: "Anthropic",
    apiKey: "test-key-not-a-secret",
    provider: "anthropic",
  });
});

describe("POST generate-inspection-report: stored equipment is priced from the current price list", () => {
  it.each([0, 61])(
    "cached rate %d with the current LGR rate cleared: Rate not set, total blocked",
    async (cached) => {
      const s = await structured(cached, null);
      expect(s.equipment[0].dailyRate).toBeNull();
      expect(s.equipment[0].totalCost).toBeNull();
      expect(s.equipment[0].rateNote).toMatch(/Rate not set/);
      expect(s.summary.totalCost).toBeNull();
    },
  );

  it("control: the route hands the builder the business's price list (70, not the cached 61)", async () => {
    const s = await structured(61, 70);
    const [creatorId, , createdAt] = resolveReportPricing.mock.calls[0];
    expect(creatorId).toBe("owner-a");
    expect(createdAt).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(s.equipment[0].dailyRate).toBe(70);
    expect(s.summary.totalCost).toBe(70 * DAYS);
  });

  it("control: a stored single object (legacy shape) is priced from the business's price list too", async () => {
    const s = await structured(61, 70, true);
    expect(resolveReportPricing).toHaveBeenCalledTimes(1);
    expect(s.equipment).toHaveLength(1);
    expect(s.equipment[0].dailyRate).toBe(70);
  });
});

// RA-8281 B1 round 13 (review round 12, P1 1): a stored list holding an entry
// that cannot be read (null) used to throw inside the prompt builder's
// non-money sections, and the route answered 500. Every section now reads the
// validated lines, so the request succeeds and the line is shown as not usable.
describe("POST generate-inspection-report: a stored line that cannot be read", () => {
  async function generate(column: string, reportType: string) {
    const fixture = makeTwoWorkspaces();
    getServerSession.mockResolvedValue({ user: { id: "owner-a" } });
    userFindUnique.mockImplementation(
      async (args: { where: { id: string }; select: Record<string, unknown> }) => {
        const row = fixture.userRow(args.where.id);
        return row
          ? {
              ...(project(row, args.select) as object),
              subscriptionStatus: "TRIAL",
              trialEndsAt: new Date("2099-01-01"),
            }
          : null;
      },
    );
    reportFindUnique.mockResolvedValue(storedReport(61, false, column));
    resolveReportPricing.mockResolvedValue({
      ok: true,
      pricingConfig: { dehumidifierLGRDailyRate: 70 },
    });
    callAIProvider.mockReset();
    callAIProvider.mockResolvedValue("Generated inspection report text.");
    return POST(
      new NextRequest("http://localhost/api/reports/generate-inspection-report", {
        method: "POST",
        body: JSON.stringify({ reportId: "report-1", reportType }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it.each(["[null]", JSON.stringify([null, { groupId: "lgr-85", quantity: 2 }])])(
    "AI report path with stored %s: no 500, the prompt names the line as not usable and gives no total",
    async (column) => {
      const res = await generate(column, "detailed");
      expect(res.status).toBe(200);
      expect(callAIProvider).toHaveBeenCalledTimes(1);
      const prompt: string = callAIProvider.mock.calls[0][1].prompt;
      expect(prompt).toContain("Equipment line not usable");
      expect(prompt).toContain("Total Daily Equipment Cost: Rate not set");
      expect(prompt).not.toMatch(/Total Daily Equipment Cost: \$/);
    },
  );

  it("structured report path with stored [null]: no 500, the line is blocked and so is the total", async () => {
    const res = await generate("[null]", "basic");
    expect(res.status).toBe(200);
    const s = (await res.json()).report.structuredData;
    expect(s.equipment).toHaveLength(1);
    expect(s.equipment[0].dailyRate).toBeNull();
    expect(s.equipment[0].rateNote).toMatch(/cannot be priced/);
    expect(s.summary.totalCost).toBeNull();
  });

  it("control: the same AI path with a readable line prices it from the current price list (70)", async () => {
    const res = await generate(JSON.stringify([{ groupId: "lgr-85", quantity: 2, dailyRate: 61 }]), "detailed");
    expect(res.status).toBe(200);
    const prompt: string = callAIProvider.mock.calls[0][1].prompt;
    expect(prompt).not.toContain("Equipment line not usable");
    expect(prompt).toContain("Total Daily Equipment Cost: $140.00");
    expect(prompt).not.toContain("$61.00");
  });
});
