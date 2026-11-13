#!/usr/bin/env node
/**
 * RA-8348 guard: a client must never hand a raw `<ident>.error` to a sink that
 * expects a string.
 *
 * Routes built on apiError()/fromException() reply with
 * `{ error: { code, message, eventId } }`. Putting that object in React state
 * and rendering it crashes ("Objects are not valid as a React child"); passing
 * it to `new Error(...)` shows "[object Object]" in the toast; interpolating it
 * into a template literal does the same. The one reader that handles every
 * envelope shape is `apiErrorMessage()` in lib/api-error-message.ts.
 *
 * The guard parses each file with the TypeScript compiler, so strings,
 * comments and regular expressions can neither hide a sink nor fake one.
 *
 * A "raw read" is `<ident>.error` or `<ident>["error"]` whose value is used
 * as it is: not followed by a further property access, element access or call
 * (`data.error.message` is a different, typed read), and not on a logging
 * receiver (`console.error`, `toast.error`, ...).
 *
 * It is a violation when it sits inside:
 *   1. the arguments of `new Error(...)` (also `new x.Error(...)`)
 *   2. the arguments of a state setter `set[A-Z]...(...)` (also `x.setFoo(...)`)
 *   3. a `${...}` template-literal interpolation
 * Brackets, `!`, `as`, `satisfies` and `<T>` are looked through everywhere
 * (isTransparent), and every call is named by calleeName.
 * unless, between the read and the first such sink, it passes through a position that
 * cannot carry the object itself (the allow-list in isSafeStep): an argument of
 * apiErrorMessage() or Boolean(), the operand of `!`, `typeof` or `void`, either
 * side of a comparison, the left side of `&&`, the condition of `?:`, or the
 * condition of an if/while/do/for/switch statement.
 *
 * Known limits (outside this guard's scope, stated so they are not mistaken
 * for coverage):
 *   - a value copied to another name first (`const e = body.error; setError(e)`)
 *     or destructured (`const { error } = body`);
 *   - setters not named `set...`; callees chosen at run time (`f[key](...)`,
 *     `(a || setError)(...)`, `getSetter()(...)`); indirect calls such as
 *     `setError.call(null, body.error)`;
 *   - `.error` rendered as a JSX child (`{data.error}`): telling an API body
 *     from component state there needs type information.
 *
 * Scope: app/, components/, hooks/, lib/ excluding app/api/, tests and
 * __tests__ directories. There is no allow-list of files or sites: route the
 * value through apiErrorMessage() instead, which also accepts a plain string.
 *
 * Usage: node scripts/check-api-error-sinks.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const EXT = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP_DIR = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);
const SKIP_FILE = /\.(test|spec)\.[jt]sx?$|\.d\.ts$/;

// Receivers whose `.error` is a logging method, not an API body.
const NON_BODY = new Set(["console", "toast", "logger", "log", "Sentry", "sonner"]);
// Calls whose result cannot be the object passed in.
const NEUTRAL_CALLS = new Set(["apiErrorMessage", "Boolean"]);
const COMPARISON = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const rel = relative(ROOT, full).split(sep).join("/");
    if (rel === "app/api") continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXT.test(name) && !SKIP_FILE.test(name)) yield { full, rel };
  }
}

function scriptKind(fileName) {
  if (/\.tsx$/.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.(js|mjs)$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * The one owner of "this wrapper does not change the value": brackets, `x!`,
 * `x as T`, `x satisfies T` and `<T>x`. Every check that looks through a
 * wrapper calls this; none lists wrappers itself.
 */
const isTransparent = (n) =>
  ts.isParenthesizedExpression(n) ||
  ts.isNonNullExpression(n) ||
  ts.isAsExpression(n) ||
  ts.isSatisfiesExpression(n) ||
  ts.isTypeAssertionExpression(n);

const unwrap = (n) => {
  while (isTransparent(n)) n = n.expression;
  return n;
};

/**
 * The one owner of "what member does this name": `x.name`, `x?.name`,
 * `x["name"]` and `` x[`name`] `` all give "name". Used for the `.error` read
 * and for callee names alike.
 */
function staticMemberName(n) {
  if (ts.isPropertyAccessExpression(n)) return n.name.text;
  if (ts.isElementAccessExpression(n)) {
    const a = n.argumentExpression;
    if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) return a.text;
  }
  return undefined;
}

/**
 * The one owner of "what is this call or `new` named". Looks through
 * transparent wrappers and takes the last operand of a comma expression
 * (`(0, f)(x)` calls f). A bare name always counts; a member name counts only
 * when `member` is true (sinks are matched broadly, safe calls strictly).
 */
function calleeName(expr, { member }) {
  let n = unwrap(expr);
  while (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.CommaToken) n = unwrap(n.right);
  if (ts.isIdentifier(n)) return n.text;
  return member ? staticMemberName(n) : undefined;
}

/** Leftmost identifier of a.b?.c["d"] chains, or undefined. */
function rootName(expr) {
  let n = expr;
  for (;;) {
    n = unwrap(n);
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) n = n.expression;
    else if (ts.isCallExpression(n)) n = n.expression;
    else return ts.isIdentifier(n) ? n.text : undefined;
  }
}

const isErrorRead = (node) => staticMemberName(node) === "error";

/** The read's value is used as it is (not read further, not called). */
function isRawRead(node) {
  if (!isErrorRead(node)) return false;
  if (NON_BODY.has(rootName(node.expression) ?? "")) return false;
  let p = node.parent;
  let child = node;
  while (p && isTransparent(p)) {
    child = p;
    p = p.parent;
  }
  if ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === child) return false;
  if (ts.isCallExpression(p) && p.expression === child) return false;
  return true;
}

/** `child` sits in a position of `parent` that cannot pass the object on. */
function isSafeStep(parent, child) {
  if (ts.isCallExpression(parent) && parent.arguments.includes(child)) {
    return NEUTRAL_CALLS.has(calleeName(parent.expression, { member: false }) ?? "");
  }
  if (ts.isPrefixUnaryExpression(parent)) return parent.operator === ts.SyntaxKind.ExclamationToken;
  if (ts.isTypeOfExpression(parent) || ts.isVoidExpression(parent)) return true;
  if (ts.isBinaryExpression(parent)) {
    if (COMPARISON.has(parent.operatorToken.kind)) return true;
    if (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return parent.left === child;
    return false;
  }
  if (ts.isConditionalExpression(parent)) return parent.condition === child;
  if (
    ts.isIfStatement(parent) ||
    ts.isWhileStatement(parent) ||
    ts.isDoStatement(parent) ||
    ts.isSwitchStatement(parent)
  ) {
    return parent.expression === child;
  }
  if (ts.isForStatement(parent)) return parent.condition === child;
  return false;
}

/** The sink this node is the argument or interpolation of, if any. */
function sinkOf(parent, child) {
  if (ts.isNewExpression(parent) && parent.arguments?.includes(child)) {
    if (calleeName(parent.expression, { member: true }) === "Error") return "new Error(";
  }
  if (ts.isCallExpression(parent) && parent.arguments.includes(child)) {
    const name = calleeName(parent.expression, { member: true });
    // Error(x) without `new` builds the same Error.
    if (name === "Error") return "new Error(";
    if (name && /^set[A-Z]/.test(name)) return `${name}(`;
  }
  if (ts.isTemplateSpan(parent) && parent.expression === child) return "template literal";
  return undefined;
}

/**
 * Walk from the read towards the root and stop at the first sink: that sink
 * has received the object, and nothing outside it can undo that
 * (`void setError(body.error)` still sets the object). A safe step clears the
 * read only when it comes before any sink.
 */
function sinkReached(read) {
  let child = read;
  let parent = read.parent;
  while (parent) {
    if (isSafeStep(parent, child)) return undefined;
    const kind = sinkOf(parent, child);
    if (kind) return kind;
    child = parent;
    parent = parent.parent;
  }
  return undefined;
}

export function findSinks(src, fileName = "file.tsx") {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const found = [];
  const visit = (node) => {
    if (isRawRead(node)) {
      const start = node.getStart(sf);
      const line = sf.getLineAndCharacterOfPosition(start).line + 1;
      const text = node.getText(sf);
      const kind = sinkReached(node);
      if (kind) found.push({ kind, index: start, line, text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = [];
  for (const dir of SCAN_DIRS) {
    for (const { full, rel } of walk(join(ROOT, dir))) {
      for (const f of findSinks(readFileSync(full, "utf8"), full)) {
        violations.push(`${rel}:${f.line}  ${f.text} -> ${f.kind}`);
      }
    }
  }
  if (violations.length > 0) {
    console.error(
      `API error sink guard FAILED: ${violations.length} raw "<ident>.error" read(s) reach a string sink.\n` +
        `Read the body through apiErrorMessage() from lib/api-error-message.ts instead.\n`,
    );
    console.error(violations.join("\n"));
    process.exit(1);
  }
  console.log("API error sink guard passed: no raw body.error reaches a string sink.");
}
