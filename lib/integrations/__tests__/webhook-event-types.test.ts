/**
 * RA-8427 — guard for the "an ingest route stores an event type that nothing
 * drains" kind (also RA-6964, RA-8423).
 *
 * It discovers instead of listing: it walks app/api/webhooks for every route
 * that creates a WebhookEvent row, reads the event-type strings those routes
 * assign, and compares them with lib/integrations/webhook-event-types.ts.
 * "Drained" entries must be accepted by a drain whose cron production runs
 * (lib/cron/production-schedule.ts, not vercel.json — D-024, D-027).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { PRODUCTION_ENABLED } from "@/lib/cron/production-schedule";
import {
  DRAIN_ACCEPTS,
  INGEST_ROUTE_DIR,
  QBO_MYOB_DRAIN_EVENT_TYPES,
  UNLISTABLE_STORED_VALUES,
  WEBHOOK_EVENT_TYPES,
  type UnlistableStoredValue,
  type WebhookEventTypeEntry,
  type WebhookProvider,
} from "@/lib/integrations/webhook-event-types";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const WEBHOOK_ROOT = join(REPO_ROOT, "app", "api", "webhooks");

interface StoredTrace {
  /** Every string a WebhookEvent write can store, traced to literals in the file. */
  readonly values: Set<string>;
  /** Source text of every stored expression that could not be traced to a literal. */
  readonly untraced: string[];
}

const WRITE_METHODS = new Set(["create", "upsert", "createMany", "update", "updateMany"]);

type Binding = { readonly expr: ts.Expression } | { readonly refuse: string };

/**
 * What a route's WebhookEvent writes store as eventType. It starts at each
 * write and follows the value back through the file, so it fails closed: a
 * value that is not a string literal (an import, a concatenation, a template
 * with a substitution, a property read, a spread it cannot open, a parameter)
 * is reported as untraced instead of being missed. Two earlier versions
 * collected the literals a route contains, and each review found a form they
 * could not see (PR 2557); collecting can never be complete, refusing can.
 *
 * Names are matched by text across the whole file, which over-approximates:
 * every assignment to a name counts, wherever it is. null is not a stored
 * value, because WebhookEvent.eventType is a required column and a write with
 * null throws instead of storing a row.
 */
function traceStoredEventTypes(source: string): StoredTrace {
  const file = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  const values = new Set<string>();
  const untraced: string[] = [];
  const bindings = new Map<string, Binding[]>();
  const functions = new Map<string, ts.FunctionDeclaration>();
  const writes: ts.CallExpression[] = [];
  const text = (n: ts.Node): string => n.getText(file);
  const bind = (name: string, b: Binding): void => {
    bindings.set(name, [...(bindings.get(name) ?? []), b]);
  };

  const index = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      bind(node.name.text, node.initializer ? { expr: node.initializer } : { refuse: "" });
    } else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      bind(node.name.text, { refuse: `parameter ${node.name.text}` });
    } else if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.EqualsToken) bind(node.left.text, { expr: node.right });
      else if (op >= ts.SyntaxKind.FirstCompoundAssignment && op <= ts.SyntaxKind.LastCompoundAssignment) {
        bind(node.left.text, { refuse: text(node) });
      }
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      WRITE_METHODS.has(node.expression.name.text) &&
      /(^|\.)webhookEvent$/.test(text(node.expression.expression))
    ) {
      writes.push(node);
    }
    ts.forEachChild(node, index);
  };
  index(file);

  const returnsOf = (fn: ts.FunctionDeclaration): ts.Expression[] => {
    const out: ts.Expression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
      ts.forEachChild(node, visit);
    };
    if (fn.body) ts.forEachChild(fn.body, visit);
    return out;
  };

  const resolve = (expr: ts.Expression, seen: Set<ts.Node>): void => {
    if (seen.has(expr)) return;
    seen.add(expr);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      values.add(expr.text);
    } else if (expr.kind === ts.SyntaxKind.NullKeyword) {
      // not storable: required column
    } else if (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isSatisfiesExpression(expr) ||
      ts.isNonNullExpression(expr)
    ) {
      resolve(expr.expression, seen);
    } else if (ts.isConditionalExpression(expr)) {
      resolve(expr.whenTrue, seen);
      resolve(expr.whenFalse, seen);
    } else if (ts.isIdentifier(expr) && bindings.has(expr.text)) {
      for (const b of bindings.get(expr.text)!) {
        if ("expr" in b) resolve(b.expr, seen);
        else if (b.refuse) untraced.push(b.refuse);
      }
    } else if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && functions.has(expr.expression.text)) {
      for (const r of returnsOf(functions.get(expr.expression.text)!)) resolve(r, seen);
    } else {
      untraced.push(text(expr));
    }
  };

  const propName = (p: ts.ObjectLiteralElementLike): string | undefined =>
    p.name && !ts.isComputedPropertyName(p.name) ? text(p.name).replace(/^["'`]|["'`]$/g, "") : undefined;

  /** Resolve eventType in an object a write stores; refuse what cannot be opened. */
  const readObject = (expr: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(expr)) return readObject(expr.expression);
    if (ts.isConditionalExpression(expr)) {
      const a = readObject(expr.whenTrue);
      const b = readObject(expr.whenFalse);
      return a || b;
    }
    if (!ts.isObjectLiteralExpression(expr)) {
      untraced.push(`...${text(expr)}`);
      return false;
    }
    let named = false;
    for (const p of expr.properties) {
      if (ts.isSpreadAssignment(p)) {
        named = readObject(p.expression) || named;
      } else if (p.name && ts.isComputedPropertyName(p.name)) {
        untraced.push(text(p));
      } else if (propName(p) === "eventType") {
        named = true;
        if (ts.isPropertyAssignment(p)) resolve(p.initializer, new Set());
        else if (ts.isShorthandPropertyAssignment(p)) resolve(p.name, new Set());
        else untraced.push(text(p));
      }
    }
    return named;
  };

  for (const call of writes) {
    const method = (call.expression as ts.PropertyAccessExpression).name.text;
    const arg = call.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) {
      untraced.push(`webhookEvent.${method}(${arg ? text(arg) : ""})`);
      continue;
    }
    for (const key of method === "upsert" ? ["create", "update"] : ["data"]) {
      const prop = arg.properties.find((p) => propName(p) === key);
      const creates = method === "create" || method === "createMany" || (method === "upsert" && key === "create");
      if (!prop || !ts.isPropertyAssignment(prop)) {
        if (creates || prop) untraced.push(`webhookEvent.${method} ${key}: ${prop ? text(prop) : "missing"}`);
        continue;
      }
      const named = readObject(prop.initializer);
      if (!named && creates && ts.isObjectLiteralExpression(prop.initializer)) {
        untraced.push(`webhookEvent.${method} ${key} sets no eventType`);
      }
    }
  }
  return { values, untraced };
}

function walkRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkRoutes(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

/** Every webhook route that writes a WebhookEvent row, keyed by its directory. */
function discoverIngestRoutes(): Map<string, string> {
  const routes = new Map<string, string>();
  for (const file of walkRoutes(WEBHOOK_ROOT)) {
    const source = readFileSync(file, "utf8");
    if (!/webhookEvent\s*\.\s*(create|upsert|createMany|update|updateMany)\b/.test(source)) continue;
    routes.set(relative(WEBHOOK_ROOT, file).split(sep).slice(0, -1).join("/"), source);
  }
  return routes;
}

/** Problems between what routes store and what the registry declares. */
function compareWithRegistry(
  stored: ReadonlyMap<WebhookProvider, StoredTrace>,
  registry: readonly WebhookEventTypeEntry[],
  productionCrons: ReadonlySet<string>,
  unlistable: readonly UnlistableStoredValue[] = UNLISTABLE_STORED_VALUES,
): string[] {
  const problems: string[] = [];
  for (const [provider, trace] of stored) {
    for (const expr of trace.untraced) {
      if (!unlistable.some((u) => u.provider === provider && u.expression === expr)) {
        problems.push(`${provider} route stores \`${expr}\`, which the guard cannot trace to a listed string`);
      }
    }
  }
  for (const u of unlistable) {
    if (!stored.get(u.provider)?.untraced.includes(u.expression)) {
      problems.push(`${u.provider} \`${u.expression}\` is listed as unlistable but no ingest route stores it`);
    }
    if (!/^RA-\d+$/.test(u.ticket)) problems.push(`${u.provider} \`${u.expression}\` has no ticket`);
  }
  for (const [provider, trace] of stored) {
    for (const t of trace.values) {
      if (!registry.some((e) => e.provider === provider && e.eventType === t)) {
        problems.push(`${provider} route stores "${t}" but webhook-event-types.ts does not list it`);
      }
    }
  }
  for (const e of registry) {
    if (!stored.get(e.provider)?.values.has(e.eventType)) {
      problems.push(`${e.provider} "${e.eventType}" is listed but no ingest route stores it`);
    }
    if (e.disposition.kind === "drained") {
      const drain = DRAIN_ACCEPTS[e.disposition.cron];
      if (!drain.providers.includes(e.provider) || !drain.eventTypes.includes(e.eventType)) {
        problems.push(`${e.provider} "${e.eventType}" is marked drained by ${e.disposition.cron}, which does not accept it`);
      }
      if (!productionCrons.has(e.disposition.cron)) {
        problems.push(`${e.provider} "${e.eventType}" is marked drained by ${e.disposition.cron}, which production does not run`);
      }
    }
    if (e.disposition.kind === "open-defect" && !/^RA-\d+$/.test(e.disposition.ticket)) {
      problems.push(`${e.provider} "${e.eventType}" is an open defect with no ticket`);
    }
  }
  return problems;
}

const PRODUCTION_CRONS = new Set(PRODUCTION_ENABLED.map((c) => c.path));

function storedByProvider(): Map<WebhookProvider, StoredTrace> {
  const routes = discoverIngestRoutes();
  const stored = new Map<WebhookProvider, StoredTrace>();
  for (const [provider, dir] of Object.entries(INGEST_ROUTE_DIR) as [WebhookProvider, string][]) {
    const source = routes.get(dir);
    if (source) stored.set(provider, traceStoredEventTypes(source));
  }
  return stored;
}

describe("webhook event-type registry (RA-8427)", () => {
  it("knows every webhook route that writes a WebhookEvent row", () => {
    const known = new Set(Object.values(INGEST_ROUTE_DIR));
    const routes = [...discoverIngestRoutes().keys()];
    expect(routes.length).toBeGreaterThanOrEqual(4);
    // Any other route that writes a WebhookEvent (the log retry resets status)
    // must be proven never to set an event type.
    const others = [...discoverIngestRoutes()].filter(([r]) => !known.has(r));
    expect(others.map(([r]) => r)).toEqual(["logs/[id]/retry"]);
    for (const [, source] of others) {
      const trace = traceStoredEventTypes(source);
      expect([...trace.values, ...trace.untraced]).toEqual([]);
    }
    expect([...known].filter((d) => !routes.includes(d))).toEqual([]);
  });

  it("matches what the ingest routes store, and drained types reach a production drain", () => {
    expect(compareWithRegistry(storedByProvider(), WEBHOOK_EVENT_TYPES, PRODUCTION_CRONS)).toEqual([]);
  });

  it("the QuickBooks/MYOB drain selects exactly the registry's list", () => {
    // Exact generated text, not a parse: RA-8426 owns these lines until it merges.
    const source = readFileSync(join(REPO_ROOT, "lib", "integrations", "webhook-processor.ts"), "utf8");
    const expected = `eventType: { in: ${JSON.stringify(QBO_MYOB_DRAIN_EVENT_TYPES).replace(/,/g, ", ")} },`;
    const inLists = source.match(/eventType: \{ in: [^}]*\},/g) ?? [];
    expect(inLists).toEqual([expected]);
  });

  it("lists each (provider, eventType) once", () => {
    const keys = WEBHOOK_EVENT_TYPES.map((e) => `${e.provider}:${e.eventType}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("traces the reversal types from the real routes, and only the Xero passthrough is untraced", () => {
    const stored = storedByProvider();
    expect(stored.get("QUICKBOOKS")?.values).toContain("payment.deleted");
    expect(stored.get("MYOB")?.values).toContain("payment.deleted");
    expect(stored.get("XERO")?.values).toContain("payment.updated");
    expect(stored.get("XERO")?.values).toContain("invoice.deleted");
    expect(stored.get("SERVICEM8")?.values).toContain("job.cancelled");
    expect(stored.get("QUICKBOOKS")?.values).toContain("");
    expect(stored.get("XERO")?.untraced).toEqual(["event.eventType"]);
    for (const p of ["QUICKBOOKS", "MYOB", "SERVICEM8"] as const) {
      expect(stored.get(p)?.untraced).toEqual([]);
    }
  });

  // Negative controls: each plants one fault in a copy of a real route and
  // must be reported. The QuickBooks route is the host for every plant.
  const qbo = (): string => readFileSync(join(WEBHOOK_ROOT, "quickbooks", "route.ts"), "utf8");
  const problemsWith = (source: string): string[] => {
    const stored = storedByProvider();
    stored.set("QUICKBOOKS", traceStoredEventTypes(source));
    return compareWithRegistry(stored, WEBHOOK_EVENT_TYPES, PRODUCTION_CRONS);
  };
  const UNLISTED = 'QUICKBOOKS route stores "planted.missed" but webhook-event-types.ts does not list it';

  it("fails when a route stores a type the registry does not list", () => {
    const problems = problemsWith(qbo().replace('eventType = "payment.deleted";', 'eventType = "payment.reversed";'));
    expect(problems).toContain('QUICKBOOKS route stores "payment.reversed" but webhook-event-types.ts does not list it');
    expect(problems).toContain('QUICKBOOKS "payment.deleted" is listed but no ingest route stores it');
  });

  // Literal forms: each is traced to its value, so an unlisted one is named.
  it.each([
    ["an object property", "eventType,", 'eventType: "planted.missed",'],
    ["a single-quoted literal", 'eventType = "payment.deleted";', "eventType = 'planted.missed';"],
    ["a template literal", 'eventType = "payment.deleted";', "eventType = `planted.missed`;"],
    ["a value on the next line", 'eventType = "payment.deleted";', 'eventType =\n                "planted.missed";'],
    ["a ternary", 'eventType = "payment.deleted";', 'eventType = operation ? "planted.missed" : "payment.deleted";'],
    ["an alias", 'eventType = "payment.deleted";', 'const alias = "planted.missed";\n              eventType = alias;'],
  ])("names an unlisted type stored as %s", (_form, from, to) => {
    const source = qbo();
    expect(source).toContain(from);
    expect(problemsWith(source.replace(from, to))).toContain(UNLISTED);
  });

  // Forms no list can name (review round 2 found the first three): each must
  // fail as untraced rather than pass unseen.
  it.each([
    ["an imported constant", 'eventType = "payment.deleted";', "eventType = PLANTED_TYPE;", "PLANTED_TYPE"],
    ["a concatenation", 'eventType = "payment.deleted";', 'eventType = "payment." + "reversed";', '"payment." + "reversed"'],
    ["a substituted template", 'eventType = "payment.deleted";', "eventType = `payment.${operation}`;", "`payment.${operation}`"],
    ["a property read", 'eventType = "payment.deleted";', "eventType = entity.type;", "entity.type"],
    ["a compound assignment", 'eventType = "payment.deleted";', 'eventType += ".x";', 'eventType += ".x"'],
    ["an alias of an import", 'eventType = "payment.deleted";', "const alias2 = PLANTED_TYPE;\n              eventType = alias2;", "PLANTED_TYPE"],
    ["a call to a function the file does not define", 'eventType = "payment.deleted";', "eventType = mapIt(entity);", "mapIt(entity)"],
    ["a spread into data", "eventType,", "...extra,", "...extra"],
  ])("fails when a route stores %s", (_form, from, to, expr) => {
    const source = qbo();
    expect(source).toContain(from);
    expect(problemsWith(source.replace(from, to))).toContain(
      `QUICKBOOKS route stores \`${expr}\`, which the guard cannot trace to a listed string`,
    );
  });

  it("fails when the Xero passthrough exemption is removed, or names an expression no route stores", () => {
    expect(
      compareWithRegistry(storedByProvider(), WEBHOOK_EVENT_TYPES, PRODUCTION_CRONS, []),
    ).toContain("XERO route stores `event.eventType`, which the guard cannot trace to a listed string");
    const stale = [...UNLISTABLE_STORED_VALUES, { provider: "MYOB" as const, expression: "event.Kind", ticket: "RA-8427", whatHappens: "x" }];
    expect(compareWithRegistry(storedByProvider(), WEBHOOK_EVENT_TYPES, PRODUCTION_CRONS, stale)).toContain(
      "MYOB `event.Kind` is listed as unlistable but no ingest route stores it",
    );
  });

  it("fails when the empty-type defect is dropped from the registry", () => {
    const registry = WEBHOOK_EVENT_TYPES.filter((e) => !(e.provider === "QUICKBOOKS" && e.eventType === ""));
    expect(compareWithRegistry(storedByProvider(), registry, PRODUCTION_CRONS)).toContain(
      'QUICKBOOKS route stores "" but webhook-event-types.ts does not list it',
    );
  });

  it("does not read an event type inside a comment or outside a write", () => {
    const trace = traceStoredEventTypes(
      '// eventType = "comment.only";\n/* "block.only" */\nconst eventType = "not.written";\nconst x = 1;',
    );
    expect([...trace.values]).toEqual([]);
    expect(trace.untraced).toEqual([]);
  });

  it("follows a local mapping function's returns (the ServiceM8 shape)", () => {
    const trace = traceStoredEventTypes(
      'function m(s: string) { if (s) return "a.b"; return null; }\nconst t = m("x");\nawait prisma.webhookEvent.create({ data: { eventType: t } });',
    );
    expect([...trace.values]).toEqual(["a.b"]);
    expect(trace.untraced).toEqual([]);
  });

  it("fails, naming the reversal and ServiceM8 types, when only drained types are registered (main before RA-8427)", () => {
    const drainedOnly = WEBHOOK_EVENT_TYPES.filter((e) => e.disposition.kind === "drained");
    const problems = compareWithRegistry(storedByProvider(), drainedOnly, PRODUCTION_CRONS).join("\n");
    for (const name of [
      'QUICKBOOKS route stores "payment.deleted"',
      'MYOB route stores "payment.updated"',
      'XERO route stores "invoice.deleted"',
      'SERVICEM8 route stores "job.status_updated"',
    ]) {
      expect(problems).toContain(name);
    }
  });

  it("fails when a type is marked drained but its drain does not accept it or production does not run it", () => {
    const planted: WebhookEventTypeEntry[] = WEBHOOK_EVENT_TYPES.map((e) =>
      e.provider === "QUICKBOOKS" && e.eventType === "payment.deleted"
        ? { ...e, disposition: { kind: "drained", cron: "sync-qbo-myob-payments" } }
        : e,
    );
    const problems = compareWithRegistry(storedByProvider(), planted, PRODUCTION_CRONS);
    expect(problems).toContain(
      'QUICKBOOKS "payment.deleted" is marked drained by sync-qbo-myob-payments, which does not accept it',
    );
    expect(problems).toContain(
      'QUICKBOOKS "payment.deleted" is marked drained by sync-qbo-myob-payments, which production does not run',
    );
  });
});
