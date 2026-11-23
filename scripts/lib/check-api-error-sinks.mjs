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
 * condition of an if/while/do/for/switch statement. A read already narrowed to
 * a string is also safe: the true branch of `typeof R === "string" ? R : ...`
 * and the right side of `typeof R === "string" && R`, where R is the same
 * expression (RA-8367).
 *
 * A copy is followed (RA-8367): when the read is the initialiser of a
 * `const`/`let`/`var` name (`const m = data.error ?? "x"`), or `error` is
 * destructured from a body (`const { error } = body`, `{ error: m }`,
 * `{ error = "x" }`), every later use of that name in the same block is checked
 * by the same rules, and so on through further copies. The finding keeps the
 * line of the original read and lists the names it passed through (`via`).
 *
 * Known limits (outside this guard's scope, stated so they are not mistaken
 * for coverage):
 *   - a copy is matched by name within its block, not by symbol: a value
 *     assigned later (`m = body.error`), passed to a function or returned is
 *     not followed, and an inner name that shadows the copy is treated as it;
 *   - setters not named `set...`; callees chosen at run time (`f[key](...)`,
 *     `(a || setError)(...)`, `getSetter()(...)`); indirect calls such as
 *     `setError.call(null, body.error)`;
 *   - `.error` rendered as a JSX child (`{data.error}`), passed to toast or a
 *     logger (`toast.error(result.error)`), or thrown (`throw body.error`):
 *     telling an API body from a typed string there needs type information,
 *     which a syntax-only check does not have. On this tree such values are
 *     typed strings or component state (for example `result.error: string`
 *     from lib/sketch/seed-estimate-from-sketch.ts).
 *   - a key bound to a named constant (`const K = "error"; body[K]`).
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

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
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
  if (ts.isElementAccessExpression(n)) return staticString(n.argumentExpression);
  return undefined;
}

/**
 * The one owner of "this expression is a string fixed in the syntax": a
 * string or template literal, seen through transparent wrappers, the last
 * operand of a comma, `a + b` of two fixed strings, and a template whose
 * every substitution is a fixed string. A name bound to a constant
 * (`const K = "error"`) is not followed (the alias limit).
 */
function staticString(e) {
  if (!e) return undefined;
  e = unwrap(e);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isBinaryExpression(e)) {
    if (e.operatorToken.kind === ts.SyntaxKind.CommaToken) return staticString(e.right);
    if (e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const l = staticString(e.left);
      const r = staticString(e.right);
      return l !== undefined && r !== undefined ? l + r : undefined;
    }
    return undefined;
  }
  if (ts.isTemplateExpression(e)) {
    let s = e.head.text;
    for (const span of e.templateSpans) {
      const v = staticString(span.expression);
      if (v === undefined) return undefined;
      s += v + span.literal.text;
    }
    return s;
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
  return isUsedAsIs(node);
}

/** The one owner of "this value is not read further and not called". */
function isUsedAsIs(node) {
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

/** `cond` is `typeof <same as value> === "string"` (either order, == or ===). */
function isStringTestOf(cond, value) {
  const c = unwrap(cond);
  if (!ts.isBinaryExpression(c)) return false;
  const op = c.operatorToken.kind;
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken) return false;
  const pair = [unwrap(c.left), unwrap(c.right)];
  const test = pair.find((n) => ts.isTypeOfExpression(n));
  const other = pair.find((n) => n !== test);
  if (!test || staticString(other) !== "string") return false;
  return unwrap(test.expression).getText() === unwrap(value).getText();
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
    if (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return parent.left === child || isStringTestOf(parent.left, child);
    }
    return false;
  }
  if (ts.isConditionalExpression(parent)) {
    return parent.condition === child || (parent.whenTrue === child && isStringTestOf(parent.condition, child));
  }
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

/** The block whose statements can see a declaration made at `node`. */
function scopeOf(node) {
  let n = node.parent;
  while (
    n &&
    !(ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n))
  ) {
    n = n.parent;
  }
  return n;
}

/** `id` reads the variable it names (not a declaration, member name or key). */
function isReference(id) {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if ((ts.isVariableDeclaration(p) || ts.isBindingElement(p) || ts.isParameter(p)) && p.name === id) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (ts.isJsxAttribute(p) && p.name === id) return false;
  if ((ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name === id) {
    return false;
  }
  return true;
}

/** Every later use, as it is, of the name `nameNode` binds, within its block. */
function usesOf(nameNode) {
  const scope = scopeOf(nameNode);
  if (!scope) return [];
  const uses = [];
  const visit = (n) => {
    if (
      ts.isIdentifier(n) &&
      n !== nameNode &&
      n.text === nameNode.text &&
      n.pos >= nameNode.end &&
      isReference(n) &&
      isUsedAsIs(n)
    ) {
      uses.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return uses;
}

/** The name a copy binds when `child` is its whole initialiser, if any. */
function copyTarget(parent, child) {
  if ((ts.isVariableDeclaration(parent) || ts.isBindingElement(parent)) && parent.initializer === child) {
    return ts.isIdentifier(parent.name) ? parent.name : undefined;
  }
  return undefined;
}

const MAX_COPIES = 8;

/**
 * Walk from the read towards the root and stop at the first sink: that sink
 * has received the object, and nothing outside it can undo that
 * (`void setError(body.error)` still sets the object). A safe step clears the
 * read only when it comes before any sink. Reaching the whole initialiser of a
 * copy continues from each later use of the copied name (RA-8367).
 */
function sinkReached(read, via = []) {
  let child = read;
  let parent = read.parent;
  // Once the walk leaves a function body, the declaration above it names the
  // function, not a copy of the read (`const submit = () => {...}`).
  let leftFunction = false;
  while (parent) {
    if (isSafeStep(parent, child)) return undefined;
    const kind = sinkOf(parent, child);
    if (kind) return { kind, via };
    if (ts.isFunctionLike(child)) leftFunction = true;
    const target = leftFunction ? undefined : copyTarget(parent, child);
    if (target) {
      if (via.length >= MAX_COPIES || via.includes(target.text)) return undefined;
      return followCopy(target, via);
    }
    child = parent;
    parent = parent.parent;
  }
  return undefined;
}

function followCopy(target, via) {
  for (const use of usesOf(target)) {
    const hit = sinkReached(use, [...via, target.text]);
    if (hit) return hit;
  }
  return undefined;
}

/** The name `const { error } = body` (or `{ error: m }`, `{ error = "x" }`) binds. */
function destructuredErrorName(node) {
  if (!ts.isBindingElement(node) || node.dotDotDotToken || !ts.isIdentifier(node.name)) return undefined;
  if (!ts.isObjectBindingPattern(node.parent)) return undefined;
  const key = node.propertyName
    ? ts.isIdentifier(node.propertyName)
      ? node.propertyName.text
      : staticString(node.propertyName)
    : node.name.text;
  if (key !== "error") return undefined;
  const decl = node.parent.parent;
  if (!ts.isVariableDeclaration(decl) || !decl.initializer) return undefined;
  if (NON_BODY.has(rootName(decl.initializer) ?? "")) return undefined;
  return node.name;
}

export function findSinks(src, fileName = "file.tsx") {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const found = [];
  const record = (node, hit) => {
    const start = node.getStart(sf);
    const line = sf.getLineAndCharacterOfPosition(start).line + 1;
    found.push({ kind: hit.kind, via: hit.via, index: start, line, text: node.getText(sf) });
  };
  const visit = (node) => {
    if (isRawRead(node)) {
      const hit = sinkReached(node);
      if (hit) record(node, hit);
    }
    const bound = destructuredErrorName(node);
    if (bound) {
      const hit = followCopy(bound, []);
      if (hit) record(node, hit);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Run the CLI. Returns the process exit code; never calls process.exit. */
export function main() {
  let code = 0;
  const violations = [];
  for (const dir of SCAN_DIRS) {
    for (const { full, rel } of walk(join(ROOT, dir))) {
      for (const f of findSinks(readFileSync(full, "utf8"), full)) {
        const via = f.via.length > 0 ? ` (copied to ${f.via.join(" -> ")})` : "";
        violations.push(`${rel}:${f.line}  ${f.text}${via} -> ${f.kind}`);
      }
    }
  }
  if (violations.length > 0) {
    console.error(
      `API error sink guard FAILED: ${violations.length} raw "<ident>.error" read(s) reach a string sink.\n` +
        `Read the body through apiErrorMessage() from lib/api-error-message.ts instead.\n`,
    );
    console.error(violations.join("\n"));
    return 1;
  }
  console.log("API error sink guard passed: no raw body.error reaches a string sink.");
  return code;
}
