/**
 * D-028 — static guard: the job's ASSIGNED technician may write field data.
 *
 * Founder decision 2026-10-11 ("Yes, field data only"), narrowed by the
 * coordinator ruling: create and update only. Every POST / PUT / PATCH
 * handler on a field-data route under app/api/inspections/[id]/ must gate on
 * `assertInspectionAssignedWrite` (or `assertInspectionCapturable` for a pure
 * create), and must not narrow its write back to the job's creator with a
 * `where: { ..., userId }` filter: that filter matches 0 rows for the
 * technician, so the gate would admit them and the write would silently do
 * nothing. Every write in those handlers must also re-check the caller's
 * reach at write time (the helper's filters, or writeWithinInspectionScope),
 * so a reassignment between the check and the write changes 0 rows. No
 * DELETE, no excluded handler and nothing in OWNER_ONLY_FILES may reach that
 * helper: deletes stay with the owner's reach (RULES 21 chain of custody).
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
/**
 * Field-data handlers the assigned technician must be able to reach: create
 * and update only (POST / PUT / PATCH). No DELETE is ever listed here.
 */
const GATED: Record<string, string[]> = {
  "affected-areas/route.ts": ["POST"],
  "affected-areas/[areaId]/route.ts": ["PATCH"],
  "apply-checklist/route.ts": ["POST"],
  "australian-compliance/route.ts": [],
  "biohazard-assessment/route.ts": ["POST"],
  "carpet-restoration/route.ts": ["POST"],
  "circuit-assessment/route.ts": ["POST"],
  "classification/route.ts": ["POST"],
  "contents-manifest/route.ts": ["PATCH"],
  "contents-pack-out/route.ts": [],
  "contents-pack-out/[itemId]/route.ts": [],
  "draft-snapshot/route.ts": [],
  "drying-goal/route.ts": ["POST", "PUT"],
  "environmental/route.ts": ["POST"],
  "equipment-calculator/route.ts": ["POST"],
  "evidence/batch/route.ts": ["POST"],
  "fire-smoke-assessment/route.ts": ["POST"],
  "floor-plan/route.ts": ["POST", "PUT"],
  "group-readings/route.ts": ["PATCH"],
  "hvac-assessment/route.ts": ["POST"],
  "make-safe/route.ts": ["POST", "PATCH"],
  "moisture/[readingId]/route.ts": ["PATCH"],
  "monitoring-report/route.ts": ["POST"],
  "mould-remediation/route.ts": ["POST"],
  "photos/[photoId]/route.ts": ["PATCH"],
  "photos/[photoId]/labels/route.ts": ["PATCH"],
  "photos/[photoId]/classification-review/route.ts": ["POST"],
  "psychrometric/route.ts": ["POST"],
  "scope-items/route.ts": ["POST"],
  "scope-items/[itemId]/route.ts": ["PATCH"],
  "sketches/route.ts": ["POST"],
  "sketches/[sketchId]/route.ts": ["PUT"],
  "sketches/[sketchId]/evidence-pins/route.ts": ["POST"],
  "sketches/[sketchId]/evidence-pins/[pinId]/route.ts": ["PATCH"],
  "sketches/[sketchId]/hazards/route.ts": ["POST"],
  "sketches/[sketchId]/insurance-context/route.ts": [],
  "sketches/[sketchId]/moisture-readings/route.ts": ["POST"],
  "sketches/promote-homeowner/route.ts": ["POST"],
  "sketches/underlay/route.ts": ["POST"],
  "storm-damage/route.ts": ["POST"],
  "voice/observation/route.ts": ["POST"],
  "voice/session/route.ts": ["POST"],
  "water-damage-classification/route.ts": ["POST"],
};

/**
 * Mutating handlers in the same files that stay where they are, with the
 * reason. Listed so a new handler in a field-data file cannot slip past the
 * guard unclassified.
 */
const AI_SPEND =
  "AI call on the caller's BYOK key and subscription; spending the owner's key is a cost decision D-028 does not make";
const NO_DELETE =
  "D-028 grants create and update only; deletes stay with the owner's reach (RULES 21 chain of custody)";
const PACK_OUT_MONEY =
  "pack-out items carry replacementValueAud and restorationCostEstimate: money, owner/manager only";
const EXCLUDED: Record<string, Record<string, string>> = {
  "australian-compliance/route.ts": {
    POST: "carries insurer, claim number, loss adjuster and an asbestos removal quote (AUD): claim administration and money, not field data",
    DELETE: NO_DELETE,
  },
  "contents-manifest/route.ts": { POST: AI_SPEND },
  "draft-snapshot/route.ts": {
    PUT: "a snapshot save deletes readings, areas, every scope item and the classification choice; deletes stay owner/manager",
  },
  "contents-pack-out/route.ts": { POST: PACK_OUT_MONEY },
  "contents-pack-out/[itemId]/route.ts": { DELETE: PACK_OUT_MONEY },
  "group-readings/route.ts": { POST: AI_SPEND },
  "sketches/[sketchId]/insurance-context/route.ts": {
    POST: "sets the claim's insurance pathway; insurer routing stays with the owner, as insurer-profile does",
  },
  "affected-areas/[areaId]/route.ts": { DELETE: NO_DELETE },
  "biohazard-assessment/route.ts": { DELETE: NO_DELETE },
  "carpet-restoration/route.ts": { DELETE: NO_DELETE },
  "fire-smoke-assessment/route.ts": { DELETE: NO_DELETE },
  "hvac-assessment/route.ts": { DELETE: NO_DELETE },
  "moisture/[readingId]/route.ts": { DELETE: NO_DELETE },
  "mould-remediation/route.ts": { DELETE: NO_DELETE },
  "photos/[photoId]/route.ts": { DELETE: NO_DELETE },
  "scope-items/[itemId]/route.ts": { DELETE: NO_DELETE },
  "sketches/[sketchId]/evidence-pins/[pinId]/route.ts": { DELETE: NO_DELETE },
  "sketches/[sketchId]/route.ts": { DELETE: NO_DELETE },
  "sketches/underlay/route.ts": { DELETE: NO_DELETE },
  "storm-damage/route.ts": { DELETE: NO_DELETE },
  "voice/session/route.ts": { DELETE: NO_DELETE },
  "water-damage-classification/route.ts": { DELETE: NO_DELETE },
};

/**
 * Route files that stay entirely with the owner's reach: money, lifecycle,
 * administration, the inspection itself, and AI spend. No mutating export in
 * them may reach a gate that admits the assigned technician.
 */
const OWNER_ONLY_FILES: Record<string, string> = {
  "route.ts": "the inspection itself (PATCH, DELETE)",
  "accept/route.ts": "lifecycle",
  "capture-invite/route.ts": "administration",
  "client-portal-link/route.ts": "administration",
  "close/route.ts": "lifecycle",
  "cost-estimates/route.ts": "money",
  "dispute-pack/route.ts": "money",
  "generate-invoice/route.ts": "money",
  "guidewire/route.ts": "administration",
  "handover/route.ts": "lifecycle",
  "insurer-profile/route.ts": "administration",
  "reopen/route.ts": "lifecycle",
  "sign/route.ts": "lifecycle",
  "generate-scope/route.ts": AI_SPEND,
  "sketches/import-from-image/route.ts": AI_SPEND,
  "assessments/[type]/generate/route.ts": AI_SPEND,
};

/**
 * Writes that need no tenancy filter of their own: the audit trail records
 * the actor, and the idempotency and client-mutation ledgers are keyed to
 * the caller (RA-7586).
 */
const UNSCOPED_MODELS_OK = new Set(["auditLog", "idempotencyRecord", "clientMutation"]);

/**
 * Writes that re-derive rows of the sketch the handler has just saved through
 * a scoped write, keyed on that sketch's id. Listed per file so a new unscoped
 * write elsewhere still fails.
 */
const DERIVED_WRITES: Record<string, Set<string>> = {
  "sketches/route.ts": new Set(["sketchElement", "sketchRoom", "sketchMoistureReading"]),
};

const WRITE_OPS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);
const SCOPE_TOKENS = /\b(inspectionWhere|inspectionManyWhere|childInspectionFilter)\b/;

/**
 * Deletes a technician-reachable handler may make, per file, because they only
 * replace rows the same handler derives (D-028 grants no delete of field data).
 */
const DELETES_ALLOWED: Record<string, Record<string, string>> = {
  "sketches/route.ts": {
    sketchElement: "rebuilt from the sketch just saved",
    sketchRoom: "rooms no longer in the saved sketch; evidence-bearing rooms are detached, not deleted",
    sketchMoistureReading: "rebuilt from the sketch's moisture pins",
  },
  "equipment-calculator/route.ts": {
    scopeItem: "replaces only the calculator's own autoDetermined equipment rows",
  },
  "water-damage-classification/route.ts": {
    classification: "replaces the single technician-choice row the panel itself writes (RA-7709)",
  },
};

/** Source text without comments, so a comment naming a filter is not a filter. */
function codeText(n: ts.Node): string {
  return n
    .getText()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function nameOf(e: ts.Expression): string | null {
  const u = unwrap(e);
  if (ts.isIdentifier(u)) return u.text;
  if (ts.isPropertyAccessExpression(u)) return u.name.text;
  return null;
}

/** Every expression the file assigns to `name` (declarations and assignments). */
function sourcesOf(sf: ts.SourceFile, name: string): ts.Expression[] {
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      out.push(n.initializer);
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      nameOf(n.left) === name
    ) {
      out.push(n.right);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * True when a scope expression really carries the helper's filters: it names
 * them, or it is a variable whose every assignment in the file does. A literal
 * such as `{ id }` never does, however it is spelt or aliased.
 */
function scopeExprOk(e: ts.Expression, visiting = new Set<ts.Node>()): boolean {
  const u = unwrap(e);
  if (ts.isObjectLiteralExpression(u)) return false;
  if (SCOPE_TOKENS.test(codeText(u))) return true;
  const name = nameOf(u);
  if (!name) return false;
  const all = sourcesOf(u.getSourceFile(), name);
  if (all.length === 0) return false;
  // Assignments already being checked further up are judged there.
  const sources = all.filter((s) => !visiting.has(s));
  sources.forEach((s) => visiting.add(s));
  return sources.every((s) => scopeExprOk(s, visiting));
}

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

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) {
    e = e.expression;
  }
  return e;
}

/** `prisma.model.op(...)` / `tx.model.op(...)`: returns [model, op] or null. */
function prismaWrite(call: ts.CallExpression): [string, string] | null {
  const callee = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(callee) || !WRITE_OPS.has(callee.name.text)) return null;
  const owner = unwrap(callee.expression);
  if (!ts.isPropertyAccessExpression(owner)) return null;
  const root = unwrap(owner.expression).getText();
  if (root !== "prisma" && root !== "tx") return null;
  return [owner.name.text, callee.name.text];
}

/**
 * True when the write re-checks the caller's reach at write time: its own
 * arguments use the helper's filters, or it runs inside a
 * writeWithinInspectionScope callback, or inside a $transaction whose body
 * also runs a write scoped by those filters (a scoped update that claims no
 * row throws or is counted, and the whole transaction rolls back).
 */
function writeIsScoped(call: ts.CallExpression, seen = new Set<ts.Node>()): boolean {
  if (call.arguments.some((a) => SCOPE_TOKENS.test(codeText(a)))) return true;
  for (let n: ts.Node = call.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name && ts.isSourceFile(n.parent) && !seen.has(n)) {
      // A top-level helper: scoped only if every place that calls it is.
      seen.add(n);
      const sites = callSites(n.getSourceFile(), n.name.text);
      return sites.length > 0 && sites.every((c) => writeIsScoped(c, seen));
    }
    if (ts.isCallExpression(n)) {
      const callee = unwrap(n.expression);
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : "";
      if (name === "writeWithinInspectionScope") {
        // A literal scope such as `{ id: inspectionId }` re-checks nothing.
        const scopeArg = n.arguments[0];
        return scopeArg !== undefined && scopeExprOk(scopeArg);
      }
      if (name === "$transaction" && n.arguments.some((a) => SCOPE_TOKENS.test(codeText(a)))) {
        return true;
      }
    }
  }
  return false;
}

function callSites(sf: ts.SourceFile, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(unwrap(n.expression)) && unwrap(n.expression).getText() === name) {
      out.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** delete / deleteMany calls a technician-reachable handler makes, minus the allowlist. */
function deletesIn(nodes: ts.Node[], allowed: Record<string, string>): string[] {
  const hits: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const w = prismaWrite(n);
      if (w && (w[1] === "delete" || w[1] === "deleteMany") && !(w[0] in allowed)) {
        const { line } = n.getSourceFile().getLineAndCharacterOfPosition(n.getStart());
        hits.push(`line ${line + 1}: ${w[0]}.${w[1]}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  nodes.forEach(visit);
  return hits;
}

function unscopedWrites(nodes: ts.Node[], derived: Set<string>): string[] {
  const hits: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const w = prismaWrite(n);
      if (w && !UNSCOPED_MODELS_OK.has(w[0]) && !derived.has(w[0]) && !writeIsScoped(n)) {
        const { line } = n.getSourceFile().getLineAndCharacterOfPosition(n.getStart());
        hits.push(`line ${line + 1}: ${w[0]}.${w[1]}`);
      }
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
    for (const hit of deletesIn(nodes, DELETES_ALLOWED[fileName] ?? {})) {
      violations.push({
        handler: method,
        problem: `deletes rows (${hit}); D-028 grants the assigned technician create and update only`,
      });
    }
    for (const hit of unscopedWrites(nodes, DERIVED_WRITES[fileName] ?? new Set())) {
      violations.push({
        handler: method,
        problem: `write not re-checked at write time (${hit}); use the helper's filters or writeWithinInspectionScope`,
      });
    }
  }
  return violations;
}

/**
 * D-028 DELETE rule: a DELETE handler must not reach a gate that admits the
 * assigned technician. Returns the admitting gates it reaches (empty = ok).
 */
function deleteAdmitsAssignee(source: string): string[] {
  return handlerAdmitsAssignee(source, "DELETE");
}

/** The assignee-admitting gates a given exported handler reaches (empty = refuses the assignee). */
function handlerAdmitsAssignee(source: string, method: string): string[] {
  const sf = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const handler = exportedHandlers(sf).get(method);
  if (!handler) return [];
  const calls = calledNames(reachable(handler, localFunctions(sf)));
  return [...ADMITS_ASSIGNEE].filter((g) => calls.has(g));
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

  it.each(Object.keys(GATED))("%s: DELETE does not admit the assigned technician", (rel) => {
    expect(deleteAdmitsAssignee(read(rel))).toEqual([]);
  });

  it.each(
    Object.entries(EXCLUDED).flatMap(([rel, m]) => Object.keys(m).map((method) => [rel, method])),
  )("%s %s is excluded and does not admit the assigned technician", (rel, method) => {
    expect(handlerAdmitsAssignee(read(rel), method)).toEqual([]);
  });

  it.each(Object.keys(OWNER_ONLY_FILES))(
    "%s stays owner-only: no mutating export admits the assigned technician",
    (rel) => {
      const src = read(rel);
      const leaks = mutatingExports(src).filter((m) => handlerAdmitsAssignee(src, m).length > 0);
      expect(leaks).toEqual([]);
    },
  );

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

  it("PLANTED: a DELETE gated on the assigned-write helper is caught", () => {
    const planted = clean.replace("export async function PATCH", "export async function DELETE");
    expect(deleteAdmitsAssignee(planted)).toEqual(["assertInspectionAssignedWrite"]);
  });

  it("PLANTED: a DELETE reaching the helper through a local function is caught", () => {
    const planted = `
      async function gate(session, id) { return assertInspectionAssignedWrite(session, id); }
      export async function DELETE(req) { const t = await gate(session, id); }
    `;
    expect(deleteAdmitsAssignee(planted)).toEqual(["assertInspectionAssignedWrite"]);
  });

  it("a DELETE on the owner's write reach passes the DELETE rule", () => {
    const owner = clean
      .replace("export async function PATCH", "export async function DELETE")
      .replace("assertInspectionAssignedWrite(session, id)", "resolveInspectionWrite(session, id)");
    expect(deleteAdmitsAssignee(owner)).toEqual([]);
  });

  it("PLANTED (review G1): a child update with the scope filter removed is caught", () => {
    const planted = clean.replace(
      "where: { id: readingId, inspection: tenancy.data.childInspectionFilter }",
      "where: { id: readingId }",
    );
    expect(planted).not.toEqual(clean);
    const v = analyseFieldDataRoute(planted, ["PATCH"]);
    expect(v.map((x) => x.problem).join("\n")).toMatch(/write not re-checked at write time/);
  });

  it("PLANTED: a create on the bare inspection id is caught", () => {
    const planted = clean.replace(
      "await prisma.auditLog.create",
      "await prisma.environmentalData.create({ data: { inspectionId: id } });\n      await prisma.auditLog.create",
    );
    const v = analyseFieldDataRoute(planted, ["PATCH"]);
    expect(v.map((x) => x.problem).join("\n")).toMatch(/environmentalData\.create/);
  });

  it("a create inside writeWithinInspectionScope passes the scoped-write rule", () => {
    const scoped = clean.replace(
      "await prisma.auditLog.create",
      "await writeWithinInspectionScope(tenancy.data.inspectionManyWhere, { updatedAt: new Date() }, (tx) => tx.environmentalData.create({ data: { inspectionId: id } }));\n      await prisma.auditLog.create",
    );
    expect(analyseFieldDataRoute(scoped, ["PATCH"])).toEqual([]);
  });

  it("PLANTED: writeWithinInspectionScope on a bare { id } scope is caught", () => {
    const planted = clean.replace(
      "await prisma.auditLog.create",
      "await writeWithinInspectionScope({ id }, { updatedAt: new Date() }, (tx) => tx.environmentalData.create({ data: { inspectionId: id } }));\n      await prisma.auditLog.create",
    );
    const v = analyseFieldDataRoute(planted, ["PATCH"]);
    expect(v.map((x) => x.problem).join("\n")).toMatch(/environmentalData\.create/);
  });

  it("PLANTED (review G2): the inspection DELETE gated on the assignee helper is caught", () => {
    const original = read("route.ts");
    const i = original.indexOf("export async function DELETE(");
    const planted =
      original.slice(0, i) +
      original
        .slice(i)
        .replace(
          "where: { id, userId: session.user.id },",
          "where: { id, userId: session.user.id, gate: await assertInspectionAssignedWrite(session, id) },",
        );
    expect(planted).not.toEqual(original);
    expect(handlerAdmitsAssignee(planted, "DELETE")).toEqual(["assertInspectionAssignedWrite"]);
  });

  it("PLANTED (review G3): contents pack-out POST gated on the assignee helper is caught", () => {
    const original = read("contents-pack-out/route.ts");
    const i = original.indexOf("export async function POST(");
    const planted =
      original.slice(0, i) +
      original.slice(i).replace("resolveInspectionWrite(", "assertInspectionAssignedWrite(");
    expect(planted).not.toEqual(original);
    expect(handlerAdmitsAssignee(planted, "POST")).toEqual(["assertInspectionAssignedWrite"]);
  });

  it("PLANTED: an AI-spend POST gated on the assignee helper is caught", () => {
    const original = read("group-readings/route.ts");
    const i = original.indexOf("export async function POST(");
    const j = original.indexOf("export async function PATCH(");
    const planted =
      original.slice(0, i) +
      original
        .slice(i, j)
        .replace("const inspection = await prisma.inspection.findFirst(", "await assertInspectionAssignedWrite(session, inspectionId);\n    const inspection = await prisma.inspection.findFirst(") +
      original.slice(j);
    expect(planted).not.toEqual(original);
    expect(handlerAdmitsAssignee(planted, "POST")).toEqual(["assertInspectionAssignedWrite"]);
  });

  it("PLANTED (review 4773ca1f P1): draft-snapshot PUT on the assignee helper is caught for its deletes", () => {
    const original = read("draft-snapshot/route.ts");
    const planted = original.replace(
      "const tenancy = await resolveInspectionWrite(session, id);",
      "const tenancy = await assertInspectionAssignedWrite(session, id);",
    );
    expect(planted).not.toEqual(original);
    const problems = analyseFieldDataRoute(planted, ["PUT"], "draft-snapshot/route.ts").map((x) => x.problem);
    expect(problems.join("\n")).toMatch(/deletes rows \(line \d+: moistureReading\.deleteMany\)/);
    expect(problems.join("\n")).toMatch(/scopeItem\.deleteMany/);
    // And the exclusion check catches it as well.
    expect(handlerAdmitsAssignee(planted, "PUT")).toEqual(["assertInspectionAssignedWrite"]);
  });

  it("PLANTED: a delete inside a scoped write in a gated handler is still caught", () => {
    const planted = clean.replace(
      "await prisma.auditLog.create",
      "await writeWithinInspectionScope(tenancy.data.inspectionManyWhere, {}, (tx) => tx.moistureReading.deleteMany({ where: { inspectionId: id } }));\n      await prisma.auditLog.create",
    );
    const v = analyseFieldDataRoute(planted, ["PATCH"]);
    expect(v.map((x) => x.problem).join("\n")).toMatch(/deletes rows \(line \d+: moistureReading\.deleteMany\)/);
  });

  it("PLANTED (review B1): a scope variable aliased to a bare { id } is caught", () => {
    const original = read("environmental/route.ts");
    const planted = original.replace(
      "const scope = writeScope;",
      "const scope: Prisma.InspectionWhereInput = { id };",
    );
    expect(planted).not.toEqual(original);
    const v = analyseFieldDataRoute(planted, ["POST"], "environmental/route.ts");
    expect(v.map((x) => x.problem).join("\n")).toMatch(/environmentalData\.create/);
  });

  it("PLANTED (review B2): a filter replaced by a comment naming it is caught", () => {
    const original = read("moisture/[readingId]/route.ts");
    const planted = original.replace(
      /\.\.\.\(tenancy\.data\.childInspectionFilter && \{\s*inspection: tenancy\.data\.childInspectionFilter,\s*\}\),/,
      "/* childInspectionFilter */",
    );
    expect(planted).not.toEqual(original);
    const v = analyseFieldDataRoute(planted, ["PATCH"], "moisture/[readingId]/route.ts");
    expect(v.map((x) => x.problem).join("\n")).toMatch(/moistureReading\.update/);
  });

  it("PLANTED: an unclassified mutating export is reported", () => {
    expect(mutatingExports(clean + "\nexport async function DELETE() {}")).toEqual([
      "DELETE",
      "PATCH",
    ]);
  });
});
