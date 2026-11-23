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
  OPEN_DEFECT_OWNERS,
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
  /**
   * Every mention of the `webhookEvent` delegate that is neither a recognised
   * read nor a write this guard traces (RA-8483, RA-8527): an alias, a bracket
   * access, a destructure, an argument, an unlisted method. Never allow-listed.
   */
  readonly untracedUses: string[];
  /** The status a create write stores `eventType` with (RA-8480). */
  readonly statusesFor: (eventType: string) => Set<string>;
}

const WRITE_METHODS = new Set(["create", "upsert", "createMany", "update", "updateMany"]);
const READ_METHODS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
/** Delegate method names, which a result row read (`webhookEvent.id`) must not use. */
const DELEGATE_METHODS = new Set([
  ...WRITE_METHODS,
  ...READ_METHODS,
  "delete",
  "deleteMany",
  "createManyAndReturn",
  "updateManyAndReturn",
  "fields",
]);
const DELEGATE = "webhookEvent";
const UNKNOWN_STATUS = "<untraced status>";
const DEFAULT_STATUS = "<column default>";

type Binding = { readonly expr: ts.Expression } | { readonly refuse: string };
type Fact = { readonly name: string; readonly values: ReadonlySet<string>; readonly positive: boolean };

const strip = (e: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)
    ? strip(e.expression)
    : e;
const literalOf = (e: ts.Expression): string | undefined => {
  const s = strip(e);
  return ts.isStringLiteral(s) || ts.isNoSubstitutionTemplateLiteral(s) ? s.text : undefined;
};

/**
 * What a route's WebhookEvent writes store as eventType. It starts at each
 * write and follows the value back through the file, so it fails closed: a
 * value that is not a string literal (an import, a concatenation, a template
 * with a substitution, a property read, a spread it cannot open, a parameter)
 * is reported as untraced instead of being missed. Two earlier versions
 * collected the literals a route contains, and each review found a form they
 * could not see (PR 2557); collecting can never be complete, refusing can.
 *
 * Writes are found the same way (RA-8527): every occurrence of the identifier
 * or string `webhookEvent` is classified, and only `<x>.webhookEvent.<method>(…)`
 * with a read or write method, or a result row held in a variable of that name,
 * is recognised. Anything else is an untraced use. Finding writes by their call
 * text let `const t = prisma.webhookEvent; t.create(…)` store an unlisted type
 * with the suite green. A string that names the delegate or the table (bracket
 * access, raw SQL on "WebhookEvent") is an untraced use too (RA-8483).
 *
 * A name that takes a value other than by `name = value` (a destructure, a
 * for-of or for-in target, a catch binding, `++`) is refused, and so is a
 * spread or computed key in a write's argument, which could replace `data`
 * (RA-8483). A repeated `data` key is read every time.
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
  const untracedUses: string[] = [];
  const bindings = new Map<string, Binding[]>();
  const functions = new Map<string, ts.FunctionDeclaration>();
  const writes: ts.CallExpression[] = [];
  const text = (n: ts.Node): string => n.getText(file);
  const line = (n: ts.Node): number => file.getLineAndCharacterOfPosition(n.getStart(file)).line + 1;
  const refuseUse = (n: ts.Node): void => {
    untracedUses.push(`${text(n).replace(/\s+/g, " ").slice(0, 80)} (line ${line(n)})`);
  };
  const bind = (name: string, b: Binding): void => {
    bindings.set(name, [...(bindings.get(name) ?? []), b]);
  };

  /** `<x>.webhookEvent.<method>(…)` for `<x>.webhookEvent`, or undefined. */
  const delegateCall = (access: ts.PropertyAccessExpression): { call: ts.CallExpression; method: string } | undefined => {
    const m = access.parent;
    if (!ts.isPropertyAccessExpression(m) || m.expression !== access) return undefined;
    const call = m.parent;
    if (!ts.isCallExpression(call) || call.expression !== m) return undefined;
    return { call, method: m.name.text };
  };
  /** `await <x>.webhookEvent.<read or write>(…)`: what a result-row variable may hold. */
  const isResultOfDelegateCall = (e: ts.Expression | undefined): boolean => {
    if (!e) return true;
    const s = strip(e);
    if (!ts.isAwaitExpression(s)) return false;
    const call = strip(s.expression);
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return false;
    const access = call.expression.expression;
    return (
      ts.isPropertyAccessExpression(access) &&
      access.name.text === DELEGATE &&
      (READ_METHODS.has(call.expression.name.text) || WRITE_METHODS.has(call.expression.name.text))
    );
  };

  /** Classify one `webhookEvent` identifier. Anything not recognised is refused. */
  const classify = (id: ts.Identifier): void => {
    const p = id.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === id) {
      const dc = delegateCall(p);
      if (dc && WRITE_METHODS.has(dc.method)) writes.push(dc.call);
      else if (!(dc && READ_METHODS.has(dc.method))) refuseUse(dc ? dc.call.expression : p.parent ?? p);
      return;
    }
    // A local variable holding a result row, as every ingest route has.
    if (ts.isVariableDeclaration(p) && p.name === id && isResultOfDelegateCall(p.initializer)) return;
    if (
      ts.isBinaryExpression(p) &&
      p.left === id &&
      p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isResultOfDelegateCall(p.right)
    ) {
      return;
    }
    if (ts.isPropertyAccessExpression(p) && p.expression === id && !DELEGATE_METHODS.has(p.name.text)) return;
    if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) return;
    refuseUse(ts.isVariableDeclaration(p) || ts.isBinaryExpression(p) ? p : (p.parent ?? p));
  };

  /**
   * Every name a destructuring target or binding pattern assigns (RA-8483).
   * Each is bound as refused: the guard does not open a destructure, so a
   * name that takes a value this way cannot be traced, even when the same
   * name also has a plain assignment the guard can read.
   */
  const targetsOf = (n: ts.Node): ts.Identifier[] => {
    if (ts.isIdentifier(n)) return [n];
    if (ts.isParenthesizedExpression(n) || ts.isSpreadElement(n) || ts.isSpreadAssignment(n)) return targetsOf(n.expression);
    if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) {
      return n.elements.flatMap((e) => (ts.isBindingElement(e) ? targetsOf(e.name) : []));
    }
    if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(targetsOf);
    if (ts.isObjectLiteralExpression(n)) {
      return n.properties.flatMap((p) =>
        ts.isShorthandPropertyAssignment(p)
          ? [p.name]
          : ts.isPropertyAssignment(p) || ts.isSpreadAssignment(p)
            ? targetsOf(ts.isPropertyAssignment(p) ? p.initializer : p.expression)
            : [],
      );
    }
    // A default inside a destructure: `[a = "x"] = …`, `{ k: a = "x" } = …`.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) return targetsOf(n.left);
    return [];
  };
  const refuseTargets = (target: ts.Node, why: string): void => {
    for (const id of targetsOf(target)) bind(id.text, { refuse: why });
  };
  const forHead = (s: ts.ForOfStatement | ts.ForInStatement): string =>
    `for (${text(s.initializer)} ${ts.isForOfStatement(s) ? "of" : "in"} ${text(s.expression)})`;
  /** A string that names the delegate or the table: `prisma["webhookEvent"]`, raw SQL on "WebhookEvent". */
  const namesTable = (s: string): boolean =>
    s.toLowerCase() === DELEGATE.toLowerCase() || /\bwebhook_?events?\b/i.test(s);

  const index = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === DELEGATE) classify(node);
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && namesTable(node.text)) {
      // prisma["webhookEvent"], a model-name string handed to a helper,
      // $executeRawUnsafe('INSERT INTO "WebhookEvent" …'), …
      const p = node.parent;
      refuseUse(p && !ts.isSourceFile(p) ? p : node);
    } else if ((ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && namesTable(node.text)) {
      // A substituted template: refuse the whole query, or its tagged call.
      let t: ts.Node = node.parent;
      while (ts.isTemplateSpan(t) || ts.isTemplateExpression(t)) t = t.parent;
      refuseUse(t);
    }
    if (ts.isVariableDeclaration(node)) {
      const list = node.parent;
      const loop = ts.isVariableDeclarationList(list) ? list.parent : undefined;
      // A loop or catch binding takes a value with no initialiser to read.
      const why =
        loop && (ts.isForOfStatement(loop) || ts.isForInStatement(loop))
          ? forHead(loop)
          : ts.isCatchClause(list)
            ? `catch (${text(node)})`
            : undefined;
      if (why) refuseTargets(node.name, why);
      else if (ts.isIdentifier(node.name)) {
        bind(node.name.text, node.initializer ? { expr: node.initializer } : { refuse: "" });
      } else refuseTargets(node.name, text(node));
    } else if (ts.isParameter(node)) {
      refuseTargets(node.name, `parameter ${text(node.name)}`);
    } else if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.EqualsToken) bind(node.left.text, { expr: node.right });
      else if (op >= ts.SyntaxKind.FirstCompoundAssignment && op <= ts.SyntaxKind.LastCompoundAssignment) {
        bind(node.left.text, { refuse: text(node) });
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      (ts.isObjectLiteralExpression(node.left) || ts.isArrayLiteralExpression(node.left))
    ) {
      refuseTargets(node.left, text(node));
    } else if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) {
      refuseTargets(node.initializer, forHead(node));
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
      ts.isIdentifier(node.operand)
    ) {
      bind(node.operand.text, { refuse: text(node) });
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
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

  /** The data object of every row a write creates (create, createMany, upsert's create). */
  const createdData: ts.Expression[] = [];
  for (const call of writes) {
    const method = (call.expression as ts.PropertyAccessExpression).name.text;
    const arg = call.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) {
      untraced.push(`webhookEvent.${method}(${arg ? text(arg) : ""})`);
      continue;
    }
    // RA-8483: a spread or computed key in the argument can replace `data`
    // with a row the guard never reads.
    for (const p of arg.properties) {
      if (ts.isSpreadAssignment(p)) untraced.push(`webhookEvent.${method} ...${text(p.expression)}`);
      else if (p.name && ts.isComputedPropertyName(p.name)) untraced.push(`webhookEvent.${method} ${text(p)}`);
    }
    for (const key of method === "upsert" ? ["create", "update"] : ["data"]) {
      // Every repeat of the key is read: at runtime the last one wins.
      const props = arg.properties.filter((p) => propName(p) === key);
      const creates = method === "create" || method === "createMany" || (method === "upsert" && key === "create");
      if (props.length === 0 && creates) untraced.push(`webhookEvent.${method} ${key}: missing`);
      for (const prop of props) {
        if (!ts.isPropertyAssignment(prop)) {
          untraced.push(`webhookEvent.${method} ${key}: ${text(prop)}`);
          continue;
        }
        const named = readObject(prop.initializer);
        if (!named && creates && ts.isObjectLiteralExpression(prop.initializer)) {
          untraced.push(`webhookEvent.${method} ${key} sets no eventType`);
        }
        if (creates) createdData.push(prop.initializer);
      }
    }
  }

  // ---- RA-8480: the status a created row is stored with, per event type ----

  /** Facts a condition gives when it is `positive` (true) or not. Unknown shapes give none. */
  const factsOf = (cond: ts.Expression, positive: boolean): Fact[] => {
    const c = strip(cond);
    if (ts.isPrefixUnaryExpression(c) && c.operator === ts.SyntaxKind.ExclamationToken) {
      return factsOf(c.operand, !positive);
    }
    if (!ts.isBinaryExpression(c)) return [];
    const op = c.operatorToken.kind;
    const eq = equality(c);
    if (eq) return [{ name: eq.name, values: new Set([eq.value]), positive: eq.equal === positive }];
    if (op === ts.SyntaxKind.AmpersandAmpersandToken && positive) {
      return [...factsOf(c.left, true), ...factsOf(c.right, true)];
    }
    if (op === ts.SyntaxKind.BarBarToken && !positive) {
      return [...factsOf(c.left, false), ...factsOf(c.right, false)];
    }
    if (op === ts.SyntaxKind.BarBarToken && positive) {
      const l = factsOf(c.left, true);
      const r = factsOf(c.right, true);
      if (l.length === 1 && r.length === 1 && l[0].positive && r[0].positive && l[0].name === r[0].name) {
        return [{ name: l[0].name, values: new Set([...l[0].values, ...r[0].values]), positive: true }];
      }
    }
    return [];
  };
  const equality = (c: ts.BinaryExpression): { name: string; value: string; equal: boolean } | undefined => {
    const op = c.operatorToken.kind;
    const equal = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
    const notEqual = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
    if (!equal && !notEqual) return undefined;
    const [l, r] = [strip(c.left), strip(c.right)];
    if (ts.isIdentifier(l) && literalOf(r) !== undefined) return { name: l.text, value: literalOf(r)!, equal };
    if (ts.isIdentifier(r) && literalOf(l) !== undefined) return { name: r.text, value: literalOf(l)!, equal };
    return undefined;
  };
  /** The facts that hold where `node` runs: the if/ternary branches it sits in. */
  const pathFacts = (node: ts.Node): Fact[] => {
    const out: Fact[] = [];
    for (let child = node, p = node.parent; p; child = p, p = p.parent) {
      if (ts.isIfStatement(p)) {
        if (child === p.thenStatement) out.push(...factsOf(p.expression, true));
        else if (child === p.elseStatement) out.push(...factsOf(p.expression, false));
      } else if (ts.isConditionalExpression(p)) {
        if (child === p.whenTrue) out.push(...factsOf(p.condition, true));
        else if (child === p.whenFalse) out.push(...factsOf(p.condition, false));
      }
    }
    return out;
  };
  /** Three-valued: true, false, or undefined when the facts do not decide it. */
  const evaluate = (expr: ts.Expression, facts: readonly Fact[], seen: Set<string>): boolean | undefined => {
    const e = strip(expr);
    if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (e.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
      const v = evaluate(e.operand, facts, seen);
      return v === undefined ? undefined : !v;
    }
    if (ts.isIdentifier(e)) {
      const bs = bindings.get(e.text) ?? [];
      if (seen.has(e.text) || bs.length !== 1 || !("expr" in bs[0])) return undefined;
      return evaluate(bs[0].expr, facts, new Set([...seen, e.text]));
    }
    if (!ts.isBinaryExpression(e)) return undefined;
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
      const l = evaluate(e.left, facts, seen);
      const r = evaluate(e.right, facts, seen);
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
        return l === false || r === false ? false : l === true && r === true ? true : undefined;
      }
      return l === true || r === true ? true : l === false && r === false ? false : undefined;
    }
    const eq = equality(e);
    if (!eq) return undefined;
    let holds: boolean | undefined;
    for (const f of facts.filter((x) => x.name === eq.name)) {
      if (f.positive && !f.values.has(eq.value)) holds = false;
      else if (f.positive && f.values.size === 1) holds ??= true;
      else if (!f.positive && f.values.has(eq.value)) holds = false;
    }
    return holds === undefined ? undefined : holds === eq.equal;
  };
  /** Statuses an object literal stores under `facts`; refuses what it cannot decide. */
  const statusesIn = (expr: ts.Expression, facts: readonly Fact[], out: Set<string>): boolean => {
    const e = strip(expr);
    if (ts.isConditionalExpression(e)) {
      const v = evaluate(e.condition, facts, new Set());
      if (v === undefined) out.add(UNKNOWN_STATUS);
      const a = v !== false && statusesIn(e.whenTrue, facts, out);
      const b = v !== true && statusesIn(e.whenFalse, facts, out);
      return a || b;
    }
    if (!ts.isObjectLiteralExpression(e)) {
      out.add(UNKNOWN_STATUS);
      return false;
    }
    let named = false;
    for (const p of e.properties) {
      if (ts.isSpreadAssignment(p)) named = statusesIn(p.expression, facts, out) || named;
      else if (propName(p) === "status") {
        named = true;
        const v = ts.isPropertyAssignment(p) ? literalOf(p.initializer) : undefined;
        out.add(v ?? UNKNOWN_STATUS);
      }
    }
    return named;
  };
  const statusesFor = (eventType: string): Set<string> => {
    const out = new Set<string>();
    const record = (data: ts.Expression, facts: readonly Fact[]): void => {
      if (!statusesIn(data, facts, out)) out.add(DEFAULT_STATUS);
    };
    for (const data of createdData) {
      if (!ts.isObjectLiteralExpression(data)) continue;
      const prop = data.properties.find((p) => propName(p) === "eventType");
      if (!prop) continue;
      const value = ts.isPropertyAssignment(prop) ? strip(prop.initializer) : ts.isShorthandPropertyAssignment(prop) ? prop.name : undefined;
      if (!value) continue;
      if (literalOf(value) !== undefined) {
        if (literalOf(value) === eventType) record(data, pathFacts(data));
        continue;
      }
      if (!ts.isIdentifier(value)) continue;
      // Each place the variable is given this type, with the branch facts that hold there.
      for (const b of bindings.get(value.text) ?? []) {
        if (!("expr" in b) || literalOf(b.expr) !== eventType) continue;
        const fact: Fact = { name: value.text, values: new Set([eventType]), positive: true };
        record(data, [...pathFacts(b.expr), fact]);
      }
    }
    return out;
  };

  return { values, untraced, untracedUses, statusesFor };
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

/**
 * True when a file mentions the delegate at all. Discovery keys on the name,
 * not on a call shape: a route that only aliases, destructures or bracket-reads
 * the delegate is still discovered, and its uses are then refused (RA-8527).
 */
const mentionsWebhookEvent = (source: string): boolean => /\bwebhookEvent\b/i.test(source);

/** Every webhook route that mentions the WebhookEvent delegate, keyed by its directory. */
function discoverIngestRoutes(): Map<string, string> {
  const routes = new Map<string, string>();
  for (const file of walkRoutes(WEBHOOK_ROOT)) {
    const source = readFileSync(file, "utf8");
    if (!mentionsWebhookEvent(source)) continue;
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
    for (const use of trace.untracedUses) {
      problems.push(`${provider} route uses webhookEvent as \`${use}\`, which is neither a recognised read nor a traced write`);
    }
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
    // RA-8480: "skipped at ingest" must be what the route does: every path
    // that gives the row this type stores it SKIPPED, decided from the
    // branches, or the entry fails. The converse is checked only where the
    // branches decide it: QuickBooks' initial "" reaches the write on paths
    // the guard cannot separate, so its status is untraced, and a type that
    // is not marked skipped is not required to be traceable.
    const statuses = [...(stored.get(e.provider)?.statusesFor(e.eventType) ?? [])].sort();
    if (e.disposition.kind === "skipped-at-ingest" && statuses.join() !== "SKIPPED") {
      problems.push(
        `${e.provider} "${e.eventType}" is marked skipped at ingest but its route stores it as ${statuses.join(", ") || "nothing"}`,
      );
    }
    if (e.disposition.kind !== "skipped-at-ingest" && statuses.includes("SKIPPED") && !statuses.includes(UNKNOWN_STATUS)) {
      problems.push(`${e.provider} "${e.eventType}" is stored SKIPPED at ingest but is marked ${e.disposition.kind}`);
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
    // The logs list only reads; the log retry resets status. Both must be
    // proven never to set an event type, and to use the delegate only in
    // recognised calls.
    const others = [...discoverIngestRoutes()].filter(([r]) => !known.has(r));
    expect(others.map(([r]) => r).sort()).toEqual(["logs", "logs/[id]/retry"]);
    for (const [, source] of others) {
      const trace = traceStoredEventTypes(source);
      expect([...trace.values, ...trace.untraced, ...trace.untracedUses]).toEqual([]);
    }
    expect([...known].filter((d) => !routes.includes(d))).toEqual([]);
  });

  it("matches what the ingest routes store, and drained types reach a production drain", () => {
    expect(compareWithRegistry(storedByProvider(), WEBHOOK_EVENT_TYPES, PRODUCTION_CRONS)).toEqual([]);
  });

  it("names only the current open owner tickets, never the closed RA-8427 (RA-8614)", () => {
    // A unit test cannot read Linear. This pins the owner set, so closing an
    // owner ticket without moving its rows needs a deliberate edit here; the
    // check against Linear itself belongs to RA-8615.
    expect(OPEN_DEFECT_OWNERS).toEqual({ accounting: "RA-8616", serviceM8: "RA-8073" });
    const owners = new Set<string>(Object.values(OPEN_DEFECT_OWNERS));
    const named = [
      ...WEBHOOK_EVENT_TYPES.flatMap((e) =>
        e.disposition.kind === "open-defect" ? [`${e.provider} "${e.eventType}" -> ${e.disposition.ticket}`] : [],
      ),
      ...UNLISTABLE_STORED_VALUES.map((u) => `${u.provider} \`${u.expression}\` -> ${u.ticket}`),
    ];
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((n) => !owners.has(n.split(" -> ")[1]))).toEqual([]);
    for (const e of WEBHOOK_EVENT_TYPES) {
      if (e.disposition.kind !== "open-defect") continue;
      const want = e.provider === "SERVICEM8" ? OPEN_DEFECT_OWNERS.serviceM8 : OPEN_DEFECT_OWNERS.accounting;
      expect(`${e.provider} "${e.eventType}" -> ${e.disposition.ticket}`).toBe(`${e.provider} "${e.eventType}" -> ${want}`);
    }
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
    for (const p of ["QUICKBOOKS", "MYOB", "SERVICEM8", "XERO"] as const) {
      expect(stored.get(p)?.untracedUses).toEqual([]);
    }
  });

  it("reads the ingest status per event type from the real routes (RA-8480)", () => {
    const stored = storedByProvider();
    for (const p of ["QUICKBOOKS", "MYOB"] as const) {
      expect([...stored.get(p)!.statusesFor("payment.created")]).toEqual(["SKIPPED"]);
      expect([...stored.get(p)!.statusesFor("payment.updated")]).toEqual(["PENDING"]);
      expect([...stored.get(p)!.statusesFor("payment.deleted")]).toEqual(["PENDING"]);
    }
    expect([...stored.get("XERO")!.statusesFor("invoice.created")]).toEqual(["PENDING"]);
  });

  // Negative controls: each plants one fault in a copy of a real route and
  // must be reported. The QuickBooks route is the host for every plant.
  const route = (dir: string): string => readFileSync(join(WEBHOOK_ROOT, dir, "route.ts"), "utf8");
  const qbo = (): string => route("quickbooks");
  const problemsWith = (source: string, provider: WebhookProvider = "QUICKBOOKS"): string[] => {
    const stored = storedByProvider();
    stored.set(provider, traceStoredEventTypes(source));
    return compareWithRegistry(stored, WEBHOOK_EVENT_TYPES, PRODUCTION_CRONS);
  };
  const USE = "QUICKBOOKS route uses webhookEvent as `";

  // RA-8483 / RA-8527: every way of reaching the delegate other than a
  // recognised call must fail. Each plant also stores an unlisted type, which
  // the event-type trace cannot see because the write is not recognised: the
  // refused use is the only thing that catches it, so it must be reported.
  const WRITE = "webhookEvent = await prisma.webhookEvent.create({";
  it.each([
    ["an aliased delegate", "const t = prisma.webhookEvent;\n            webhookEvent = await t.create({", "t = prisma.webhookEvent"],
    ["a bracket access", 'webhookEvent = await prisma["webhookEvent"].create({', 'prisma["webhookEvent"]'],
    ["a template bracket access", "webhookEvent = await prisma[`webhookEvent`].create({", "prisma[`webhookEvent`]"],
    ["a destructured delegate", "const { webhookEvent: wh } = prisma;\n            webhookEvent = await wh.create({", "{ webhookEvent: wh }"],
    ["a shorthand destructure", "const { webhookEvent: _w, ...rest } = prisma;\n            webhookEvent = await _w.create({", "{ webhookEvent: _w, ...rest }"],
    ["the delegate passed as an argument", "webhookEvent = await storeRow(prisma.webhookEvent, {", "storeRow(prisma.webhookEvent, {"],
    ["a method called through .call", "webhookEvent = await prisma.webhookEvent.create.call(null, {", "prisma.webhookEvent.create (line"],
    ["a parenthesised delegate", "webhookEvent = await (prisma.webhookEvent).create({", "(prisma.webhookEvent)"],
    ["a bracket method", 'webhookEvent = await prisma.webhookEvent["create"]({', 'prisma.webhookEvent["create"]'],
    ["the result variable rebound to the delegate", "webhookEvent = prisma.webhookEvent;\n            webhookEvent = await webhookEvent.create({", "webhookEvent = prisma.webhookEvent"],
  ])("fails when a route reaches the delegate through %s", (_form, to, use) => {
    const source = qbo();
    expect(source).toContain(WRITE);
    expect(source).toContain("eventType,\n");
    const planted = source.replace(WRITE, to).replace("eventType,\n", 'eventType: "planted.missed",\n');
    const problems = problemsWith(planted);
    expect(problems.filter((p) => p.startsWith(USE + use))).not.toEqual([]);
    expect(problems).not.toContain(UNLISTED);
  });

  it("fails on a delegate method that is neither a recognised read nor a traced write", () => {
    const source = qbo().replace(WRITE, `await prisma.webhookEvent.deleteMany({});\n            ${WRITE}`);
    expect(problemsWith(source).some((p) => p.startsWith(USE + "prisma.webhookEvent.deleteMany"))).toBe(true);
  });

  it("refuses an untraced use in a non-ingest route that mentions the delegate", () => {
    const logs = route("logs");
    const planted = logs.replace("prisma.webhookEvent.count({ where })", "count(prisma.webhookEvent)");
    expect(planted).not.toBe(logs);
    expect(traceStoredEventTypes(planted).untracedUses).toEqual([
      expect.stringMatching(/^count\(prisma\.webhookEvent\) \(line \d+\)$/),
    ]);
  });

  it("discovers a route by any mention of the delegate, not by a write call shape", () => {
    // The pre-RA-8527 discovery regex missed all three.
    const before = /webhookEvent\s*\.\s*(create|upsert|createMany|update|updateMany)\b/;
    for (const source of [
      "const t = prisma.webhookEvent;\nawait t.create({ data: {} });",
      'await prisma["webhookEvent"].create({ data: {} });',
      "const { webhookEvent: w } = prisma;\nawait w.create({ data: {} });",
    ]) {
      expect(before.test(source)).toBe(false);
      expect(mentionsWebhookEvent(source)).toBe(true);
    }
    expect(mentionsWebhookEvent("await prisma.stripeWebhookEvent.create({ data: {} });")).toBe(false);
  });

  // RA-8480: the skipped-at-ingest label must match what the route stores.
  it.each([
    ["QuickBooks", "QUICKBOOKS", "quickbooks"],
    ["MYOB", "MYOB", "myob"],
  ] as const)("fails when the %s route stores payment.created PENDING instead of SKIPPED", (_n, provider, dir) => {
    const source = route(dir);
    expect(source).toContain('status: "SKIPPED" as const,');
    expect(problemsWith(source.replace('status: "SKIPPED" as const,', 'status: "PENDING" as const,'), provider)).toContain(
      `${provider} "payment.created" is marked skipped at ingest but its route stores it as PENDING`,
    );
  });

  it("fails when the SKIPPED branch moves to another event type", () => {
    const from = 'entityName === "Payment" && operation === "Create";';
    expect(qbo()).toContain(from);
    const problems = problemsWith(qbo().replace(from, 'entityName === "Payment" && operation === "Update";'));
    expect(problems).toContain('QUICKBOOKS "payment.created" is marked skipped at ingest but its route stores it as PENDING');
    expect(problems).toContain('QUICKBOOKS "payment.updated" is stored SKIPPED at ingest but is marked open-defect');
  });

  it("fails closed when the SKIPPED guard cannot be decided from the branches", () => {
    const from = 'entityName === "Payment" && operation === "Create";';
    const problems = problemsWith(qbo().replace(from, "Math.random() > 0.5;"));
    expect(problems).toContain(
      `QUICKBOOKS "payment.created" is marked skipped at ingest but its route stores it as ${["PENDING", "SKIPPED", UNKNOWN_STATUS].sort().join(", ")}`,
    );
  });
  const UNLISTED = 'QUICKBOOKS route stores "planted.missed" but webhook-event-types.ts does not list it';

  // RA-8483 (CodeRabbit re-review of PR 2557, and the shapes beside them): a
  // name can take a value without a plain `name = value`, and a write can
  // store a row without a `data` property the guard reads. Each plant stores
  // "planted.missed" in a copy of the QuickBooks route; before RA-8483 the
  // guard saw none of them and reported nothing.
  const TAIL = "\n            });\n          } catch (err) {";
  const cannotTrace = (expr: string): string =>
    `QUICKBOOKS route stores \`${expr}\`, which the guard cannot trace to a listed string`;
  it.each([
    ["a destructuring assignment", '({ eventType } = { eventType: "planted.missed" });', '{ eventType } = { eventType: "planted.missed" }'],
    ["a renaming destructuring assignment", '({ type: eventType } = { type: "planted.missed" });', '{ type: eventType } = { type: "planted.missed" }'],
    ["an array destructuring assignment", '[eventType] = ["planted.missed"];', '[eventType] = ["planted.missed"]'],
    ["a destructuring declaration", '{ const { eventType } = { eventType: "planted.missed" }; void eventType; }', '{ eventType } = { eventType: "planted.missed" }'],
    ["a for-of target", 'for (eventType of ["planted.missed"]) break;', 'for (eventType of ["planted.missed"])'],
    ["a for-of declaration", 'for (const eventType of ["planted.missed"]) void eventType;', 'for (const eventType of ["planted.missed"])'],
    ["a catch binding", 'try { throw "planted.missed"; } catch (eventType) { void eventType; }', "catch (eventType)"],
  ])("fails when the stored name takes a value through %s", (_form, to, expr) => {
    const from = 'eventType = "payment.deleted";';
    const source = qbo();
    expect(source).toContain(from);
    expect(problemsWith(source.replace(from, to))).toContain(cannotTrace(expr));
  });

  it.each([
    ["a spread after data", "...overrides,", "webhookEvent.create ...overrides"],
    ["a computed key", '[dataKey]: { eventType: "planted.missed" },', 'webhookEvent.create [dataKey]: { eventType: "planted.missed" }'],
  ])("fails when a write's argument holds %s", (_form, prop, expr) => {
    const source = qbo();
    expect(source).toContain(TAIL);
    expect(problemsWith(source.replace(TAIL, `\n              ${prop}${TAIL}`))).toContain(cannotTrace(expr));
  });

  it("reads every data key a write repeats, as the last one wins", () => {
    const source = qbo();
    expect(source).toContain(TAIL);
    const planted = source.replace(TAIL, `\n              data: { eventType: "planted.missed", status: "PENDING" },${TAIL}`);
    expect(problemsWith(planted)).toContain(UNLISTED);
  });

  it.each([
    ["a tagged raw query", 'await prisma.$executeRaw`INSERT INTO "WebhookEvent" ("eventType") VALUES (\'planted.missed\')`;'],
    ["an unsafe raw query", "await prisma.$executeRawUnsafe('INSERT INTO \"WebhookEvent\" (\"eventType\") VALUES ($1)', t);"],
    ["a substituted raw query", 'await prisma.$executeRaw`UPDATE "WebhookEvent" SET "eventType" = ${t}`;'],
  ])("fails when a route reaches the table through %s", (_form, sql) => {
    const planted = qbo().replace(WRITE, `${sql}\n            ${WRITE}`);
    expect(problemsWith(planted).filter((p) => p.startsWith(USE))).not.toEqual([]);
  });

  it("traces a write made through a transaction client or an aliased client", () => {
    const trace = traceStoredEventTypes(
      [
        'const db = prisma;\nawait db.webhookEvent.create({ data: { eventType: "a.b" } });',
        'await prisma.$transaction(async (tx) => { await tx.webhookEvent.create({ data: { eventType: "c.d" } }); });',
      ].join("\n"),
    );
    expect([...trace.values].sort()).toEqual(["a.b", "c.d"]);
    expect(trace.untraced).toEqual([]);
    expect(trace.untracedUses).toEqual([]);
  });

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
