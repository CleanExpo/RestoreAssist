import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative } from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * RA-8426 — a queue row that is claimed must have a claim that expires, and
 * something scheduled must enforce the expiry.
 *
 * A claim is a guarded `updateMany` that moves a row into PROCESSING
 * (`where: { ..., status: ... }`, `data: { status: "PROCESSING" }`). If the
 * run that made the claim dies before it writes the outcome (function
 * timeout, crash, a failed second write), the row stays PROCESSING and every
 * drain that selects PENDING passes it by. The rescue is an `updateMany`
 * whose `where` selects `status: "PROCESSING"` by `updatedAt`.
 *
 * This test discovers every claim in app/ and lib/, then walks the call graph
 * from the GET handler of every cron route in vercel.json (Vercel cron sends
 * GET). A claimed table with no rescue on that graph fails here. On
 * 71d62176 the WebhookEvent rescue lived only inside processWebhookQueue,
 * which no scheduled GET reaches.
 */

const ROOT = join(__dirname, "..", "..", "..");

/**
 * Claimed tables known to have no scheduled rescue yet, each owned by a
 * ticket. An entry here that stops being needed fails the last test, so the
 * list cannot outlive its reason.
 */
const KNOWN_GAPS: Record<string, string> = {
  invoiceSyncJob:
    "RA-8423: the invoice sync queue has no scheduled consumer at all; the rescue lands with the consumer.",
  zohoSyncJob:
    "RA-8199: Zoho CRM two-way integration is in progress on its own branch; do not edit it from here.",
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/** The text between the bracket at `open` and its partner. */
function balanced(source: string, open: number): string {
  const pair: Record<string, string> = { "(": ")", "{": "}" };
  const opener = source[open];
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === opener) depth++;
    else if (source[i] === pair[opener] && --depth === 0) {
      return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/** The body of the first `key: { ... }` object in `args`, or null. */
function objectFor(args: string, key: "where" | "data"): string | null {
  const match = new RegExp(`\\b${key}\\s*:\\s*\\{`).exec(args);
  return match ? balanced(args, match.index + match[0].length - 1) : null;
}

interface UpdateMany {
  model: string;
  where: string;
  data: string;
  offset: number;
}

function updateManyCalls(source: string): UpdateMany[] {
  const calls: UpdateMany[] = [];
  const call = /\.\s*(\w+)\s*\.\s*updateMany\s*\(/g;
  for (const match of source.matchAll(call)) {
    const args = balanced(source, match.index + match[0].length - 1);
    const where = objectFor(args, "where");
    const data = objectFor(args, "data");
    if (where !== null && data !== null) {
      calls.push({ model: match[1], where, data, offset: match.index });
    }
  }
  return calls;
}

const PROCESSING = /\bstatus\s*:\s*"PROCESSING"/;

/** A guarded transition into PROCESSING: the queue claim. */
function isClaim(call: UpdateMany): boolean {
  return PROCESSING.test(call.data) && /\bstatus\b\s*:/.test(call.where);
}

/** An expiry: selects PROCESSING rows by age and moves them out. */
function isRescue(call: UpdateMany): boolean {
  return (
    PROCESSING.test(call.where) &&
    /\bupdatedAt\b\s*:/.test(call.where) &&
    /\bstatus\b\s*:/.test(call.data) &&
    !PROCESSING.test(call.data)
  );
}

// ── Call graph over top-level declarations ──────────────────────────────────

interface Module {
  source: string;
  file: ts.SourceFile;
  defs: Map<string, ts.Node>;
  imports: Map<string, { spec: string; name: string }>;
  reexports: Map<string, { spec: string; name: string }>;
  starExports: string[];
}

const modules = new Map<string, Module | null>();

function resolveSpec(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(fromFile), spec);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

function load(path: string): Module | null {
  if (modules.has(path)) return modules.get(path)!;
  if (!existsSync(path)) {
    modules.set(path, null);
    return null;
  }
  const source = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const mod: Module = {
    source,
    file,
    defs: new Map(),
    imports: new Map(),
    reexports: new Map(),
    starExports: [],
  };
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      mod.defs.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) mod.defs.set(decl.name.text, decl);
      }
    } else if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const spec = statement.moduleSpecifier.text;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          mod.imports.set(el.name.text, {
            spec,
            name: (el.propertyName ?? el.name).text,
          });
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const spec = statement.moduleSpecifier.text;
      const clause = statement.exportClause;
      if (!clause) mod.starExports.push(spec);
      else if (ts.isNamedExports(clause)) {
        for (const el of clause.elements) {
          mod.reexports.set(el.name.text, {
            spec,
            name: (el.propertyName ?? el.name).text,
          });
        }
      }
    }
  }
  modules.set(path, mod);
  return mod;
}

type NodeKey = string; // `${file}#${name}`

function resolveExport(
  path: string,
  name: string,
  depth = 0,
): NodeKey | null {
  if (depth > 10) return null;
  const mod = load(path);
  if (!mod) return null;
  if (mod.defs.has(name)) return `${path}#${name}`;
  const re = mod.reexports.get(name);
  if (re) {
    const target = resolveSpec(path, re.spec);
    return target ? resolveExport(target, re.name, depth + 1) : null;
  }
  for (const spec of mod.starExports) {
    const target = resolveSpec(path, spec);
    const found = target ? resolveExport(target, name, depth + 1) : null;
    if (found) return found;
  }
  return null;
}

/** Every top-level declaration this one refers to, in its file or imported. */
function edges(key: NodeKey): NodeKey[] {
  const [path, name] = key.split("#");
  const mod = load(path)!;
  const node = mod.defs.get(name)!;
  const out = new Set<NodeKey>();
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n) && n.text !== name) {
      if (mod.defs.has(n.text)) out.add(`${path}#${n.text}`);
      else {
        const imported = mod.imports.get(n.text);
        if (imported) {
          const target = resolveSpec(path, imported.spec);
          const resolved = target && resolveExport(target, imported.name);
          if (resolved) out.add(resolved);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return [...out];
}

function cronRoots(): NodeKey[] {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const roots: NodeKey[] = [];
  for (const cron of vercel.crons ?? []) {
    const route = join(ROOT, "app", cron.path.replace(/^\//, ""), "route.ts");
    const root = resolveExport(route, "GET");
    if (root) roots.push(root);
  }
  return roots;
}

function reachableFromCrons(): Set<NodeKey> {
  const seen = new Set<NodeKey>();
  const queue = cronRoots();
  while (queue.length > 0) {
    const key = queue.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...edges(key));
  }
  return seen;
}

function nodeText(key: NodeKey): string {
  const [path, name] = key.split("#");
  const mod = load(path)!;
  const node = mod.defs.get(name)!;
  return mod.source.slice(node.getStart(mod.file), node.getEnd());
}

// ── Discovery ───────────────────────────────────────────────────────────────

function discoverClaims(): Map<string, string[]> {
  const claims = new Map<string, string[]>();
  for (const dir of ["app", "lib"]) {
    for (const path of sourceFiles(join(ROOT, dir))) {
      const source = readFileSync(path, "utf8");
      if (!source.includes("PROCESSING")) continue;
      for (const call of updateManyCalls(source)) {
        if (!isClaim(call)) continue;
        const line = source.slice(0, call.offset).split("\n").length;
        const sites = claims.get(call.model) ?? [];
        sites.push(`${relative(ROOT, path)}:${line}`);
        claims.set(call.model, sites);
      }
    }
  }
  return claims;
}

const reachable = reachableFromCrons();
const claims = discoverClaims();
const rescued = new Set<string>();
for (const key of reachable) {
  for (const call of updateManyCalls(nodeText(key))) {
    if (isRescue(call)) rescued.add(call.model);
  }
}

describe("RA-8426 queue claims have a scheduled expiry", () => {
  it("the walker reaches the payment drains from vercel.json (positive control)", () => {
    const names = [...reachable].map((key) => key.split("#")[1]);
    expect(names).toContain("processXeroWebhookBatch");
    expect(names).toContain("processQboMyobPendingPayments");
    expect(names).toContain("retryFailedEvents");
    // processWebhookQueue is reached only by a POST route and an unused
    // worker; if the walker ever reaches it, it has started guessing.
    expect(names).not.toContain("processWebhookQueue");
  });

  it("discovers the WebhookEvent claims named in the ticket (positive control)", () => {
    expect(claims.get("webhookEvent")?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("every claimed table has a stale rescue reachable from a scheduled GET", () => {
    const missing = [...claims.entries()]
      .filter(([model]) => !rescued.has(model) && !(model in KNOWN_GAPS))
      .map(([model, sites]) => `${model}: claimed at ${sites.join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("every known gap is still a gap and names its ticket", () => {
    for (const [model, reason] of Object.entries(KNOWN_GAPS)) {
      expect(reason).toMatch(/^RA-\d+: /);
      expect(claims.has(model), `${model} is no longer claimed`).toBe(true);
      expect(rescued.has(model), `${model} now has a rescue; remove it from KNOWN_GAPS`).toBe(false);
    }
  });
});
