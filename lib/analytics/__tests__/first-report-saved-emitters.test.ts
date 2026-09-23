/**
 * RA-7622 — every path that creates a user's first real report records
 * `first_report_saved`, once, and nothing else does.
 *
 * The founder's "Activated" figure on Admin → Business counts distinct users
 * with a `first_report_saved` ActivationEvent in the last 30 days
 * (app/api/admin/business-metrics/route.ts). Before RA-7622 only
 * POST /api/reports recorded it, and no screen in the web app calls that
 * endpoint, so real users were never counted. The opposite error is just as
 * bad: if a sample, demo, seed or copied report recorded it, every trial would
 * read as activated.
 *
 * How this is tested: each real route handler is imported and run against a
 * mocked database. `track` (the analytics writer) is mocked at its module
 * boundary; `isFirstTime` stays REAL, and reads an in-memory ActivationEvent
 * table that the mocked `track` writes to. The write lands on the next tick,
 * not synchronously, because in production `track` is fire-and-forget and its
 * database write can land after the rest of the request has run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => {
  type Row = { userId: string; eventName: string; properties?: unknown };
  const table: Row[] = [];
  const track = vi.fn(
    (userId: string, eventName: string, properties?: unknown) => {
      // Fire-and-forget write: lands on the next macrotask.
      setTimeout(() => table.push({ userId, eventName, properties }), 0);
      return Promise.resolve();
    },
  );

  const fn = () => vi.fn();
  const db = {
    activationEvent: {
      count: vi.fn(
        async ({ where }: { where: { userId: string; eventName: string } }) =>
          table.filter(
            (r) => r.userId === where.userId && r.eventName === where.eventName,
          ).length,
      ),
    },
    user: { findUnique: fn() },
    report: {
      create: fn(),
      count: fn(),
      findFirst: fn(),
      findUnique: fn(),
      findMany: fn(),
      update: fn(),
    },
    client: { findFirst: fn(), create: fn(), update: fn() },
    inspection: {
      create: fn(),
      findUnique: fn(),
      findFirst: fn(),
      updateMany: fn(),
      update: fn(),
    },
    auditLog: { create: fn() },
    liveTeacherSession: { findFirst: fn(), update: fn() },
    pilotObservation: { create: fn() },
    scopeItem: { create: fn(), createMany: fn() },
    costEstimate: { createMany: fn() },
    moistureReading: { create: fn() },
    integration: { findFirst: fn() },
    externalJob: { findMany: fn(), update: fn() },
    externalClient: { findFirst: fn() },
    organization: { findFirst: fn(), update: fn() },
    invoiceTemplate: { updateMany: fn() },
    $transaction: vi.fn(),
  };

  return { table, track, db, getServerSession: vi.fn() };
});

// ── Analytics: `track` mocked, `isFirstTime` real ────────────────────────────
vi.mock("@/lib/analytics/track", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics/track")>(
    "@/lib/analytics/track",
  );
  return {
    ...actual,
    track: (...a: Parameters<typeof actual.track>) => h.track(...a),
  };
});

// ── Database ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => ({ prisma: h.db }));

// ── Auth, tenancy, idempotency, rate limiting ────────────────────────────────
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => h.getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/get-api-session", () => ({ getApiSession: vi.fn() }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: vi.fn(async (_s: unknown, id: string) => ({
    ok: true,
    data: { inspectionManyWhere: { id } },
  })),
  resolveInspectionReach: vi.fn(),
  resolveReportReach: vi.fn(),
}));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: vi.fn(async (session: { user: { id: string } }) => ({
    user: { id: session.user.id },
  })),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: Request,
    _userId: string,
    cb: (rawBody: string) => Promise<Response>,
  ) => cb(await req.text()),
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));

// ── Credits ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/report-limits", () => ({
  canCreateReport: vi.fn(async () => ({ allowed: true })),
  canCreateBulkReports: vi.fn(async () => ({ allowed: true })),
  deductCreditsAndTrackUsage: vi.fn(async () => undefined),
  refundCreditsAndTrackUsage: vi.fn(async () => ({ refunded: true })),
  incrementReportUsage: vi.fn(async () => undefined),
  trackUsageOnly: vi.fn(async () => undefined),
}));
vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription: vi.fn(async () => ({
    subscriptionStatus: "TRIAL",
    creditsRemaining: 5,
  })),
}));
vi.mock("@/lib/bulk-operations", () => ({
  rateLimit: vi.fn(() => ({ allowed: true })),
  validateReportIds: vi.fn(async (ids: string[]) => ids),
  validateBatchSize: vi.fn(() => ({ valid: true })),
  deductBulkCredits: vi.fn(async () => ({ success: true, creditsRemaining: 4 })),
  refundBulkCredits: vi.fn(async () => undefined),
  formatBulkResponse: vi.fn(),
  getUnauthorizedReportIds: vi.fn(async () => []),
}));

// ── AI (no network) ──────────────────────────────────────────────────────────
vi.mock("@/lib/anthropic", () => ({
  generateDetailedReport: vi.fn(async () => "Detailed report text"),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: vi.fn(async () => ({ apiKey: "sk-test" })),
  };
});
vi.mock("@/lib/services/ai/generate-enhanced-report", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/ai/generate-enhanced-report")
  >("@/lib/services/ai/generate-enhanced-report");
  return {
    ...actual,
    generateEnhancedReport: vi.fn(async () => ({
      ok: true,
      data: { enhancedReport: "Enhanced report text" },
    })),
  };
});
vi.mock("@/lib/standards-retrieval", () => ({
  retrieveRelevantStandards: vi.fn(async () => []),
  buildStandardsContextPrompt: vi.fn(() => ""),
}));

// ── Integrations import ──────────────────────────────────────────────────────
vi.mock("@/lib/integrations/subscription-guard", () => ({
  checkIntegrationAccess: vi.fn(async () => ({ isAllowed: true })),
  createSubscriptionRequiredResponse: vi.fn(() => ({ error: "Subscription required" })),
}));

// ── Setup wizard ─────────────────────────────────────────────────────────────
vi.mock("@/lib/setup/checks", () => ({ runAllChecks: vi.fn(async () => []) }));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn(async () => null) }));

// ── Inspection submit: gates pass, downstream processing is a no-op ──────────
vi.mock("@/lib/services/inspection/validate-submission", () => ({
  validateSubmissionPayload: vi.fn(() => ({ ok: true })),
}));
vi.mock("@/lib/nir-tiered-completion", () => ({
  validateTieredCompletion: vi.fn(() => ({
    canSubmit: true,
    missingCritical: [],
    missingSupplementary: [],
    warnings: [],
    summary: {},
  })),
}));
vi.mock("@/lib/compliance/make-safe-gate", () => ({
  checkMakeSafeGate: vi.fn(async () => ({ canSubmit: true, blockers: [] })),
}));
vi.mock("@/lib/compliance/seed-make-safe", () => ({
  ensureMakeSafeSeeded: vi.fn(async () => false),
}));
vi.mock("@/lib/compliance/scope-variation-gate", () => ({
  checkScopeVariationGate: vi.fn(async () => ({ canSubmit: true, blockers: [] })),
}));
vi.mock("@/lib/compliance/nz-moisture-gate", () => ({
  checkNzMoistureGate: vi.fn(async () => ({ warnings: [] })),
}));
vi.mock("@/lib/compliance/safework-notification-gate", () => ({
  checkSafeworkGate: vi.fn(async () => ({ notifications: [] })),
}));
vi.mock("@/lib/compliance/nzbs-compliance-gate", () => ({
  checkNzbsGate: vi.fn(async () => ({
    canSubmit: true,
    blockers: [],
    requiredClauses: [],
  })),
}));
vi.mock("@/lib/compliance/moisture-trend-anomaly", () => ({
  detectMoistureTrendAnomalies: vi.fn(async () => ({
    hasAnomalies: false,
    anomalies: [],
  })),
}));
vi.mock("@/lib/compliance/duplicate-detector", () => ({
  detectDuplicateJob: vi.fn(async () => ({ hasDuplicates: false })),
}));
vi.mock("@/lib/lifecycle/subscribers/next-action", () => ({
  onNextAction: vi.fn(async () => undefined),
}));
vi.mock("@/lib/evidence/submission-gate", () => ({
  validateSubmission: vi.fn(async () => ({ completionPercentage: 50 })),
}));
vi.mock("@/lib/nir-classification-engine", () => ({ classifyIICRC: vi.fn() }));
vi.mock("@/lib/nir-building-codes", () => ({
  getBuildingCodeRequirements: vi.fn(async () => null),
  checkBuildingCodeTriggers: vi.fn(() => null),
}));
vi.mock("@/lib/nir-scope-determination", () => ({
  determineScopeItems: vi.fn(() => []),
}));
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: vi.fn(async () => ({ items: [], contingency: 0 })),
}));

// ── The real route handlers under test ───────────────────────────────────────
import { POST as postReports } from "@/app/api/reports/route";
import { POST as postInitialEntry } from "@/app/api/reports/initial-entry/route";
import { POST as postGenerateEnhanced } from "@/app/api/reports/generate-enhanced/route";
import { POST as postImportJobs } from "@/app/api/integrations/oauth/[provider]/jobs/route";
import { POST as postInspection } from "@/app/api/inspections/route";
import { POST as postSubmitInspection } from "@/app/api/inspections/[id]/submit/route";
import { POST as postSetupActivate } from "@/app/api/setup/activate/route";
import { POST as postSeedDemo } from "@/app/api/admin/seed-demo/route";
import { POST as postDuplicate } from "@/app/api/reports/[id]/duplicate/route";
import { POST as postBulkDuplicate } from "@/app/api/reports/bulk-duplicate/route";
import { seedDemoDataForNewUser } from "@/lib/demo-data";

// ── Helpers ──────────────────────────────────────────────────────────────────
const EVENT = "first_report_saved";

/** Let fire-and-forget analytics writes land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Every first_report_saved emission for this user, in call order. */
function emitted(userId: string) {
  return h.track.mock.calls.filter(
    ([uid, name]) => uid === userId && name === EVENT,
  );
}

function signIn(userId: string, role = "USER") {
  h.getServerSession.mockResolvedValue({
    user: { id: userId, email: `${userId}@example.com`, role },
  });
}

function jsonRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let nextId = 0;
const newId = (prefix: string) => `${prefix}-${++nextId}`;

beforeEach(() => {
  h.table.length = 0;
  h.track.mockClear();
  for (const model of Object.values(h.db)) {
    if (typeof model === "function") {
      (model as ReturnType<typeof vi.fn>).mockReset();
      continue;
    }
    for (const [name, method] of Object.entries(model)) {
      if (model === h.db.activationEvent && name === "count") {
        (method as ReturnType<typeof vi.fn>).mockClear();
      } else {
        (method as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
  // An interactive transaction runs its callback against the same client; an
  // array transaction resolves each queued write.
  h.db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: typeof h.db) => unknown)(h.db)
      : Promise.all(arg as Promise<unknown>[]),
  );
  h.db.report.create.mockImplementation(async () => ({
    id: newId("report"),
    user: { name: "Tester", email: "t@example.com" },
  }));
  h.db.report.count.mockResolvedValue(0);
  h.db.client.findFirst.mockResolvedValue(null);
  h.db.client.create.mockImplementation(async () => ({ id: newId("client") }));
  h.db.client.update.mockResolvedValue({});
  h.db.auditLog.create.mockResolvedValue({});
  h.db.inspection.create.mockImplementation(async () => ({
    id: newId("inspection"),
    propertyAddress: "1 Test St",
    propertyPostcode: "4000",
  }));
  h.db.inspection.update.mockResolvedValue({});
  h.db.inspection.findFirst.mockResolvedValue(null);
  h.db.liveTeacherSession.findFirst.mockResolvedValue(null);
  h.db.pilotObservation.create.mockResolvedValue({});
  h.db.scopeItem.create.mockResolvedValue({});
  h.db.scopeItem.createMany.mockResolvedValue({ count: 0 });
  h.db.costEstimate.createMany.mockResolvedValue({ count: 0 });
  h.db.moistureReading.create.mockResolvedValue({});
});

// ═════════════════════════════════════════════════════════════════════════════
// COUNTED PATHS — fires once on the first report, never on the second
// ═════════════════════════════════════════════════════════════════════════════

describe("counted: POST /api/reports (full report form)", () => {
  const body = {
    title: "Kitchen water damage",
    clientName: "Jane Client",
    propertyAddress: "1 Test St, Brisbane QLD 4000",
    waterCategory: "1",
    waterClass: "2",
    hazardType: "Water",
    insuranceType: "Building",
    affectedArea: 20,
  };

  it("records first_report_saved on the first report and not on the second", async () => {
    const user = "u-reports";
    signIn(user);

    const first = await postReports(jsonRequest("/api/reports", body));
    expect(first.status).toBe(201);
    const { id: firstId } = await first.json();
    await settle();

    const second = await postReports(jsonRequest("/api/reports", body));
    expect(second.status).toBe(201);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(2);
    expect(emitted(user)).toHaveLength(1);
    expect(emitted(user)[0][2]).toEqual({ reportId: firstId });
  });
});

describe("counted: POST /api/reports/initial-entry (Reports → New form)", () => {
  const body = {
    clientName: "Jane Client",
    propertyAddress: "1 Test St, Brisbane QLD",
    propertyPostcode: "4000",
    technicianFieldReport: "Burst flexi hose under kitchen sink, 20 m2 wet.",
  };

  it("records first_report_saved on the first report and not on the second", async () => {
    const user = "u-initial-entry";
    signIn(user);
    h.db.user.findUnique.mockResolvedValue({
      id: user,
      subscriptionStatus: "TRIAL",
    });

    const first = await postInitialEntry(
      jsonRequest("/api/reports/initial-entry", body),
    );
    expect(first.status).toBe(200);
    const { report: firstReport } = await first.json();
    await settle();

    const second = await postInitialEntry(
      jsonRequest("/api/reports/initial-entry", body),
    );
    expect(second.status).toBe(200);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(2);
    expect(emitted(user)).toHaveLength(1);
    expect(emitted(user)[0][2]).toEqual({ reportId: firstReport.id });
  });
});

describe("counted: POST /api/reports/generate-enhanced (AI report writer)", () => {
  const body = {
    technicianNotes: "Category 1 water from a burst hose; carpet and underlay wet.",
    clientName: "Jane Client",
    propertyAddress: "1 Test St, Brisbane QLD 4000",
  };

  function signInSubscriber(user: string) {
    signIn(user);
    h.db.user.findUnique.mockResolvedValue({
      name: "Tech",
      email: `${user}@example.com`,
      subscriptionStatus: "TRIAL",
      creditsRemaining: 5,
      totalCreditsUsed: 0,
      organization: { country: "AU" },
    });
  }

  it("records first_report_saved when it creates the first report, not on the second", async () => {
    const user = "u-generate-enhanced";
    signInSubscriber(user);

    const first = await postGenerateEnhanced(
      jsonRequest("/api/reports/generate-enhanced", body),
    );
    expect(first.status).toBe(200);
    const { reportId: firstId } = await first.json();
    await settle();

    const second = await postGenerateEnhanced(
      jsonRequest("/api/reports/generate-enhanced", body),
    );
    expect(second.status).toBe(200);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(2);
    expect(emitted(user)).toHaveLength(1);
    expect(emitted(user)[0][2]).toEqual({ reportId: firstId });
  });

  it("does not record it when regenerating an EXISTING report (not a new report)", async () => {
    const user = "u-generate-enhanced-update";
    signInSubscriber(user);
    h.db.report.findUnique.mockResolvedValue({
      propertyPostcode: "4000",
      propertyAddress: "1 Test St",
      inspection: null,
    });
    h.db.report.update.mockResolvedValue({ id: "existing-report" });

    const res = await postGenerateEnhanced(
      jsonRequest("/api/reports/generate-enhanced", {
        ...body,
        reportId: "existing-report",
      }),
    );
    expect(res.status).toBe(200);
    await settle();

    expect(h.db.report.update).toHaveBeenCalledTimes(1);
    expect(h.db.report.create).not.toHaveBeenCalled();
    expect(emitted(user)).toHaveLength(0);
  });
});

describe("counted: POST /api/integrations/oauth/[provider]/jobs (import from a connected job system)", () => {
  const params = () => ({ params: Promise.resolve({ provider: "xero" }) });
  const job = (externalId: string, claimId: string | null = null) => ({
    id: `ej-${externalId}`,
    externalId,
    claimId,
    clientExternalId: null,
    title: `Job ${externalId}`,
    description: "Water damage, rear bedroom",
    address: "1 Test St",
    status: "SCHEDULED",
  });

  beforeEach(() => {
    h.db.integration.findFirst.mockResolvedValue({ id: "integration-1" });
    h.db.externalJob.update.mockResolvedValue({});
  });

  it("records first_report_saved ONCE for a first import of several jobs, and not on a later import", async () => {
    const user = "u-import";
    signIn(user);

    h.db.externalJob.findMany.mockResolvedValueOnce([job("A"), job("B")]);
    const first = await postImportJobs(
      jsonRequest("/api/integrations/oauth/xero/jobs", { jobIds: ["A", "B"] }),
      params(),
    );
    expect(first.status).toBe(200);
    expect((await first.json()).imported).toBe(2);
    await settle();

    h.db.externalJob.findMany.mockResolvedValueOnce([job("C")]);
    const second = await postImportJobs(
      jsonRequest("/api/integrations/oauth/xero/jobs", { jobIds: ["C"] }),
      params(),
    );
    expect(second.status).toBe(200);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(3);
    expect(emitted(user)).toHaveLength(1);
  });

  it("does not record it when every job was already imported (no report created)", async () => {
    const user = "u-import-relink";
    signIn(user);
    h.db.externalJob.findMany.mockResolvedValueOnce([job("A", "report-existing")]);
    h.db.report.findFirst.mockResolvedValue({ id: "report-existing" });

    const res = await postImportJobs(
      jsonRequest("/api/integrations/oauth/xero/jobs", { jobIds: ["A"] }),
      params(),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).imported).toBe(1);
    await settle();

    expect(h.db.report.create).not.toHaveBeenCalled();
    expect(emitted(user)).toHaveLength(0);
  });
});

describe("counted: POST /api/inspections/[id]/submit (inspection submitted as a report)", () => {
  const inspection = (id: string) => ({
    id,
    status: "DRAFT",
    claimType: "WATER",
    propertyAddress: "1 Test St",
    propertyPostcode: "4000",
    inspectionDate: new Date(),
    reportId: null,
    environmentalData: null,
    moistureReadings: [],
    affectedAreas: [],
    scopeItems: [],
    photos: [],
  });
  const submit = (id: string) =>
    postSubmitInspection(
      jsonRequest(`/api/inspections/${id}/submit`),
      { params: Promise.resolve({ id }) },
    );

  it("records first_report_saved on the first submitted inspection and not on the second", async () => {
    const user = "u-submit";
    signIn(user);
    h.db.inspection.updateMany.mockResolvedValue({ count: 1 });

    h.db.inspection.findUnique.mockResolvedValue(inspection("insp-1"));
    const first = await submit("insp-1");
    expect(first.status).toBe(200);
    await settle();

    h.db.inspection.findUnique.mockResolvedValue(inspection("insp-2"));
    const second = await submit("insp-2");
    expect(second.status).toBe(200);
    await settle();

    expect(h.db.inspection.updateMany).toHaveBeenCalledTimes(2);
    expect(emitted(user)).toHaveLength(1);
    expect(emitted(user)[0][2]).toEqual({
      inspectionId: "insp-1",
      reportId: null,
    });
  });

  it("does not record it when the submit loses the race (409, nothing submitted)", async () => {
    const user = "u-submit-conflict";
    signIn(user);
    h.db.inspection.findUnique.mockResolvedValue(inspection("insp-3"));
    h.db.inspection.updateMany.mockResolvedValue({ count: 0 });

    const res = await submit("insp-3");
    expect(res.status).toBe(409);
    await settle();

    expect(emitted(user)).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NOT COUNTED — each route is driven all the way to its write, then checked
// ═════════════════════════════════════════════════════════════════════════════

describe("not counted: POST /api/inspections (draft auto-create)", () => {
  // components/NIRTechnicianInputForm.tsx:1311-1325 calls this silently 1.5 s
  // after a claim type, address and postcode are typed. It is the start of an
  // inspection, not a saved report; counting it would mark anyone who typed
  // an address as activated.
  it("does not record first_report_saved for a new draft inspection", async () => {
    const user = "u-inspection-draft";
    signIn(user);

    const res = await postInspection(
      jsonRequest("/api/inspections", {
        propertyAddress: "1 Test St",
        propertyPostcode: "4000",
        claimType: "WATER",
      }),
    );
    expect(res.status).toBe(201);
    await settle();

    expect(h.db.inspection.create).toHaveBeenCalledTimes(1);
    expect(emitted(user)).toHaveLength(0);
  });

  it("does not record it when a client is attached (the empty shell report is not a real report)", async () => {
    const user = "u-inspection-shell";
    signIn(user);
    h.db.client.findFirst.mockResolvedValue({ id: "client-1", name: "Jane" });

    const res = await postInspection(
      jsonRequest("/api/inspections", {
        propertyAddress: "1 Test St",
        propertyPostcode: "4000",
        clientId: "client-1",
      }),
    );
    expect(res.status).toBe(201);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(1);
    expect(h.db.inspection.create).toHaveBeenCalledTimes(1);
    expect(emitted(user)).toHaveLength(0);
  });
});

describe("not counted: POST /api/setup/activate (sample report)", () => {
  it("seeds a sample report without recording first_report_saved", async () => {
    const user = "u-setup";
    signIn(user);
    h.db.organization.findFirst.mockResolvedValue({
      id: "org-1",
      setupStartedAt: new Date(Date.now() - 60_000),
      setupCompletedAt: null,
      setupMode: "GUIDED",
      logoUrl: null,
      primaryColor: null,
      accentColor: null,
    });
    h.db.organization.update.mockResolvedValue({
      id: "org-1",
      setupMode: "GUIDED",
      setupStartedAt: new Date(Date.now() - 60_000),
      setupCompletedAt: new Date(),
    });
    h.db.user.findUnique.mockResolvedValue({
      email: `${user}@example.com`,
      name: "Owner",
    });

    const res = await postSetupActivate(jsonRequest("/api/setup/activate", {}));
    expect(res.status).toBe(200);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(1);
    expect(h.db.report.create.mock.calls[0][0].data.isSample).toBe(true);
    expect(emitted(user)).toHaveLength(0);
  });
});

describe("not counted: sign-up demo data (lib/demo-data.ts)", () => {
  it("seeds a sample report without recording first_report_saved", async () => {
    const user = "u-demo-data";

    await seedDemoDataForNewUser(user);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(1);
    expect(h.db.report.create.mock.calls[0][0].data.isSample).toBe(true);
    expect(emitted(user)).toHaveLength(0);
  });
});

describe("not counted: POST /api/admin/seed-demo (admin demo job)", () => {
  it("seeds a demo report and inspection without recording first_report_saved", async () => {
    const user = "u-admin-seed";
    signIn(user, "ADMIN");

    const res = await postSeedDemo(jsonRequest("/api/admin/seed-demo"));
    expect(res.status).toBe(200);
    expect((await res.json()).seeded).toBe(true);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(1);
    expect(h.db.inspection.create).toHaveBeenCalledTimes(1);
    expect(emitted(user)).toHaveLength(0);
  });
});

describe("not counted: copies of an existing report", () => {
  const original = {
    id: "report-original",
    title: "Kitchen water damage",
    clientName: "Jane",
    propertyAddress: "1 Test St",
    hazardType: "Water",
    insuranceType: "Building",
    reportNumber: "WD-2026-000001",
    status: "COMPLETED",
  };

  it("POST /api/reports/[id]/duplicate does not record first_report_saved", async () => {
    const user = "u-duplicate";
    signIn(user);
    h.db.report.findFirst.mockResolvedValue({ ...original, userId: user });

    const res = await postDuplicate(
      jsonRequest("/api/reports/report-original/duplicate"),
      { params: Promise.resolve({ id: "report-original" }) },
    );
    expect(res.status).toBe(201);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(1);
    expect(emitted(user)).toHaveLength(0);
  });

  it("POST /api/reports/bulk-duplicate does not record first_report_saved", async () => {
    const user = "u-bulk-duplicate";
    signIn(user);
    h.db.report.findMany.mockResolvedValue([{ ...original, userId: user }]);

    const res = await postBulkDuplicate(
      jsonRequest("/api/reports/bulk-duplicate", { ids: ["report-original"] }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).duplicated).toBe(1);
    await settle();

    expect(h.db.report.create).toHaveBeenCalledTimes(1);
    expect(emitted(user)).toHaveLength(0);
  });
});

describe("not counted: every other seed, demo, sample or partner-push writer", () => {
  // These write reports or inspections directly and are not user-authored:
  // a test-only seeder, a partner webhook, and the sample/demo/copy paths
  // above. None of them may reference the activation event or its writer.
  const files = [
    "app/api/test/seed-inspection/route.ts",
    "app/api/webhooks/dr-nrpg/route.ts",
    "app/api/setup/activate/route.ts",
    "app/api/admin/seed-demo/route.ts",
    "lib/demo-data.ts",
    "app/api/reports/[id]/duplicate/route.ts",
    "app/api/reports/bulk-duplicate/route.ts",
    "app/api/inspections/route.ts",
  ];

  it.each(files)("%s never records first_report_saved", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/first_report_saved/);
    expect(source).not.toMatch(/@\/lib\/analytics\/(track|first-report-saved)/);
  });
});
