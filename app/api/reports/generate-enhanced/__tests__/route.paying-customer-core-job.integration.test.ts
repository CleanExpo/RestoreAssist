/**
 * RA-7437: the paying customer's core job, end to end through the real routes.
 *
 * One ACTIVE subscriber on the Monthly Plan:
 *   1. creates a job (POST /api/inspections),
 *   2. generates its report (POST /api/reports/generate-enhanced), which runs
 *      every real billing gate (hasActiveSubscription, requirePaidBasePlan,
 *      canCreateReport, deductCreditsAndTrackUsage),
 *   3. completes the report (PUT /api/reports/[id]) at Enhanced depth, which
 *      is the paid-only depth gate.
 *
 * Controls, so the test can fail: a subscriber whose plan was cancelled is
 * refused at step 2, and a plain trial user (no founding grant) is refused
 * the paid depth at step 3. Neither leaves a report or usage behind.
 *
 * Prisma and the gates are NOT mocked: rows are seeded in the CI Postgres and
 * the handlers' real responses and rows are asserted. Only the session, the
 * rate limiter (Upstash), the AI key lookup, the AI model call, the standards
 * lookup (Google Drive) and analytics are replaced, because none of them
 * decides whether a paying customer may do the job.
 *
 * This proves the code path on a throwaway database. It does not prove a real
 * card payment on production; that step stays with the owner (RA-7437).
 * Runs only with DATABASE_URL (CI Unit Tests job, npm run test:db).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: async () => null,
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/ai/resolve-workspace-ai-key")>();
  return {
    ...real,
    resolveWorkspaceAiKey: async () => ({
      workspaceId: "ws-core-job",
      apiKey: "test-placeholder",
    }),
  };
});
const generateEnhancedReport = vi.fn();
vi.mock("@/lib/services/ai/generate-enhanced-report", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("@/lib/services/ai/generate-enhanced-report")
    >();
  return {
    ...real,
    generateEnhancedReport: (...a: unknown[]) => generateEnhancedReport(...a),
  };
});
vi.mock("@/lib/standards-retrieval", () => ({
  retrieveRelevantStandards: async () => [],
  buildStandardsContextPrompt: () => "",
}));
vi.mock("@/lib/analytics/first-report-saved", () => ({
  recordFirstReportSaved: async () => undefined,
}));

import { prisma } from "@/lib/prisma";
import { PAID_BASE_PLAN_MESSAGE } from "@/lib/billing/paid-base-plan-copy";
import { POST as createInspection } from "@/app/api/inspections/route";
import { POST as generateReport } from "../route";
import { PUT as updateReport } from "@/app/api/reports/[id]/route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `corejob-${Date.now().toString(36)}`;
const ids = { paying: "", lapsed: "", trial: "" };

const job = {
  propertyAddress: "1 Core Job St, Brisbane QLD",
  propertyPostcode: "4000",
  claimType: "WATER",
};

function asUser(userId: string) {
  getServerSession.mockResolvedValueOnce({ user: { id: userId } });
}

async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function create(userId: string, key: string) {
  asUser(userId);
  const res = await createInspection(
    new NextRequest("http://localhost/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(job),
    }),
  );
  return { status: res.status, json: await readJson(res) };
}

async function generate(userId: string, key: string) {
  asUser(userId);
  const res = await generateReport(
    new NextRequest("http://localhost/api/reports/generate-enhanced", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        technicianNotes:
          "Burst flexi hose under kitchen sink. Carpet and plasterboard wet in two rooms.",
        clientName: `${S} client`,
        propertyAddress: job.propertyAddress,
      }),
    }),
  );
  return { status: res.status, json: await readJson(res) };
}

async function complete(userId: string, reportId: string) {
  asUser(userId);
  const res = await updateReport(
    new NextRequest(`http://localhost/api/reports/${reportId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportDepthLevel: "Enhanced",
        detailedReport: "Reviewed and finalised by the technician.",
        completionDate: "2026-11-19",
      }),
    }),
    { params: Promise.resolve({ id: reportId }) },
  );
  return { status: res.status, json: await readJson(res) };
}

describe.skipIf(!HAS_DB)("RA-7437 paying customer core job", () => {
  beforeAll(async () => {
    generateEnhancedReport.mockResolvedValue({
      ok: true,
      data: { enhancedReport: "Generated inspection report body." },
    });
    const trialEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const paying = await prisma.user.create({
      data: {
        email: `${S}-paying@test.local`,
        role: "ADMIN",
        subscriptionStatus: "ACTIVE",
        subscriptionPlan: "Monthly Plan",
      },
    });
    const lapsed = await prisma.user.create({
      data: {
        email: `${S}-lapsed@test.local`,
        role: "ADMIN",
        subscriptionStatus: "CANCELED",
        subscriptionPlan: "Monthly Plan",
      },
    });
    const trial = await prisma.user.create({
      data: {
        email: `${S}-trial@test.local`,
        role: "ADMIN",
        subscriptionStatus: "TRIAL",
        trialEndsAt,
        creditsRemaining: 5,
      },
    });
    Object.assign(ids, { paying: paying.id, lapsed: lapsed.id, trial: trial.id });
  });

  afterAll(async () => {
    if (!ids.paying) return;
    const userIds = [ids.paying, ids.lapsed, ids.trial].filter(Boolean);
    await prisma.inspection.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.report.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("an ACTIVE subscriber creates a job, generates its report and completes it", async () => {
    const created = await create(ids.paying, `${S}-job`);
    expect(created.status).toBe(201);
    const inspectionId = created.json.inspection.id as string;
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
    });
    expect(inspection?.userId).toBe(ids.paying);

    const generated = await generate(ids.paying, `${S}-gen`);
    expect(generated.status).toBe(200);
    expect(generated.json.success).toBe(true);
    const reportId = generated.json.reportId as string;
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    expect(report?.userId).toBe(ids.paying);
    expect(report?.detailedReport).toBe("Generated inspection report body.");

    // The real monthly usage counter moved: the paid allowance was charged.
    const afterGenerate = await prisma.user.findUnique({
      where: { id: ids.paying },
      select: { monthlyReportsUsed: true },
    });
    expect(afterGenerate?.monthlyReportsUsed).toBe(1);

    const done = await complete(ids.paying, reportId);
    expect(done.status).toBe(200);
    const saved = await prisma.report.findUnique({ where: { id: reportId } });
    expect(saved?.reportDepthLevel).toBe("Enhanced");
    expect(saved?.detailedReport).toBe("Reviewed and finalised by the technician.");
    expect(saved?.completionDate).not.toBeNull();
  });

  it("refuses report generation once the subscription is cancelled", async () => {
    const generated = await generate(ids.lapsed, `${S}-gen-lapsed`);
    expect(generated.status).toBe(402);
    expect(await prisma.report.count({ where: { userId: ids.lapsed } })).toBe(0);
  });

  it("refuses the paid Enhanced depth to a plain trial user", async () => {
    const report = await prisma.report.create({
      data: {
        title: `${S}-trial-report`,
        clientName: `${S} client`,
        propertyAddress: job.propertyAddress,
        hazardType: "WATER",
        insuranceType: "UNKNOWN",
        userId: ids.trial,
        status: "DRAFT",
      },
      select: { id: true },
    });
    const done = await complete(ids.trial, report.id);
    expect(done.status).toBe(402);
    expect(done.json.error.message).toBe(PAID_BASE_PLAN_MESSAGE);
    const unchanged = await prisma.report.findUnique({ where: { id: report.id } });
    expect(unchanged?.reportDepthLevel).not.toBe("Enhanced");
  });
});
