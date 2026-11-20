/**
 * C3 — the assigned technician can read back the field data they record.
 *
 * D-028 lets the job's assigned technician (Role USER, same organisation)
 * create and update field data, but several GET handlers still opened the job
 * with the creator-only filter `where: { id, userId: session.user.id }` or the
 * narrower write gate `assertInspectionTenancy`, so the technician could write
 * records they could not read back (D-028 "Known limits": a read-reach
 * follow-up under D-023). Every GET listed below opens the job with
 * `assertInspectionReadable`, the D-023 read reach.
 *
 * Part 1 is a DB-free static guard (route files are parsed with the TypeScript
 * compiler, never imported), with planted sources proving it fires.
 * Part 2 is behavioural, for the report GET: the read widens to the
 * technician, but the cost estimate (rates, subtotals, totals) is money and is
 * withheld unless the caller has the FINANCIAL reach (the job's owner, or a
 * MANAGER / ADMIN of the organisation; D-023 / RA-7771).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { NextRequest } from "next/server";

// ─── Part 1: static guard ──────────────────────────────────────────────────

const ROUTE_ROOT = path.resolve(__dirname, "..");

const READ_GETS = [
  "sketches/[sketchId]/evidence-pins/route.ts",
  "monitoring-report/route.ts",
  "contents-manifest/route.ts",
  "sketches/estimate/route.ts",
  "biohazard-assessment/route.ts",
  "carpet-restoration/route.ts",
  "circuit-assessment/route.ts",
  "fire-smoke-assessment/route.ts",
  "hvac-assessment/route.ts",
  "mould-remediation/route.ts",
  "storm-damage/route.ts",
  "water-damage-classification/route.ts",
  "psychrometric/route.ts",
  "drying-goal/route.ts",
  "drying-status/route.ts",
  "report/route.ts",
];

function exportedHandler(sf: ts.SourceFile, name: string): ts.Node | null {
  for (const stmt of sf.statements) {
    const exported = ts
      .getModifiers(stmt as ts.HasModifiers)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) return stmt;
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) {
          return d.initializer;
        }
      }
    }
  }
  return null;
}

function calledNames(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee)) names.add(callee.text);
      if (ts.isPropertyAccessExpression(callee)) names.add(callee.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

const SESSION_USER_ID = /^session!?\??\.user!?\??\.id$/;

/** `userId` pinned to the caller inside any `where` literal, at any depth. */
function creatorFilters(node: ts.Node): string[] {
  const hits: string[] = [];
  const scan = (obj: ts.Node) => {
    const walk = (n: ts.Node) => {
      if (ts.isObjectLiteralExpression(n)) {
        for (const p of n.properties) {
          if (ts.isShorthandPropertyAssignment(p) && p.name.text === "userId") {
            hits.push(p.getText());
          }
          if (
            ts.isPropertyAssignment(p) &&
            p.name.getText() === "userId" &&
            (SESSION_USER_ID.test(p.initializer.getText().replace(/\s/g, "")) ||
              (ts.isIdentifier(p.initializer) && p.initializer.text === "userId"))
          ) {
            hits.push(p.getText());
          }
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(obj);
  };
  const visit = (n: ts.Node) => {
    if (
      ts.isPropertyAssignment(n) &&
      n.name.getText() === "where" &&
      ts.isObjectLiteralExpression(n.initializer)
    ) {
      scan(n.initializer);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return hits;
}

/** Problems with one file's GET; empty means it opens the job with the read reach. */
function readReachProblems(source: string, file = "planted.ts"): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const get = exportedHandler(sf, "GET");
  if (!get) return ["no exported GET handler"];
  const problems: string[] = [];
  const calls = calledNames(get);
  if (!calls.has("assertInspectionReadable")) {
    problems.push("GET does not call assertInspectionReadable");
  }
  for (const gate of ["assertInspectionTenancy", "resolveInspectionWrite", "assertInspectionAssignedWrite"]) {
    if (calls.has(gate)) problems.push(`GET calls the write gate ${gate}`);
  }
  for (const hit of creatorFilters(get)) {
    problems.push(`GET keeps a creator-only filter (${hit})`);
  }
  return problems;
}

describe("C3 static guard: field-data GETs open the job with assertInspectionReadable", () => {
  for (const rel of READ_GETS) {
    it(rel, () => {
      const source = readFileSync(path.join(ROUTE_ROOT, rel), "utf8");
      expect(readReachProblems(source, rel)).toEqual([]);
    });
  }

  it("PLANTED: a creator-only filter is caught", () => {
    const p = readReachProblems(`
      export async function GET(req, { params }) {
        const session = await getServerSession(authOptions);
        await assertInspectionReadable(session, id);
        const i = await prisma.inspection.findFirst({ where: { id, userId: session.user.id } });
      }`);
    expect(p.join("\n")).toMatch(/creator-only filter/);
  });

  it("PLANTED: a creator filter through a bound userId is caught", () => {
    const p = readReachProblems(`
      export async function GET(req) {
        const userId = session.user.id;
        await assertInspectionReadable(session, id);
        await prisma.x.findMany({ where: { inspection: { userId } } });
      }`);
    expect(p.join("\n")).toMatch(/creator-only filter/);
  });

  it("PLANTED: the write gate on a GET is caught", () => {
    const p = readReachProblems(`
      export async function GET(req) {
        const tenancy = await assertInspectionTenancy(session, id);
      }`);
    expect(p).toContain("GET does not call assertInspectionReadable");
    expect(p).toContain("GET calls the write gate assertInspectionTenancy");
  });

  it("PLANTED: a clean GET passes, and a POST's creator filter is not the GET's problem", () => {
    const p = readReachProblems(`
      export async function GET(req) {
        const tenancy = await assertInspectionReadable(session, id);
        await prisma.inspection.findUnique({ where: { id } });
      }
      export async function POST(req) {
        await prisma.inspection.update({ where: { id, userId: session.user.id } });
      }`);
    expect(p).toEqual([]);
  });

  it("PLANTED: a file with no GET is reported, not silently passed", () => {
    expect(readReachProblems(`export async function POST() {}`)).toEqual([
      "no exported GET handler",
    ]);
  });
});

// ─── Part 2: report GET, behavioural ───────────────────────────────────────

const { getServerSession, userFindUnique, inspectionFindFirst } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  inspectionFindFirst: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/organization-credits", () => ({
  getMembershipStart: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/nir-report-generation", () => ({ generateNIRPDF: vi.fn() }));
vi.mock("@/lib/reports/claim-sketch-floors", () => ({ claimSketchesToFloors: vi.fn() }));
vi.mock("@/lib/reports/append-sketch-pages", () => ({ appendSketchPages: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique, findMany: vi.fn().mockResolvedValue([]) },
    inspection: { findFirst: inspectionFindFirst },
  },
}));

import { GET as getReport } from "../report/route";

const OWNER = "owner-1";
const ORG = "org_1";

const USERS: Record<string, { role: "USER" | "MANAGER" | "ADMIN"; organizationId: string }> = {
  [OWNER]: { role: "ADMIN", organizationId: ORG },
  "tech-1": { role: "USER", organizationId: ORG },
  "manager-1": { role: "MANAGER", organizationId: ORG },
};

const COST_LINE = {
  id: "ce_1",
  category: "Drying",
  description: "Dehumidifier hire",
  quantity: 3,
  unit: "day",
  rate: 95,
  subtotal: 285,
  contingency: 0,
  total: 285,
};

function inspectionFixture() {
  return {
    id: "insp_1",
    userId: OWNER,
    workspaceId: null,
    inspectionNumber: "INS-1",
    status: "ESTIMATED",
    propertyAddress: "1 Test St",
    propertyPostcode: "4000",
    inspectionDate: new Date("2026-10-01"),
    completedAt: null,
    updatedAt: new Date("2026-10-02"),
    technicianName: "Tech",
    environmentalData: null,
    moistureReadings: [],
    affectedAreas: [],
    scopeItems: [],
    classifications: [],
    costEstimates: [COST_LINE],
    photos: [],
    claimSketches: [],
    report: null,
  };
}

/**
 * Emulates the database for `inspection.findFirst`: the job belongs to OWNER
 * in ORG. A `where` that pins a `userId` or an organisation matches only when
 * it names the owner or the owner's organisation; a bare id always matches.
 */
function emulateInspectionFindFirst() {
  inspectionFindFirst.mockImplementation(
    async (args: { where: unknown; select?: Record<string, unknown>; include?: unknown }) => {
      const where = JSON.stringify(args.where);
      const pinned = where.includes('"userId"') || where.includes("organizationId");
      const matches =
        !pinned ||
        where.includes(`"userId":"${OWNER}"`) ||
        where.includes(`"organizationId":"${ORG}"`);
      if (!matches) return null;
      const row = inspectionFixture();
      if (args.include) return row;
      return { id: row.id, userId: row.userId, workspaceId: row.workspaceId };
    },
  );
}

function signIn(id: string) {
  getServerSession.mockResolvedValue({ user: { id, role: USERS[id].role } });
  userFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const u = USERS[args.where.id];
    return u
      ? {
          ...u,
          email: `${args.where.id}@example.com`,
          organizationLeftAt: null,
          organizationLeftId: null,
        }
      : null;
  });
}

const reportReq = () =>
  new NextRequest("http://localhost/api/inspections/insp_1/report?format=json");
const ctx = { params: Promise.resolve({ id: "insp_1" }) };

describe("C3 behavioural: report GET for the assigned technician", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emulateInspectionFindFirst();
  });

  it("the assigned technician (USER, same organisation) gets the report", async () => {
    signIn("tech-1");

    const res = await getReport(reportReq(), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inspection.id).toBe("insp_1");
  });

  it("the technician's report withholds the cost estimate: no rates, no totals", async () => {
    signIn("tech-1");

    const res = await getReport(reportReq(), ctx);
    const body = await res.json();

    expect(body.costEstimate).toBeNull();
    const text = JSON.stringify(body);
    expect(text).not.toContain("Dehumidifier hire");
    expect(text).not.toContain('"rate"');
    // Match the money fields only: the body also carries ISO timestamps, whose
    // milliseconds can read ".285".
    expect(text).not.toMatch(/"(subtotal|total)":285\b/);
  });

  it("the owner gets the cost estimate with its rates", async () => {
    signIn(OWNER);

    const res = await getReport(reportReq(), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.costEstimate.items[0].rate).toBe(95);
    expect(body.costEstimate.total).toBe(285);
  });

  it("a MANAGER of the organisation gets the cost estimate", async () => {
    signIn("manager-1");

    const res = await getReport(reportReq(), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.costEstimate.items[0].rate).toBe(95);
  });
});
