/**
 * D-028 — static guard: the job's ASSIGNED technician may write field data.
 *
 * Founder decision 2026-10-11 ("Yes, field data only"). Every mutating handler
 * on a field-data route under app/api/inspections/[id]/ must gate on
 * `assertInspectionAssignedWrite` (or `assertInspectionCapturable` for a pure
 * create), and must not narrow its write back to the job's creator with a
 * `where: { ..., userId }` filter: that filter matches 0 rows for the
 * technician, so the gate would admit them and the write would silently do
 * nothing.
 *
 * DB-free: the route files are parsed with the TypeScript compiler, never
 * imported. The behavioural proof (rows actually change; another business and
 * an unassigned colleague still get 404) lives in
 * technician-field-capture.integration.test.ts, which needs DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const ROUTE_ROOT = path.resolve(__dirname, "..");

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ADMITS_ASSIGNEE = new Set([
  "assertInspectionAssignedWrite",
  "assertInspectionCapturable",
]);
/** Both refuse the assigned technician, so neither may gate a field-data write. */
const REFUSES_ASSIGNEE = new Set(["assertInspectionTenancy", "resolveInspectionWrite"]);

/** Field-data handlers the assigned technician must be able to reach. */
const GATED: Record<string, string[]> = {
  "affected-areas/route.ts": ["POST"],
  "affected-areas/[areaId]/route.ts": ["PATCH", "DELETE"],
  "apply-checklist/route.ts": ["POST"],
  "australian-compliance/route.ts": [],
  "biohazard-assessment/route.ts": ["POST", "DELETE"],
  "carpet-restoration/route.ts": ["POST", "DELETE"],
  "circuit-assessment/route.ts": ["POST"],
  "classification/route.ts": ["POST"],
  "contents-manifest/route.ts": ["PATCH"],
  "contents-pack-out/route.ts": ["POST"],
  "contents-pack-out/[itemId]/route.ts": ["DELETE"],
  "draft-snapshot/route.ts": ["PUT"],
  "drying-goal/route.ts": ["POST", "PUT"],
  "environmental/route.ts": ["POST"],
  "equipment-calculator/route.ts": ["POST"],
  "evidence/batch/route.ts": ["POST"],
  "fire-smoke-assessment/route.ts": ["POST", "DELETE"],
  "floor-plan/route.ts": ["POST", "PUT"],
  "group-readings/route.ts": ["PATCH"],
  "hvac-assessment/route.ts": ["POST", "DELETE"],
  "make-safe/route.ts": ["POST", "PATCH"],
  "moisture/[readingId]/route.ts": ["PATCH", "DELETE"],
  "monitoring-report/route.ts": ["POST"],
  "mould-remediation/route.ts": ["POST", "DELETE"],
  "photos/[photoId]/route.ts": ["PATCH", "DELETE"],
  "photos/[photoId]/labels/route.ts": ["PATCH"],
  "photos/[photoId]/classification-review/route.ts": ["POST"],
  "psychrometric/route.ts": ["POST"],
  "scope-items/route.ts": ["POST"],
  "scope-items/[itemId]/route.ts": ["PATCH", "DELETE"],
  "sketches/route.ts": ["POST"],
  "sketches/[sketchId]/route.ts": ["PUT", "DELETE"],
  "sketches/[sketchId]/evidence-pins/route.ts": ["POST"],
  "sketches/[sketchId]/evidence-pins/[pinId]/route.ts": ["PATCH", "DELETE"],
  "sketches/[sketchId]/hazards/route.ts": ["POST"],
  "sketches/[sketchId]/insurance-context/route.ts": [],
  "sketches/[sketchId]/moisture-readings/route.ts": ["POST"],
  "sketches/promote-homeowner/route.ts": ["POST"],
  "sketches/underlay/route.ts": ["POST", "DELETE"],
  "storm-damage/route.ts": ["POST", "DELETE"],
  "voice/observation/route.ts": ["POST"],
  "voice/session/route.ts": ["POST", "DELETE"],
  "water-damage-classification/route.ts": ["POST", "DELETE"],
};

/**
 * Mutating handlers in the same files that stay where they are, with the
 * reason. Listed so a new handler in a field-data file cannot slip past the
 * guard unclassified.
 */
const AI_SPEND =
  "AI call on the caller's BYOK key and subscription; spending the owner's key is a cost decision D-028 does not make";
const EXCLUDED: Record<string, Record<string, string>> = {
  "australian-compliance/route.ts": {
    POST: "carries insurer, claim number, loss adjuster and an asbestos removal quote (AUD): claim administration and money, not field data",
    DELETE: "same record as POST",
  },
  "contents-manifest/route.ts": { POST: AI_SPEND },
  "group-readings/route.ts": { POST: AI_SPEND },
  "sketches/[sketchId]/insurance-context/route.ts": {
    POST: "sets the claim's insurance pathway; insurer routing stays with the owner, as insurer-profile does",
  },
};

type Violation = { handler: string; problem: string };

function isSessionUserId(expr: ts.Expression): boolean {
  const text = expr.getText().replace(/\s+/g, "");
  return /^session(\?|!)?\.user(\?|!)?\.id(as\w+)?$/.test(text);
}

/** Names bound to the session user id anywhere in the file (`const userId = session.user.id`). */
function sessionIdBindings(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      isSessionUserId(
        ts.isAsExpression(n.initializer) || ts.isNonNullExpression(n.initializer)
          ? n.initializer.expression
          : n.initializer,
      )
    ) {
      names.add(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** Top-level functions by name, so a handler's local helpers are followed. */
function localFunctions(sf: ts.SourceFile): Map<string, ts.Node> {
  const fns = new Map<string, ts.Node>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) fns.set(st.name.text, st);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) fns.set(d.name.text, d.initializer);
      }
    }
  }
  return fns;
}

function exportedHandlers(sf: ts.SourceFile): Map<string, ts.Node> {
  const out = new Map<string, ts.Node>();
  const exported = (n: ts.Node) =>
    ts.canHaveModifiers(n) &&
    (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && exported(st)) {
      out.set(st.name.text, st);
    }
    if (ts.isVariableStatement(st) && exported(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) out.set(d.name.text, d.initializer);
      }
    }
  }
  return out;
}

/** The handler plus every top-level function it reaches by name, transitively. */
function reachable(handler: ts.Node, fns: Map<string, ts.Node>): ts.Node[] {
  const seen = new Set<ts.Node>([handler]);
  const queue = [handler];
  while (queue.length) {
    const node = queue.pop()!;
    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n)) {
        const target = fns.get(n.text);
        if (target && !seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
  }
  return [...seen];
}

function calledNames(nodes: ts.Node[]): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee)) names.add(callee.text);
      if (ts.isPropertyAccessExpression(callee)) names.add(callee.name.text);
    }
    ts.forEachChild(n, visit);
  };
  nodes.forEach(visit);
  return names;
}

/** `where` object literals (any depth) that pin the write to the session user. */
function creatorOnlyWheres(nodes: ts.Node[], bound: Set<string>): string[] {
  const hits: string[] = [];
  const pinsCaller = (p: ts.ObjectLiteralElementLike) => {
    if (ts.isShorthandPropertyAssignment(p)) return p.name.text === "userId";
    if (!ts.isPropertyAssignment(p) || p.name.getText() !== "userId") return false;
    const v = p.initializer;
    return isSessionUserId(v) || (ts.isIdentifier(v) && bound.has(v.text));
  };
  const scanWhere = (obj: ts.ObjectLiteralExpression) => {
    const walk = (n: ts.Node) => {
      if (ts.isObjectLiteralExpression(n)) {
        for (const p of n.properties) {
          if (pinsCaller(p)) {
            const { line } = n.getSourceFile().getLineAndCharacterOfPosition(p.getStart());
            hits.push(`line ${line + 1}: ${p.getText()}`);
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
      scanWhere(n.initializer);
      return;
    }
    ts.forEachChild(n, visit);
  };
  nodes.forEach(visit);
  return hits;
}

/** Pure analyser over source text, so a planted defect can be fed to it directly. */
function analyseFieldDataRoute(
  source: string,
  gated: string[],
  fileName = "route.ts",
): Violation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const handlers = exportedHandlers(sf);
  const fns = localFunctions(sf);
  const bound = sessionIdBindings(sf);
  const violations: Violation[] = [];
  for (const method of gated) {
    const handler = handlers.get(method);
    if (!handler) {
      violations.push({ handler: method, problem: "handler not exported" });
      continue;
    }
    const nodes = reachable(handler, fns);
    const calls = calledNames(nodes);
    if (![...ADMITS_ASSIGNEE].some((g) => calls.has(g))) {
      violations.push({
        handler: method,
        problem: "does not gate on assertInspectionAssignedWrite / assertInspectionCapturable",
      });
    }
    for (const g of REFUSES_ASSIGNEE) {
      if (calls.has(g)) {
        violations.push({ handler: method, problem: `gates on ${g}, which refuses the assigned technician` });
      }
    }
    for (const hit of creatorOnlyWheres(nodes, bound)) {
      violations.push({ handler: method, problem: `creator-only where filter (${hit})` });
    }
  }
  return violations;
}

function mutatingExports(source: string): string[] {
  const sf = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return [...exportedHandlers(sf).keys()].filter((m) => MUTATING.has(m)).sort();
}

const read = (rel: string) => readFileSync(path.join(ROUTE_ROOT, rel), "utf8");

describe("D-028: field-data writes admit the assigned technician", () => {
  it.each(Object.entries(GATED))("%s gates %j on the assigned-write helper", (rel, methods) => {
    const violations = analyseFieldDataRoute(read(rel), methods, rel);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it.each(Object.keys(GATED))("%s: every mutating export is classified", (rel) => {
    const classified = [...GATED[rel], ...Object.keys(EXCLUDED[rel] ?? {})].sort();
    expect(mutatingExports(read(rel))).toEqual(classified);
  });
});

describe("D-028 guard analyser: positive and negative controls", () => {
  const clean = `
    import { assertInspectionAssignedWrite } from "@/lib/auth/assert-tenancy";
    export async function PATCH(req, { params }) {
      const session = await getServerSession(authOptions);
      const userId = session.user.id;
      const tenancy = await assertInspectionAssignedWrite(session, id);
      if (!tenancy.ok) return notFound();
      await prisma.moistureReading.updateMany({
        where: { id: readingId, inspection: tenancy.data.childInspectionFilter },
        data: { moistureLevel: 12 },
      });
      await prisma.auditLog.create({ data: { inspectionId: id, userId } });
    }
  `;

  it("a clean handler passes (the guard can say yes)", () => {
    expect(analyseFieldDataRoute(clean, ["PATCH"])).toEqual([]);
  });

  it("PLANTED: a creator-only nested where is caught even when the gate is right", () => {
    const planted = clean.replace(
      "inspection: tenancy.data.childInspectionFilter",
      "inspection: { userId }",
    );
    const v = analyseFieldDataRoute(planted, ["PATCH"]);
    expect(v.map((x) => x.problem).join("\n")).toMatch(/creator-only where filter/);
  });

  it("PLANTED: session.user.id written inline in a helper the handler calls is caught", () => {
    const planted = `
      async function owned(id, session) {
        return prisma.inspection.findFirst({ where: { id, userId: session.user.id } });
      }
      export async function DELETE(req) {
        const tenancy = await assertInspectionAssignedWrite(session, id);
        const insp = await owned(id, session);
      }
    `;
    const v = analyseFieldDataRoute(planted, ["DELETE"]);
    expect(v.map((x) => x.problem).join("\n")).toMatch(/creator-only where filter/);
  });

  it("PLANTED: a handler gated on resolveInspectionWrite is caught", () => {
    const planted = clean.replace(
      "assertInspectionAssignedWrite(session, id)",
      "resolveInspectionWrite(session, id)",
    );
    const problems = analyseFieldDataRoute(planted, ["PATCH"]).map((x) => x.problem);
    expect(problems).toContain(
      "does not gate on assertInspectionAssignedWrite / assertInspectionCapturable",
    );
    expect(problems).toContain(
      "gates on resolveInspectionWrite, which refuses the assigned technician",
    );
  });

  it("an owner-keyed lookup (where: { userId: inspection.userId }) is not flagged", () => {
    const ownerKeyed = clean.replace(
      "await prisma.auditLog",
      "await prisma.companyPricingConfig.findUnique({ where: { userId: owner.userId } });\n      await prisma.auditLog",
    );
    expect(analyseFieldDataRoute(ownerKeyed, ["PATCH"])).toEqual([]);
  });

  it("PLANTED: an unclassified mutating export is reported", () => {
    expect(mutatingExports(clean + "\nexport async function DELETE() {}")).toEqual([
      "DELETE",
      "PATCH",
    ]);
  });
});
