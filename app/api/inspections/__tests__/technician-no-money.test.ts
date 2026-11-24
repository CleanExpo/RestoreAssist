/**
 * RA-8494 (DRC S1) — a technician login never receives a money value.
 *
 * DRC (NSW) asked whether technicians can be stopped from seeing costs. A
 * technician is a User with role USER inside a business. Before RA-8494 money
 * was hidden route by route, and two kinds of hole were open:
 *
 *   1. job reads that return the whole job (GET /api/inspections/[id], and
 *      GET /api/inspections?reportId=) carried the cost estimate lines, scope
 *      item rates and the job's cost total to any colleague who could open it;
 *   2. every money route that checks only "did you create this record"
 *      (cost estimates, invoices, estimates, the report's cost estimate) gave
 *      the money to a technician who had created the job themselves.
 *
 * The oracle does not depend on any field name. Every money value in the
 * mocked database is the sentinel 7319.37, and a technician's response must
 * not contain "7319" anywhere. Each refusal is paired with a positive control
 * (a MANAGER, or a solo account with no business, still gets past), so a test
 * that refuses everybody cannot pass.
 *
 * This file must not import `lib/auth/redact-money.ts`: it tests behaviour,
 * so it goes red on the unfixed routes because money leaks, not because a
 * module is missing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocked database ───────────────────────────────────────────────────────

const M = 7319.37; // every money value in the fixtures
const SENTINEL = "7319";
// The money rule's refusal. A technician's 403 must be this one, so a 403 from
// some other check cannot pass for the rule.
const MONEY_REFUSAL = "Only an owner or manager can see prices";

const OWNER = "tech-owner"; // a technician who created the job
const ORG = "org_1";

type Role = "USER" | "MANAGER" | "ADMIN";
const LEFT_AT = new Date("2026-11-01T00:00:00Z");
const USERS: Record<
  string,
  {
    role: Role;
    organizationId: string | null;
    organizationLeftAt?: Date | null;
    organizationLeftId?: string | null;
    ownedOrganizations?: { id: string }[];
  }
> = {
  [OWNER]: { role: "USER", organizationId: ORG },
  tech: { role: "USER", organizationId: ORG }, // a colleague, not the creator
  manager: { role: "MANAGER", organizationId: ORG },
  boss: { role: "ADMIN", organizationId: ORG },
  solo: { role: "USER", organizationId: null }, // a solo account, no business
  // Removed from the business: organisation cleared, role kept (team/members DELETE).
  removedManager: {
    role: "MANAGER",
    organizationId: null,
    organizationLeftAt: LEFT_AT,
    organizationLeftId: ORG,
  },
  removedTech: {
    role: "USER",
    organizationId: null,
    organizationLeftAt: LEFT_AT,
    organizationLeftId: ORG,
  },
  // The business's owner whose row still says USER (created before owners were ADMIN).
  legacyOwner: { role: "USER", organizationId: ORG, ownedOrganizations: [{ id: ORG }] },
  // Left one business, now a manager in another: the old markers stay set.
  rehiredManager: {
    role: "MANAGER",
    organizationId: "org_2",
    organizationLeftAt: LEFT_AT,
    organizationLeftId: ORG,
  },
};

const h = vi.hoisted(() => {
  const fns = new Map<string, ReturnType<typeof vi.fn>>();
  return {
    fns,
    getServerSession: vi.fn(),
    generateNIRPDF: vi.fn(),
    generateClientSummary: vi.fn(),
    extractReportFromUpload: vi.fn(),
    // In-memory share links: token -> report id.
    shares: new Map<string, string>(),
    iicrcPdf: vi.fn(),
    rawRows: [] as unknown[],
    // Per-test overrides on every row the Prisma double answers.
    rowPatch: {} as Record<string, unknown>,
  };
});

function costLine() {
  return {
    id: "ce_1",
    inspectionId: "insp_1",
    scopeItemId: null,
    category: "Drying",
    description: "Dehumidifier hire",
    quantity: 3,
    unit: "day",
    rate: M,
    subtotal: M,
    contingency: M,
    total: M,
    costDatabaseId: null,
    isEstimated: true,
    lineKind: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };
}

function scopeItem() {
  return {
    id: "si_1",
    inspectionId: "insp_1",
    itemType: "install_dehumidification",
    description: "Install dehumidifier",
    areaId: null,
    quantity: 2,
    unit: "units",
    specification: null,
    autoDetermined: false,
    justification: null,
    source: null,
    clauseRef: null,
    isRequired: true,
    isSelected: true,
    xeroAccountCode: null,
    rateSource: "library",
    suggestedRate: M,
    roomId: null,
    sketchRoomId: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };
}

/** One job, created by OWNER inside ORG, with money on every money column. */
function inspectionFixture() {
  return {
    id: "insp_1",
    userId: OWNER,
    workspaceId: null,
    technicianId: "tech",
    reportId: "rep_1",
    inspectionNumber: "INS-1",
    status: "ESTIMATED",
    propertyAddress: "1 Test St",
    propertyPostcode: "2000",
    inspectionDate: new Date("2026-10-01T00:00:00Z"),
    completedAt: null,
    signedAt: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
    technicianName: "Tech",
    totalUsageCost: M,
    environmentalData: [],
    moistureReadings: [],
    affectedAreas: [],
    scopeItems: [scopeItem()],
    classifications: [],
    costEstimates: [costLine()],
    photos: [],
    // As cost-estimates/route.ts writes it: the estimate total inside the
    // audit row's JSON text (verdict round 2).
    // The scope narrative generate-scope stored from a priced prompt.
    generatedNarrative: `Comparable jobs averaged $${M} ex-tax.`,
    auditLogs: [
      {
        id: "aud_1",
        action: "Cost estimate generated",
        entityType: "CostEstimate",
        changes: JSON.stringify({ itemCount: 3, total: M, pricingSource: "library" }),
        previousValue: null,
        newValue: JSON.stringify({ totalIncGST: M }),
        timestamp: new Date("2026-10-02T00:00:00Z"),
      },
    ],
    claimSketches: [],
    report: null,
    user: { organizationId: ORG },
  };
}

/** A generic money record (invoice, estimate, template, payment, ...). */
function moneyRow() {
  return {
    id: "row_1",
    userId: OWNER,
    inspectionId: "insp_1",
    reportId: "rep_1",
    invoiceId: "inv_1",
    status: "DRAFT",
    invoiceNumber: "INV-1",
    currency: "AUD",
    subtotalExGST: M,
    gstAmount: M,
    totalIncGST: M,
    amountPaid: M,
    amountDue: M,
    amount: M,
    unitPrice: M,
    subtotal: M,
    total: M,
    rate: M,
    totalCost: M,
    lineItemsTemplate: [{ description: "Labour", quantity: 1, unitPrice: M }],
    lineItems: [{ id: "li_1", description: "Labour", quantity: 1, unitPrice: M, subtotal: M, gstAmount: M, total: M }],
    payments: [{ id: "pay_1", amount: M, status: "SUCCEEDED" }],
    client: { id: "cl_1", name: "Client" },
    reports: [{ id: "rep_1", title: "Report", totalCost: M, createdAt: new Date("2026-10-01T00:00:00Z") }],
    _count: { reports: 1 },
    _sum: { totalIncGST: M },
    estimates: [{ id: "est_1", totalIncGST: M }],
    equipmentCostTotal: M,
    estimatedCost: M,
    replacementValueAud: M,
    totalExTax: M,
    labourCostTotal: M,
    chemicalCostTotal: M,
    // A cost-estimation payload and a client-written NIR blob, both priced.
    costEstimationData: JSON.stringify({ lines: [{ description: "Labour", total: M }] }),
    moistureReadings: JSON.stringify({ moistureReadings: [], costEstimates: [{ description: "Drying", total: M }] }),
    // Priced markdown from generate-scope-of-works, and the structured report
    // (each machine's daily rate) stored in detailedReport.
    scopeOfWorksDocument: `## Extraction\n- **Rate:** $${M}`,
    detailedReport: JSON.stringify({ summary: "Water in hallway", equipmentSelection: [{ groupId: "lgr-85", dailyRate: M }] }),
    // A manager's cached client summary (priced), never fresh, so every
    // test still generates; and the link to the stored priced Excel export.
    clientSummaryCache: `The drying works total $${M} including GST.`,
    clientSummaryCachedAt: null,
    excelReportUrl: `https://files.example.test/report-${M}.xlsx`,
    // JSON text columns on Report that carry prices inside them.
    equipmentSelection: JSON.stringify([{ groupId: "lgr-85", quantity: 2, dailyRate: M }]),
    scopeOfWorksData: JSON.stringify({ lines: [{ description: "Extraction", quantity: 1, rate: M, total: M }] }),
    // Report version history: a change entry for a money field.
    versionHistory: JSON.stringify([
      { version: 2, action: "Edited", changes: [{ field: "totalCost", from: M, to: M }] },
    ]),
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    dueDate: new Date("2026-11-01T00:00:00Z"),
    issueDate: new Date("2026-10-01T00:00:00Z"),
  };
}

/**
 * Emulates a reach-filtered inspection lookup: the job belongs to OWNER in
 * ORG. A `where` that pins a `userId` or an organisation matches only when it
 * names the owner or the owner's organisation; a bare id always matches.
 */
function inspectionLookup(args: { where?: unknown; include?: unknown; select?: unknown } = {}) {
  const where = JSON.stringify(args.where ?? {});
  const pinned = where.includes('"userId"') || where.includes("organizationId") || where.includes('"technicianId"');
  const matches =
    !pinned ||
    where.includes(`"userId":"${OWNER}"`) ||
    where.includes(`"organizationId":"${ORG}"`) ||
    where.includes('"technicianId":"tech"');
  return matches ? inspectionFixture() : null;
}

function userLookup(args: { where?: { id?: string } } = {}) {
  const id = args.where?.id;
  const u = id ? USERS[id] : undefined;
  if (!u) return null;
  return {
    id,
    ...u,
    email: `${id}@example.com`,
    name: id,
    organizationLeftAt: u.organizationLeftAt ?? null,
    organizationLeftId: u.organizationLeftId ?? null,
    ownedOrganizations: u.ownedOrganizations ?? [],
    subscriptionStatus: "ACTIVE",
    businessName: "DRC Test",
    organization: u.organizationId
      ? {
          id: u.organizationId,
          name: "DRC Test",
          // Only the legacy owner row names itself as the business's owner;
          // the other fixtures leave the owner unset, as they always have, so
          // the tenancy and subscription reads they drive are unchanged.
          ...((u.ownedOrganizations ?? []).some((o) => o.id === u.organizationId) ? { ownerId: id } : {}),
        }
      : null,

  };
}

function defaultFor(model: string, method: string): (...a: any[]) => unknown {
  if (model === "user") {
    if (method === "findUnique" || method === "findFirst") return async (a) => userLookup(a);
    if (method === "findMany") return async () => [];
  }
  if (model === "inspection") {
    if (method === "findUnique" || method === "findFirst") return async (a) => inspectionLookup(a);
    if (method === "findMany") return async (a) => {
      const row = inspectionLookup(a);
      return row ? [row] : [];
    };
  }
  if (model === "userInvite" || model === "organizationMember" || model === "workspaceMember") {
    if (method === "findMany") return async () => [];
    return async () => null;
  }
  switch (method) {
    case "findUnique":
    case "findFirst":
    case "findUniqueOrThrow":
    case "findFirstOrThrow":
    case "create":
    case "update":
    case "upsert":
    case "delete":
      return async () => ({ ...moneyRow(), ...h.rowPatch });
    case "findMany":
      return async () => [{ ...moneyRow(), ...h.rowPatch }];
    case "count":
      return async () => 1;
    case "aggregate":
      return async () => ({ _sum: { totalIncGST: M, amount: M, amountPaid: M, amountDue: M, total: M }, _count: { _all: 1 }, _avg: {} });
    case "groupBy":
      return async () => [];
    case "updateMany":
    case "deleteMany":
    case "createMany":
      return async () => ({ count: 1 });
    default:
      return async () => null;
  }
}

function modelProxy(model: string) {
  return new Proxy(
    {},
    {
      get(_t, method: string) {
        const key = `${model}.${method}`;
        let fn = h.fns.get(key);
        if (!fn) {
          fn = vi.fn(defaultFor(model, method));
          h.fns.set(key, fn);
        }
        return fn;
      },
    },
  );
}

const prismaMock: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === "then") return undefined;
      if (prop === "$transaction") {
        return async (arg: unknown) =>
          typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prismaMock) : Promise.all(arg as unknown[]);
      }
      // Raw reads (the similar-jobs vector search) answer whatever a test set.
      if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return async () => h.rawRows;
      if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return async () => 0;
      return modelProxy(prop);
    },
  },
);

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }));
vi.mock("next-auth", () => ({ getServerSession: h.getServerSession }));
vi.mock("next-auth/next", () => ({ getServerSession: h.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/organization-credits", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMembershipStart: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/nir-report-generation", () => ({ generateNIRPDF: h.generateNIRPDF }));
vi.mock("@/lib/reports/claim-sketch-floors", () => ({ claimSketchesToFloors: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/reports/append-sketch-pages", () => ({ appendSketchPages: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/report-share/access", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mintReportShareAccess: vi.fn(async (input: { reportId: string }) => {
    const token = `share-${h.shares.size + 1}`;
    h.shares.set(token, input.reportId);
    return { token, expiresAt: new Date("2099-01-01T00:00:00Z"), id: `sa_${h.shares.size}` };
  }),
  verifyReportReaderToken: vi.fn(async (token: string) =>
    h.shares.has(token) ? { reportId: h.shares.get(token)!, scope: "HOMEOWNER" } : null,
  ),
}));
vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: (...args: unknown[]) => h.iicrcPdf(...args),
}));
vi.mock("@/lib/services/ai/extract-report-from-upload", () => ({
  extractReportFromUpload: (...args: unknown[]) => h.extractReportFromUpload(...args),
}));
vi.mock("@/lib/billing/paid-base-plan", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requirePaidBasePlan: vi.fn().mockResolvedValue(null),
}));
// Report duplication charges a report credit; the plan limit is not the subject here.
vi.mock("@/lib/report-limits", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  canCreateReport: vi.fn().mockResolvedValue({ allowed: true }),
  deductCreditsAndTrackUsage: vi.fn().mockResolvedValue(undefined),
  refundCreditsAndTrackUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async (importOriginal) => {
  const real = await importOriginal<Record<string, any>>();
  return {
    ...real,
    // The client summary needs an Anthropic key to reach its (mocked) model
    // call; every other provider stays keyless, so nothing reaches a network.
    resolveWorkspaceAiKey: vi.fn(async (_userId: string, provider: string) => {
      if (provider === "ANTHROPIC") return { apiKey: "test-key-not-real" };
      throw new real.NoWorkspaceKeyError(provider);
    }),
  };
});
vi.mock("@/lib/services/ai/generate-client-summary", () => ({
  generateClientSummaryService: h.generateClientSummary,
}));

/** Every value stored under `key` anywhere in a parsed JSON body. */
function valuesOf(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((n) => valuesOf(n, key, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.splice(out.length, 0, v);
      valuesOf(v, key, out);
    }
  }
  return out;
}

function signIn(id: string) {
  h.getServerSession.mockResolvedValue({
    user: { id, role: USERS[id].role, email: `${id}@example.com`, organizationId: USERS[id].organizationId },
  });
}

function req(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", "idempotency-key": `k-${Math.random()}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

async function bodyText(res: Response): Promise<string> {
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("utf8");
}

beforeEach(() => {
  h.fns.clear();
  h.rawRows = [];
  h.rowPatch = {};
  h.shares.clear();
  h.iicrcPdf.mockReset();
  h.iicrcPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  // No test in this file may reach a network.
  vi.stubGlobal("fetch", async () => {
    throw new Error("network disabled in technician-no-money.test.ts");
  });
  h.generateClientSummary.mockReset();
  h.generateClientSummary.mockResolvedValue({
    ok: true,
    data: { summary: "Your home is drying well.", fellBack: false, attempts: 1 },
  });
  h.getServerSession.mockReset();
  h.generateNIRPDF.mockReset();
  h.generateNIRPDF.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

// ─── Part 1: job reads carry the job, never its money ──────────────────────

describe("RA-8494 job reads: the job without its money", () => {
  const getDetail = async () => (await import("../[id]/route")).GET;
  const getList = async () => (await import("../route")).GET;

  for (const who of ["tech", OWNER]) {
    it(`GET /api/inspections/[id] as ${who} (USER in the business): the job, no money`, async () => {
      signIn(who);
      const res = await (await getDetail())(req("/api/inspections/insp_1"), ctx({ id: "insp_1" }) as any);
      expect(res.status).toBe(200);
      const text = await bodyText(res);
      expect(text).toContain("insp_1");
      expect(text).not.toContain(SENTINEL);
      const body = JSON.parse(text);
      expect(body.inspection.costEstimates).toEqual([]);
      expect(body.inspection.scopeItems[0].description).toBe("Install dehumidifier");
    });

    it(`GET /api/inspections?reportId= as ${who}: the job, no money`, async () => {
      signIn(who);
      const res = await (await getList())(req("/api/inspections?reportId=rep_1"));
      expect(res.status).toBe(200);
      const text = await bodyText(res);
      expect(text).toContain("insp_1");
      expect(text).not.toContain(SENTINEL);
    });
  }

  for (const who of ["manager", "boss"]) {
    it(`positive control: GET /api/inspections/[id] as ${who} keeps the money`, async () => {
      signIn(who);
      const res = await (await getDetail())(req("/api/inspections/insp_1"), ctx({ id: "insp_1" }) as any);
      expect(res.status).toBe(200);
      expect(await bodyText(res)).toContain(SENTINEL);
    });
  }

  it("positive control: GET /api/inspections?reportId= as manager keeps the money", async () => {
    signIn("manager");
    const res = await (await getList())(req("/api/inspections?reportId=rep_1"));
    expect(res.status).toBe(200);
    expect(await bodyText(res)).toContain(SENTINEL);
  });
});

describe("RA-8494 inspection report: the technician who created the job gets no money", () => {
  const getReport = async () => (await import("../[id]/report/route")).GET;

  it("report JSON for the creating technician: no cost estimate, no rates", async () => {
    signIn(OWNER);
    const res = await (await getReport())(
      req("/api/inspections/insp_1/report?format=json"),
      ctx({ id: "insp_1" }) as any,
    );
    expect(res.status).toBe(200);
    const text = await bodyText(res);
    expect(text).not.toContain(SENTINEL);
    expect(JSON.parse(text).costEstimate).toBeNull();
  });

  it("report PDF for the creating technician: the PDF builder receives no money", async () => {
    signIn(OWNER);
    await (await getReport())(req("/api/inspections/insp_1/report?format=pdf"), ctx({ id: "insp_1" }) as any);
    expect(h.generateNIRPDF).toHaveBeenCalled();
    expect(JSON.stringify(h.generateNIRPDF.mock.calls)).not.toContain(SENTINEL);
  });

  it("positive control: a MANAGER's report JSON keeps the cost estimate", async () => {
    signIn("manager");
    const res = await (await getReport())(
      req("/api/inspections/insp_1/report?format=json"),
      ctx({ id: "insp_1" }) as any,
    );
    expect(res.status).toBe(200);
    expect(await bodyText(res)).toContain(SENTINEL);
  });
});

describe("RA-8494 report reads: the report without its money", () => {
  // `noControl`: the manager positive control cannot run for this route (the
  // emulated job grants no write reach to a manager); the red run against the
  // unfixed route is what shows the technician case can fail.
  // `moneyKey`: the route computes its figure (a sum or a count), so the
  // sentinel cannot appear; the oracle is the money field itself.
  // `creatorOnly`: the route admits only the job's creator among technicians
  // (an unassigned colleague gets 404), so only the creator case runs.
  // `status`: the success status when it is not 200 (a create answers 201).
  // `noDollar`: the route computes a dollar figure into text, so the oracle
  // is that no "$<number>" appears.
  const cases: {
    name: string;
    run: () => Promise<Response>;
    noControl?: true;
    moneyKey?: string;
    creatorOnly?: true;
    status?: number;
    noDollar?: true;
  }[] = [
    {
      name: "GET /api/reports (list)",
      run: async () => (await import("../../reports/route")).GET(req("/api/reports")),
    },
    {
      name: "GET /api/reports/[id]/download-json",
      run: async () =>
        (await import("../../reports/[id]/download-json/route")).GET(
          req("/api/reports/rep_1/download-json"),
          ctx({ id: "rep_1" }) as any,
        ),
    },
    {
      name: "GET /api/reports/[id]",
      run: async () =>
        (await import("../../reports/[id]/route")).GET(
          req("/api/reports/rep_1"),
          ctx({ id: "rep_1" }) as any,
        ),
    },
    {
      name: "PUT /api/reports/[id] (response)",
      run: async () =>
        (await import("../../reports/[id]/route")).PUT(
          req("/api/reports/rep_1", "PUT", { title: "Renamed" }),
          ctx({ id: "rep_1" }) as any,
        ),
    },
    {
      name: "GET /api/clients/[id]",
      run: async () =>
        (await import("../../clients/[id]/route")).GET(
          req("/api/clients/cl_1"),
          ctx({ id: "cl_1" }) as any,
        ),
    },
    {
      name: "PATCH /api/inspections/[id]/scope-items/[itemId] (response)",
      run: async () =>
        (await import("../[id]/scope-items/[itemId]/route")).PATCH(
          req("/api/inspections/insp_1/scope-items/si_1", "PATCH", { isSelected: true }),
          ctx({ id: "insp_1", itemId: "si_1" }) as any,
        ),
      noControl: true,
    },
    {
      name: "GET /api/analytics/dashboard-stats",
      run: async () => (await import("../../analytics/dashboard-stats/route")).GET(req("/api/analytics/dashboard-stats")),
      moneyKey: "revenueMtdAud",
    },
    {
      name: "GET /api/dashboard/home-counts",
      run: async () => (await import("../../dashboard/home-counts/route")).GET(req("/api/dashboard/home-counts")),
      moneyKey: "awaitingPayment",
    },
    {
      name: "GET /api/clients (list)",
      run: async () => (await import("../../clients/route")).GET(req("/api/clients")),
    },
    {
      name: "GET /api/reports/[id]/approvals",
      run: async () =>
        (await import("../../reports/[id]/approvals/route")).GET(
          req("/api/reports/rep_1/approvals"),
          ctx({ id: "rep_1" }) as any,
        ),
    },
    {
      name: "GET /api/inspections/[id]/contents-pack-out",
      run: async () =>
        (await import("../[id]/contents-pack-out/route")).GET(
          req("/api/inspections/insp_1/contents-pack-out"),
          ctx({ id: "insp_1" }) as any,
        ),
      creatorOnly: true,
      noControl: true,
    },
    {
      name: "PATCH /api/reports/[id]/sections (response)",
      run: async () =>
        (await import("../../reports/[id]/sections/route")).PATCH(
          req("/api/reports/rep_1/sections", "PATCH", { section: "assessment", data: { waterCategory: "1" } }),
          ctx({ id: "rep_1" }) as any,
        ),
    },
    {
      name: "POST /api/reports/save-tier-responses (response)",
      run: async () =>
        (await import("../../reports/save-tier-responses/route")).POST(
          req("/api/reports/save-tier-responses", "POST", { reportId: "rep_1", tier: 1, responses: { a: "b" } }),
        ),
    },
    {
      name: "GET /api/synced/jobs",
      run: async () => (await import("../../synced/jobs/route")).GET(req("/api/synced/jobs?source=ascora")),
    },
    {
      name: "GET /api/inspections/[id]/similar-jobs",
      run: async () => {
        h.rawRows = [{ id: "job_9", title: "Past job", similarity: 0.9, totalExTax: M }];
        return (await import("../[id]/similar-jobs/route")).GET(
          req("/api/inspections/insp_1/similar-jobs"),
          ctx({ id: "insp_1" }) as any,
        );
      },
      creatorOnly: true,
      noControl: true,
    },
    {
      name: "POST /api/reports/[id]/approvals/[approvalId]/respond (response)",
      run: async () =>
        (await import("../../reports/[id]/approvals/[approvalId]/respond/route")).POST(
          req("/api/reports/rep_1/approvals/ap_1/respond", "POST", { status: "APPROVED" }),
          ctx({ id: "rep_1", approvalId: "ap_1" }) as any,
        ),
    },
    {
      name: "GET /api/reports/[id]/nir-data",
      run: async () =>
        (await import("../../reports/[id]/nir-data/route")).GET(
          req("/api/reports/rep_1/nir-data"),
          ctx({ id: "rep_1" }) as any,
        ),
    },
    {
      name: "GET /api/restoration-documents/seed",
      run: async () =>
        (await import("../../restoration-documents/seed/route")).GET(
          req("/api/restoration-documents/seed?reportId=rep_1"),
        ),
    },
    {
      name: "GET /api/cost-libraries/search",
      run: async () => (await import("../../cost-libraries/search/route")).GET(req("/api/cost-libraries/search?q=lab")),
    },
    {
      name: "POST /api/inspections/[id]/equipment-calculator (response)",
      run: async () =>
        (await import("../[id]/equipment-calculator/route")).POST(
          req("/api/inspections/insp_1/equipment-calculator", "POST", {
            affectedAreaM2: 40,
            damageClass: "CLASS_2",
            damageCategory: "CAT_1",
          }),
          ctx({ id: "insp_1" }) as any,
        ),
      moneyKey: "energyCostPerDay",
      noDollar: true,
      creatorOnly: true,
      noControl: true,
    },
    {
      name: "POST /api/reports/[id]/duplicate (response)",
      run: async () =>
        (await import("../../reports/[id]/duplicate/route")).POST(
          req("/api/reports/rep_1/duplicate", "POST", {}),
          ctx({ id: "rep_1" }) as any,
        ),
      status: 201,
    },
  ];

  for (const c of cases) {
    for (const who of c.creatorOnly ? [OWNER] : ["tech", OWNER]) {
      it(`${c.name} as ${who}: answered, no money`, async () => {
        signIn(who);
        const res = await c.run();
        const text = await bodyText(res);
        expect(res.status, text.slice(0, 300)).toBe(c.status ?? 200);
        expect(text).not.toContain(SENTINEL);
        if (c.noDollar) expect(text).not.toMatch(/\$\d/);

        // Withheld means null, never absent: readers are typed `number | null`.
        if (c.moneyKey) {
          const found = valuesOf(JSON.parse(text), c.moneyKey);
          expect(found.length).toBeGreaterThan(0);
          expect(found.every((v) => v === null)).toBe(true);
        }
      });
    }
    if (c.noControl) continue;
    it(`positive control: ${c.name} as manager keeps the money`, async () => {
      signIn("manager");
      const res = await c.run();
      const text = await bodyText(res);
      expect(res.status, text.slice(0, 300)).toBe(c.status ?? 200);

      if (c.moneyKey) {
        const found = valuesOf(JSON.parse(text), c.moneyKey);
        expect(found.some((v) => typeof v === "number")).toBe(true);
      } else {
        expect(text).toContain(SENTINEL);
      }
    });
  }
});

describe("RA-8494 report viewer grant: no financials for a technician", () => {
  const grantFor = async (who: string) => {
    signIn(who);
    const { authoriseReportExperienceRead } = await import("@/lib/report-experience/authorise");
    return authoriseReportExperienceRead({
      reportId: "rep_1",
      session: { user: { id: who, role: USERS[who].role } },
    });
  };

  for (const who of ["tech", OWNER]) {
    it(`${who}: may open the report, may not view financials`, async () => {
      const d = await grantFor(who);
      expect(d.ok).toBe(true);
      if (d.ok) expect(d.grant.mayViewFinancials).toBe(false);
    });
  }

  it("positive control: a MANAGER may view financials", async () => {
    const d = await grantFor("manager");
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.grant.mayViewFinancials).toBe(true);
  });
});

describe("RA-8494 money rule: removed members", () => {
  const may = async (who: string) => {
    const { canSeeMoney } = await import("@/lib/auth/redact-money");
    return canSeeMoney({ user: { id: who, role: USERS[who].role } });
  };

  it("a removed MANAGER keeps the role but loses prices", async () => {
    expect(await may("removedManager")).toBe(false);
  });
  it("a removed technician does not become a solo owner", async () => {
    expect(await may("removedTech")).toBe(false);
  });
  it("positive control: a manager who now belongs to another business sees prices", async () => {
    expect(await may("rehiredManager")).toBe(true);
  });
  it("the business's owner sees prices even when their role column says USER", async () => {
    expect(await may("legacyOwner")).toBe(true);
  });
  it("positive control: a technician in the same business still does not", async () => {
    expect(await may("tech")).toBe(false);
  });
  it("positive control: a solo account that never belonged to a business sees prices", async () => {
    expect(await may("solo")).toBe(true);
  });
  it("a removed MANAGER is refused by a money route before any money is read", async () => {
    signIn("removedManager");
    const { GET } = await import("@/app/api/invoices/route");
    const res = await GET(new NextRequest("http://localhost/api/invoices"));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain(MONEY_REFUSAL);
  });
});

// ─── Part 2: money routes refuse a technician up front ─────────────────────

type Handler = (r: NextRequest, c?: any) => Promise<Response>;
interface MoneyRoute {
  name: string;
  load: () => Promise<Record<string, unknown>>;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params?: Record<string, string>;
  body?: unknown;
}

const INV = { id: "inv_1" };
const MONEY_ROUTES: MoneyRoute[] = [
  { name: "cost estimates GET", load: () => import("../[id]/cost-estimates/route"), method: "GET", path: "/api/inspections/insp_1/cost-estimates", params: { id: "insp_1" } },
  { name: "cost estimates POST", load: () => import("../[id]/cost-estimates/route"), method: "POST", path: "/api/inspections/insp_1/cost-estimates", params: { id: "insp_1" }, body: {} },
  { name: "generate invoice GET", load: () => import("../[id]/generate-invoice/route"), method: "GET", path: "/api/inspections/insp_1/generate-invoice", params: { id: "insp_1" } },
  { name: "generate invoice POST", load: () => import("../[id]/generate-invoice/route"), method: "POST", path: "/api/inspections/insp_1/generate-invoice", params: { id: "insp_1" }, body: {} },
  { name: "invoices list GET", load: () => import("../../invoices/route"), method: "GET", path: "/api/invoices" },
  { name: "invoice GET", load: () => import("../../invoices/[id]/route"), method: "GET", path: "/api/invoices/inv_1", params: INV },
  { name: "invoice PUT", load: () => import("../../invoices/[id]/route"), method: "PUT", path: "/api/invoices/inv_1", params: INV, body: {} },
  { name: "invoice DELETE", load: () => import("../../invoices/[id]/route"), method: "DELETE", path: "/api/invoices/inv_1", params: INV },
  { name: "invoice PDF GET", load: () => import("../../invoices/[id]/pdf/route"), method: "GET", path: "/api/invoices/inv_1/pdf", params: INV },
  { name: "invoice send POST", load: () => import("../../invoices/[id]/send/route"), method: "POST", path: "/api/invoices/inv_1/send", params: INV, body: {} },
  { name: "invoice payments POST", load: () => import("../../invoices/[id]/payments/route"), method: "POST", path: "/api/invoices/inv_1/payments", params: INV, body: { amount: 1 } },
  { name: "invoice checkout POST", load: () => import("../../invoices/[id]/checkout/route"), method: "POST", path: "/api/invoices/inv_1/checkout", params: INV, body: {} },
  { name: "invoice sync GET", load: () => import("../../invoices/[id]/sync/route"), method: "GET", path: "/api/invoices/inv_1/sync", params: INV },
  { name: "invoice sync POST", load: () => import("../../invoices/[id]/sync/route"), method: "POST", path: "/api/invoices/inv_1/sync", params: INV, body: {} },
  { name: "invoice retry-sync POST", load: () => import("../../invoices/[id]/retry-sync/route"), method: "POST", path: "/api/invoices/inv_1/retry-sync", params: INV, body: {} },
  { name: "invoice rotate-public-token POST", load: () => import("../../invoices/[id]/rotate-public-token/route"), method: "POST", path: "/api/invoices/inv_1/rotate-public-token", params: INV, body: {} },
  { name: "invoice variations GET", load: () => import("../../invoices/[id]/variations/route"), method: "GET", path: "/api/invoices/inv_1/variations", params: INV },
  { name: "invoice analytics GET", load: () => import("../../invoices/analytics/route"), method: "GET", path: "/api/invoices/analytics" },
  { name: "credit notes GET", load: () => import("../../invoices/credit-notes/route"), method: "GET", path: "/api/invoices/credit-notes" },
  { name: "payments GET", load: () => import("../../invoices/payments/route"), method: "GET", path: "/api/invoices/payments" },
  { name: "payments PATCH", load: () => import("../../invoices/payments/route"), method: "PATCH", path: "/api/invoices/payments", body: {} },
  { name: "payment PATCH", load: () => import("../../invoices/payments/[id]/route"), method: "PATCH", path: "/api/invoices/payments/pay_1", params: { id: "pay_1" }, body: {} },
  { name: "recurring GET", load: () => import("../../invoices/recurring/route"), method: "GET", path: "/api/invoices/recurring" },
  { name: "invoice templates GET", load: () => import("../../invoices/templates/route"), method: "GET", path: "/api/invoices/templates" },
  { name: "invoice templates POST", load: () => import("../../invoices/templates/route"), method: "POST", path: "/api/invoices/templates", body: {} },
  { name: "invoice template GET", load: () => import("../../invoices/templates/[id]/route"), method: "GET", path: "/api/invoices/templates/t_1", params: { id: "t_1" } },
  { name: "invoice template PUT", load: () => import("../../invoices/templates/[id]/route"), method: "PUT", path: "/api/invoices/templates/t_1", params: { id: "t_1" }, body: {} },
  { name: "invoice template DELETE", load: () => import("../../invoices/templates/[id]/route"), method: "DELETE", path: "/api/invoices/templates/t_1", params: { id: "t_1" } },
  { name: "estimates GET", load: () => import("../../estimates/route"), method: "GET", path: "/api/estimates?reportId=rep_1" },
  { name: "estimates POST", load: () => import("../../estimates/route"), method: "POST", path: "/api/estimates", body: { reportId: "rep_1" } },
  { name: "estimate GET", load: () => import("../../estimates/[id]/route"), method: "GET", path: "/api/estimates/est_1", params: { id: "est_1" } },
  { name: "estimate DELETE", load: () => import("../../estimates/[id]/route"), method: "DELETE", path: "/api/estimates/est_1", params: { id: "est_1" } },
  { name: "scope variations GET", load: () => import("../[id]/scope-variations/route"), method: "GET", path: "/api/inspections/insp_1/scope-variations", params: { id: "insp_1" } },
  { name: "scope variations POST", load: () => import("../[id]/scope-variations/route"), method: "POST", path: "/api/inspections/insp_1/scope-variations", params: { id: "insp_1" }, body: {} },
  { name: "scope variations PATCH", load: () => import("../[id]/scope-variations/route"), method: "PATCH", path: "/api/inspections/insp_1/scope-variations", params: { id: "insp_1" }, body: {} },
  { name: "assessment PDF GET", load: () => import("../[id]/assessments/[type]/pdf/route"), method: "GET", path: "/api/inspections/insp_1/assessments/water/pdf", params: { id: "insp_1", type: "water" } },
  { name: "report cost-estimation PDF GET", load: () => import("../../reports/[id]/download-cost-estimation/route"), method: "GET", path: "/api/reports/rep_1/download-cost-estimation", params: { id: "rep_1" } },
  { name: "report Excel GET", load: () => import("../../reports/[id]/export-excel/route"), method: "GET", path: "/api/reports/rep_1/export-excel", params: { id: "rep_1" } },
  { name: "report package GET", load: () => import("../../reports/[id]/export-package/route"), method: "GET", path: "/api/reports/rep_1/export-package", params: { id: "rep_1" } },
  { name: "report detailed PDF POST", load: () => import("../../reports/[id]/generate-detailed/route"), method: "POST", path: "/api/reports/rep_1/generate-detailed", params: { id: "rep_1" }, body: {} },
  { name: "bulk Excel POST", load: () => import("../../reports/bulk-export-excel/route"), method: "POST", path: "/api/reports/bulk-export-excel", body: { reportIds: ["rep_1"] } },
  { name: "generate cost estimation POST", load: () => import("../../reports/generate-cost-estimation/route"), method: "POST", path: "/api/reports/generate-cost-estimation", body: { reportId: "rep_1" } },
  { name: "generate scope of works POST", load: () => import("../../reports/generate-scope-of-works/route"), method: "POST", path: "/api/reports/generate-scope-of-works", body: { reportId: "rep_1" } },
  { name: "report PDF download GET", load: () => import("../../reports/[id]/download/route"), method: "GET", path: "/api/reports/rep_1/download", params: { id: "rep_1" } },
  { name: "bulk Excel list POST", load: () => import("../../reports/bulk-export-excel-list/route"), method: "POST", path: "/api/reports/bulk-export-excel-list", body: {} },
  { name: "scopes GET", load: () => import("../../scopes/route"), method: "GET", path: "/api/scopes?reportId=rep_1" },
  { name: "scopes POST", load: () => import("../../scopes/route"), method: "POST", path: "/api/scopes", body: { reportId: "rep_1" } },
  { name: "revenue projections GET", load: () => import("../../analytics/revenue-projections/route"), method: "GET", path: "/api/analytics/revenue-projections" },
  { name: "analytics narrative GET", load: () => import("../../analytics/narrative/route"), method: "GET", path: "/api/analytics/narrative" },
  { name: "analytics export POST", load: () => import("../../analytics/export/route"), method: "POST", path: "/api/analytics/export", body: { format: "csv" } },
  { name: "price calculator POST", load: () => import("../../calculate/route"), method: "POST", path: "/api/calculate", body: {} },
  { name: "estimate status PATCH", load: () => import("../../estimates/[id]/status/route"), method: "PATCH", path: "/api/estimates/est_1/status", params: { id: "est_1" }, body: { status: "APPROVED" } },
  { name: "revenue leakage GET", load: () => import("../../analytics/revenue-leakage/route"), method: "GET", path: "/api/analytics/revenue-leakage" },
  { name: "report scope PDF GET", load: () => import("../../reports/[id]/download-scope/route"), method: "GET", path: "/api/reports/rep_1/download-scope", params: { id: "rep_1" } },
  { name: "report inspection PDF GET", load: () => import("../../reports/[id]/download-inspection-report/route"), method: "GET", path: "/api/reports/rep_1/download-inspection-report", params: { id: "rep_1" } },
  { name: "report enhanced PDF GET", load: () => import("../../reports/[id]/download-enhanced/route"), method: "GET", path: "/api/reports/rep_1/download-enhanced", params: { id: "rep_1" } },
  { name: "scope GET", load: () => import("../../scopes/[id]/route"), method: "GET", path: "/api/scopes/sc_1", params: { id: "sc_1" } },
  { name: "scope PATCH", load: () => import("../../scopes/[id]/route"), method: "PATCH", path: "/api/scopes/sc_1", params: { id: "sc_1" }, body: { summary: "x" } },
  { name: "scope DELETE", load: () => import("../../scopes/[id]/route"), method: "DELETE", path: "/api/scopes/sc_1", params: { id: "sc_1" } },

];

async function call(route: MoneyRoute): Promise<Response> {
  const mod = await route.load();
  const handler = mod[route.method] as Handler | undefined;
  if (typeof handler !== "function") throw new Error(`${route.name}: no ${route.method} export`);
  return handler(req(route.path, route.method, route.body), route.params ? ctx(route.params) : undefined);
}

describe("RA-8494 money routes: a technician is refused before any money is read", () => {
  for (const route of MONEY_ROUTES) {
    for (const who of [OWNER, "tech"]) {
      it(`${route.name} as ${who}: 403, no money`, async () => {
        signIn(who);
        const res = await call(route);
        expect(res.status).toBe(403);
        const text = await bodyText(res);
        expect(text).not.toContain(SENTINEL);
        expect(text).toContain(MONEY_REFUSAL);
      });
    }

    for (const who of ["manager", "solo"]) {
      it(`positive control: ${route.name} as ${who} is not refused by the money rule`, async () => {
        signIn(who);
        const res = await call(route);
        // Other checks (a creator filter, a missing body field) may still
        // refuse; the money rule must not.
        expect(await bodyText(res)).not.toContain(MONEY_REFUSAL);
      });
    }
  }
});

// ─── Part 3: writes, derived text and server pages ─────────────────────────

const updateWrites = () =>
  (h.fns.get("report.update")?.mock.calls ?? []).map((c) => ((c[0] as any)?.data ?? {}) as Record<string, unknown>);

describe("RA-8494 a technician's save never overwrites money it cannot see", () => {
  it("PUT /api/reports/[id] with the redacted nulls keeps the stored priced fields", async () => {
    signIn(OWNER);
    const { PUT } = await import("../../reports/[id]/route");
    const res = await PUT(
      req("/api/reports/rep_1", "PUT", {
        title: "Field update",
        scopeOfWorksDocument: null,
        costEstimationDocument: null,
        totalCost: null,
        equipmentSelection: JSON.stringify([{ groupId: "lgr-85", quantity: 2, dailyRate: null }]),
        detailedReport: JSON.stringify({ summary: "x", equipmentSelection: [] }),
      }),
      ctx({ id: "rep_1" }) as any,
    );
    expect(res.status, await res.clone().text()).toBe(200);
    const writes = updateWrites();
    expect(writes.length).toBeGreaterThan(0);
    for (const data of writes) {
      for (const key of ["scopeOfWorksDocument", "costEstimationDocument", "totalCost", "equipmentSelection", "detailedReport"]) {
        expect(data[key] === null, `${key} written as null`).toBe(false);
        if (typeof data[key] === "string") expect(data[key], key).not.toContain('"dailyRate":null');
      }
    }
  });

  it("positive control: a MANAGER's PUT still writes the scope of works document", async () => {
    signIn("manager");
    const { PUT } = await import("../../reports/[id]/route");
    const res = await PUT(
      req("/api/reports/rep_1", "PUT", { title: "Office update", scopeOfWorksDocument: "## New scope" }),
      ctx({ id: "rep_1" }) as any,
    );
    expect(res.status, await res.clone().text()).toBe(200);
    expect(updateWrites().some((d) => d.scopeOfWorksDocument === "## New scope")).toBe(true);
  });

  it("the owner's write filter keeps field data and prose, drops money and priced JSON", async () => {
    const { withoutMoneyWrites } = await import("@/lib/auth/redact-money");
    expect(
      withoutMoneyWrites({
        title: "t",
        totalCost: 5,
        scopeOfWorksDocument: null,
        equipmentSelection: "[]",
        detailedReport: "The hallway carpet was wet.",
      }),
    ).toEqual({ title: "t" });
    expect(withoutMoneyWrites({ detailedReport: '{"equipmentSelection":[]}' })).toEqual({});
  });

  it("the owner withholds detailedReport prose whole and strips prices from its JSON", async () => {
    const { redactMoney } = await import("@/lib/auth/redact-money");
    // Prose cannot be shown to be price-free: the inspection narrative is
    // written from priced equipment lines (lib/reports/generate-report-ai.ts).
    expect(redactMoney({ detailedReport: "Moisture mapped in two rooms." }).detailedReport).toBeNull();
    const json = redactMoney({ detailedReport: JSON.stringify({ equipmentSelection: [{ dailyRate: M }] }) });
    expect(json.detailedReport).not.toContain(SENTINEL);
    expect(redactMoney({ detailedReport: "{not json" }).detailedReport).toBeNull();
  });
});

describe("RA-8494 client summary: a technician's summary is written without prices", () => {
  const post = async () =>
    (await import("../../reports/[id]/client-summary/route")).POST(
      req("/api/reports/rep_1/client-summary", "POST", {}),
      ctx({ id: "rep_1" }) as any,
    );

  it("technician: the priced scope never reaches the model, and the shared cache is not replaced", async () => {
    signIn(OWNER);
    const res = await post();
    expect(res.status, await res.clone().text()).toBe(200);
    expect(h.generateClientSummary).toHaveBeenCalledTimes(1);
    expect(h.generateClientSummary.mock.calls[0][0].input.scopeOfWorks).toBeNull();
    expect(updateWrites().some((d) => "clientSummaryCache" in d)).toBe(false);
  });

  it("positive control: a MANAGER's summary uses the priced scope and fills the cache", async () => {
    signIn("manager");
    const res = await post();
    expect(res.status, await res.clone().text()).toBe(200);
    expect(h.generateClientSummary.mock.calls[0][0].input.scopeOfWorks).toContain(SENTINEL);
    expect(updateWrites().some((d) => "clientSummaryCache" in d)).toBe(true);
  });
});

describe("RA-8494 report view page: the whole record goes through the owner", () => {
  const render = async () => {
    const { default: Page } = await import("@/app/reports/[id]/view/page");
    const el = (await Page({
      params: Promise.resolve({ id: "rep_1" }),
      searchParams: Promise.resolve({}),
    })) as unknown as { props: { report: unknown } };
    return JSON.stringify(el.props.report);
  };

  it("technician who created the report: no price, no priced scope text", async () => {
    signIn(OWNER);
    expect(await render()).not.toContain(SENTINEL);
  });

  it("positive control: a MANAGER sees the priced scope", async () => {
    signIn("manager");
    expect(await render()).toContain(SENTINEL);
  });
});

describe("RA-8494 priced report prose (verdict round 1)", () => {
  // The inspection narrative as generate-report-ai writes it: priced
  // equipment lines in prose, not JSON.
  const PROSE = `## Equipment Selection\n- LGR 85: 2 units x $${M}/day\n- Total Daily Cost: $${M}`;

  it("GET /api/reports/[id]: a technician gets no priced narrative", async () => {
    h.rowPatch = { detailedReport: PROSE };
    signIn(OWNER);
    const { GET } = await import("../../reports/[id]/route");
    const res = await GET(req("/api/reports/rep_1", "GET"), ctx({ id: "rep_1" }) as any);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(SENTINEL);
  });

  it("report view page: a technician gets no priced narrative", async () => {
    h.rowPatch = { detailedReport: PROSE };
    signIn(OWNER);
    const { default: Page } = await import("@/app/reports/[id]/view/page");
    const el = (await Page({
      params: Promise.resolve({ id: "rep_1" }),
      searchParams: Promise.resolve({}),
    })) as unknown as { props: { report: unknown } };
    expect(JSON.stringify(el.props.report)).not.toContain(SENTINEL);
  });

  it("positive control: a MANAGER reads the priced narrative", async () => {
    h.rowPatch = { detailedReport: PROSE };
    signIn("manager");
    const { GET } = await import("../../reports/[id]/route");
    const res = await GET(req("/api/reports/rep_1", "GET"), ctx({ id: "rep_1" }) as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(SENTINEL);
  });

  it("a technician's PUT never replaces the narrative it cannot see", async () => {
    signIn(OWNER);
    const { PUT } = await import("../../reports/[id]/route");
    const res = await PUT(
      req("/api/reports/rep_1", "PUT", { title: "Field update", detailedReport: "Rewritten blind." }),
      ctx({ id: "rep_1" }) as any,
    );
    expect(res.status, await res.clone().text()).toBe(200);
    // The stored narrative is carried over unchanged; the blind text never lands.
    expect(updateWrites().length).toBeGreaterThan(0);
    for (const data of updateWrites()) {
      expect(data.detailedReport).not.toBe("Rewritten blind.");
      expect(data.detailedReport === null).toBe(false);
    }
  });
});

describe("RA-8494 money found by value (verdict round 2)", () => {
  it("GET /api/inspections/[id]: a technician gets no total from the audit rows", async () => {
    signIn(OWNER);
    const { GET } = await import("../[id]/route");
    const res = await GET(req("/api/inspections/insp_1", "GET"), ctx({ id: "insp_1" }) as any);
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Cost estimate generated");
    expect(body).not.toContain(SENTINEL);
  });

  it("positive control: a MANAGER reads the audit row's total", async () => {
    signIn("manager");
    const { GET } = await import("../[id]/route");
    const res = await GET(req("/api/inspections/insp_1", "GET"), ctx({ id: "insp_1" }) as any);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await res.text()).toContain(SENTINEL);
  });

  it("GET /api/reports/[id]/version-history: a technician gets no money field values", async () => {
    signIn(OWNER);
    const { GET } = await import("../../reports/[id]/version-history/route");
    const res = await GET(req("/api/reports/rep_1/version-history", "GET"), ctx({ id: "rep_1" }) as any);
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.text();
    expect(body).toContain("totalCost");
    expect(body).not.toContain(SENTINEL);
  });

  it("the owner keeps JSON text with no money byte for byte", async () => {
    const { redactMoney } = await import("@/lib/auth/redact-money");
    const text = '{ "reason": "meter fault",  "readings": [1, 2] }';
    expect(redactMoney({ note: text }).note).toBe(text);
    expect(redactMoney({ note: "[not json" }).note).toBe("[not json");
    expect(redactMoney({ field: "title", from: "a", to: "b" })).toEqual({ field: "title", from: "a", to: "b" });
  });
});

describe("RA-8494 inspection audit trail (verdict round 2 readers)", () => {
  const get = async () =>
    (await import("../[id]/audit/route")).GET(req("/api/inspections/insp_1/audit", "GET"), ctx({ id: "insp_1" }) as any);

  it("GET /api/inspections/[id]/audit: the creating technician gets no total from the audit text", async () => {
    h.rowPatch = { action: "Cost estimate generated", changes: JSON.stringify({ itemCount: 3, total: M }) };
    signIn(OWNER);
    const res = await get();
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Cost estimate generated");
    expect(body).not.toContain(SENTINEL);
  });
});

describe("RA-8494 prose written from priced inputs (discovery sweep 2)", () => {
  it("GET /api/inspections/[id]: a technician gets no stored scope narrative", async () => {
    signIn(OWNER);
    const { GET } = await import("../[id]/route");
    const res = await GET(req("/api/inspections/insp_1", "GET"), ctx({ id: "insp_1" }) as any);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await res.text()).not.toContain("Comparable jobs averaged");
  });

  it("the scope prompt's past jobs carry a value only for a caller who may see money", async () => {
    const { safeRetrieveSimilarJobs } = await import("@/lib/ai/rag-context");
    h.rawRows = [
      {
        id: "hj_1", claimType: "CAT_1", waterCategory: 1, waterClass: 1, suburb: "Newtown", state: "NSW",
        description: "Hallway carpet", jobName: "Past job", totalExTax: M, itemCount: 4, equipmentCount: 3, distance: 0.5,
      },
    ];
    const ask = (withPrices: boolean) =>
      safeRetrieveSimilarJobs({ tenantId: OWNER, claimType: "CAT_1", description: "Hallway", withPrices });
    const technician = await ask(false);
    const manager = await ask(true);
    // Positive control: the double answers past jobs, priced, to a money viewer.
    expect(manager.jobCount).toBeGreaterThan(0);
    expect(manager.contextPrompt).toContain(SENTINEL);
    expect(technician.jobCount).toBe(manager.jobCount);
    expect(technician.contextPrompt).not.toContain(SENTINEL);
  });

  const upload = async () => {
    const bytes = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 0x20), Buffer.from("\n%%EOF\n")]);
    const form = new FormData();
    form.append("file", new File([bytes], "report.pdf", { type: "application/pdf" }));
    h.extractReportFromUpload.mockResolvedValue({
      ok: true,
      data: {
        parsedData: {
          fullText: `Equipment daily rate $${M}`,
          technicianFieldReport: "",
          equipment: [{ name: "LGR 85", dailyRate: M, totalCost: M }],
        },
      },
    });
    const { POST } = await import("../../reports/upload/route");
    return POST(new NextRequest("http://localhost/api/reports/upload", { method: "POST", body: form }));
  };

  it("POST /api/reports/upload: a technician gets no imported price, raw or as a field report", async () => {
    signIn(OWNER);
    const res = await upload();
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await res.text()).not.toContain(SENTINEL);
  });

  it("positive control: a MANAGER gets the imported PDF text back", async () => {
    signIn("manager");
    const res = await upload();
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json();
    expect(body.extractedText).toContain(SENTINEL);
    // The raw text never becomes the field report, for anyone.
    expect(body.parsedData.reportData?.technicianFieldReport ?? "").not.toContain(SENTINEL);
  });
});

describe("RA-8494 nested money survives a technician's save (verdict round 3, founder ruling 21/11)", () => {
  const monitoring = (total: number | null) => ({
    monitoringData: { moistureReadings: { moistureReadings: [], costEstimates: [{ description: "Drying", total }] } },
  });
  const writtenMoisture = () =>
    updateWrites()
      .map((d) => d.moistureReadings)
      .filter((v): v is string => typeof v === "string");

  it("GET then PUT as a technician: the stored cost estimate total is kept, not blanked", async () => {
    signIn(OWNER);
    const route = await import("../../reports/[id]/route");
    const got = await route.GET(req("/api/reports/rep_1", "GET"), ctx({ id: "rep_1" }) as any);
    expect(got.status).toBe(200);
    // What the technician was shown: the nested total withheld.
    expect(await got.text()).not.toContain(SENTINEL);
    const res = await route.PUT(req("/api/reports/rep_1", "PUT", monitoring(null)), ctx({ id: "rep_1" }) as any);
    expect(res.status, await res.clone().text()).toBe(200);
    const written = writtenMoisture();
    expect(written.length).toBeGreaterThan(0);
    for (const text of written) {
      expect(text).toContain(SENTINEL);
      expect(text).not.toContain('"total":null');
    }
  });

  it("a technician cannot write a nested price either", async () => {
    signIn(OWNER);
    const { PUT } = await import("../../reports/[id]/route");
    const res = await PUT(req("/api/reports/rep_1", "PUT", monitoring(1)), ctx({ id: "rep_1" }) as any);
    expect(res.status, await res.clone().text()).toBe(200);
    for (const text of writtenMoisture()) expect(text).not.toContain('"total":1}');
  });

  it("positive control: a MANAGER's nested edit is written as sent", async () => {
    signIn("manager");
    const { PUT } = await import("../../reports/[id]/route");
    const res = await PUT(req("/api/reports/rep_1", "PUT", monitoring(99)), ctx({ id: "rep_1" }) as any);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(writtenMoisture().some((t) => t.includes('"total":99'))).toBe(true);
  });

  it("the owner's merge keeps hidden money at any depth and field edits as sent", async () => {
    const { keepHiddenMoney } = await import("@/lib/auth/redact-money");
    const stored = { note: "old", rows: [{ id: "a", reading: 10, rate: M }], totalCost: M };
    const sent = { note: "new", rows: [{ id: "a", reading: 12, rate: null }], totalCost: null };
    expect(keepHiddenMoney(sent, stored)).toEqual({
      note: "new",
      rows: [{ id: "a", reading: 12, rate: M }],
      totalCost: M,
    });
  });
});

describe("RA-8494 share links (founder ruling 22/11): a technician never reaches a price through a token", () => {
  const mint = async (route: "share-link" | "insurer-link") => {
    const mod =
      route === "share-link"
        ? await import("../../reports/[id]/share-link/route")
        : await import("../../reports/[id]/insurer-link/route");
    return mod.POST(req(`/api/reports/rep_1/${route}`, "POST", {}), ctx({ id: "rep_1" }) as any);
  };
  // The report the link was minted for, so the token path itself is taken.
  const linked = (token: string) => h.shares.get(token)!;
  const view = async (token: string) => {
    const { default: Page } = await import("@/app/reports/[id]/view/page");
    const el = (await Page({
      params: Promise.resolve({ id: linked(token) }),
      searchParams: Promise.resolve({ token }),
    })) as unknown as { props: { report: unknown } };
    return JSON.stringify(el.props.report);
  };
  const pdf = async (token: string) =>
    (await import("../../reports/[id]/pdf/route")).GET(
      req(`/api/reports/${linked(token)}/pdf?token=${token}`, "GET"),
      ctx({ id: linked(token) }) as any,
    );

  for (const route of ["share-link", "insurer-link"] as const) {
    it(`a technician who created the report cannot mint a ${route}`, async () => {
      h.rowPatch = { status: "COMPLETED" };
      signIn(OWNER);
      const res = await mint(route);
      expect(res.status, await res.clone().text()).toBe(403);
      expect(h.shares.size).toBe(0);
    });
  }

  it("a technician opening a link while signed in sees no price (view page and PDF)", async () => {
    signIn("manager");
    const minted = await mint("share-link");
    expect(minted.status, await minted.clone().text()).toBe(200);
    const [token] = [...h.shares.keys()];
    signIn(OWNER);
    expect(await view(token)).not.toContain(SENTINEL);
    const res = await pdf(token);
    expect(res.status).toBe(403);
    expect(JSON.stringify(h.iicrcPdf.mock.calls)).not.toContain(SENTINEL);
  });

  it("positive control: a MANAGER mints a link and the opened view carries the price", async () => {
    signIn("manager");
    const minted = await mint("share-link");
    expect(minted.status, await minted.clone().text()).toBe(200);
    const [token] = [...h.shares.keys()];
    expect(await view(token)).toContain(SENTINEL);
    const res = await pdf(token);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
