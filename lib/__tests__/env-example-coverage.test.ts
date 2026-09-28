import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

/**
 * RA-7477: every env name read on a runtime path must appear in .env.example.
 *
 * Design B. Include roots are explicit, and so is every excluded root, with
 * a reason. A new top-level directory or root file that contains
 * .ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts source and is on neither list fails
 * this test, so a hand-kept include list cannot hide a new folder.
 *
 * Reads .env.example only — never a live env file. Tests are not scanned.
 * Every reference to the process object (a bare `process` that is not a
 * local shadow, `globalThis.process`, or `global.process`) is either resolved
 * to an env name or rejected with file:line. It is not skipped.
 */

const repoRoot = path.resolve(__dirname, "../..");

/** The only env file this guard is allowed to open. */
const ENV_EXAMPLE_REL = ".env.example";

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

/**
 * Injected by Node, Next.js, Vercel, npm, or the CI runner. Not application
 * configuration, so .env.example does not list them.
 *
 * A prefix matches that exact name and any `${prefix}_…` name (`VERCEL`
 * covers `VERCEL` and `VERCEL_ENV`). `npm_` already ends in an underscore,
 * so it covers `npm_package_version` and the other npm-injected names.
 */
const BUILTIN_ENV_NAMES = [
  "NODE_ENV",
  "NEXT_RUNTIME",
  "CI",
  "PORT",
  "TZ",
  "HOME",
  "PATH",
  "TMPDIR",
  "NODE_OPTIONS",
  "ANALYZE",
] as const;

const BUILTIN_ENV_PREFIXES = ["VERCEL", "npm_"] as const;

type ClassifiedRoot = { path: string; reason: string };

/** Production source this guard scans. A path is a directory or a root file. */
const INCLUDE_ROOTS: readonly ClassifiedRoot[] = [
  { path: "app", reason: "App Router routes and pages that ship." },
  { path: "lib", reason: "Server and shared runtime code." },
  { path: "components", reason: "UI that ships, including client bundles." },
  { path: "hooks", reason: "Client hooks that ship with the app." },
  { path: "mobile", reason: "Expo client. It reads EXPO_PUBLIC_API_BASE at runtime." },
  { path: "prisma", reason: "Prisma config and seeds that run against the app database." },
  { path: "public", reason: "Files shipped to the browser, including the service worker." },
  { path: "types", reason: "Types compiled with the app." },
  {
    path: "data",
    reason: "Content modules imported by the app. Test files under it are not scanned.",
  },
  { path: "proxy.ts", reason: "Request proxy. The Host allow-list returns 421." },
  { path: "instrumentation.ts", reason: "Next.js instrumentation hook, loaded in production." },
  { path: "next.config.mjs", reason: "Next.js build config, including DOCKER_BUILD." },
  { path: "capacitor.config.ts", reason: "Capacitor shell config loaded for the native app." },
  { path: "postcss.config.mjs", reason: "CSS build config loaded by the Next.js build." },
  { path: "prisma.config.ts", reason: "Prisma CLI config used to migrate the app database." },
];

/**
 * Top-level source that is not the deployed app. Each entry says why its
 * env names stay out of .env.example.
 */
const EXCLUDE_ROOTS: readonly ClassifiedRoot[] = [
  { path: "node_modules", reason: "Third-party packages, not our configuration." },
  { path: ".next", reason: "Generated build output." },
  {
    path: "config",
    reason:
      "Vitest and Playwright runner config. PLAYWRIGHT_BASE_URL is a test-runner setting, not a deployed app setting.",
  },
  {
    path: "docs",
    reason:
      "Documentation, screenshot scripts, and vendored reference apps. Not the deployed RestoreAssist server.",
  },
  { path: "e2e", reason: "Playwright end-to-end tests." },
  {
    path: "packages",
    reason:
      "Standalone pilot-tester harness (npm --prefix packages/pilot-tester test). The Next.js server does not import it.",
  },
  {
    path: "scripts",
    reason:
      "CI, seed, and operator tooling. RA-7477 keeps those names out of .env.example.",
  },
  { path: "test", reason: "Unit-test support that is not the deployed app." },
  { path: "tests", reason: "Unit tests outside app/ and lib/. Not production code." },
  { path: "tools", reason: "Local maintenance tools, not the deployed app." },
];

const ARRAY_METHODS = new Set([
  "filter",
  "map",
  "forEach",
  "some",
  "every",
  "find",
]);

/**
 * Non-env members of the Node `process` object that included roots actually
 * call. `cwd`, `exit`, `execPath`, and `exitCode` are the whole set at this
 * head. `platform`, `argv`, and `nextTick` are not listed because nothing
 * scanned reads them. `typeof process` is a type query, not a read.
 */
const PROCESS_MEMBERS = new Set(["cwd", "exit", "execPath", "exitCode"]);

type ScanResult = {
  names: string[];
  unresolved: string[];
  sites: Map<string, string>;
};

function isBuiltinEnvName(name: string): boolean {
  if ((BUILTIN_ENV_NAMES as readonly string[]).includes(name)) return true;
  return BUILTIN_ENV_PREFIXES.some((prefix) =>
    prefix.endsWith("_")
      ? name.startsWith(prefix)
      : name === prefix || name.startsWith(`${prefix}_`),
  );
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) return ts.ScriptKind.TSX;
  if (
    filePath.endsWith(".ts") ||
    filePath.endsWith(".mts") ||
    filePath.endsWith(".cts")
  ) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function parseSource(filePath: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
}

function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isBindingIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  if (
    (ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  if (ts.isImportClause(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) && parent.name === node) return true;
  if (ts.isNamespaceImport(parent) && parent.name === node) return true;
  if (ts.isImportEqualsDeclaration(parent) && parent.name === node) return true;
  return false;
}

function declaresName(node: ts.Node, name: string): boolean {
  if (ts.isIdentifier(node)) return node.text === name;
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
    return node.elements.some(
      (element) => !ts.isOmittedExpression(element) && declaresName(element.name, name),
    );
  }
  if (ts.isBindingElement(node)) return declaresName(node.name, name);
  return false;
}

function statementDeclares(stmt: ts.Statement, name: string): boolean {
  if (ts.isVariableStatement(stmt)) {
    return stmt.declarationList.declarations.some((decl) => declaresName(decl.name, name));
  }
  if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) return true;
  if (ts.isClassDeclaration(stmt) && stmt.name?.text === name) return true;
  if (ts.isImportEqualsDeclaration(stmt) && stmt.name.text === name) return true;
  if (ts.isImportDeclaration(stmt) && stmt.importClause) {
    const clause = stmt.importClause;
    if (clause.name?.text === name) return true;
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      return clause.namedBindings.name.text === name;
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      return clause.namedBindings.elements.some((element) => element.name.text === name);
    }
  }
  return false;
}

/** True when `at` sees a local binding of `name` rather than the global. */
function isShadowed(name: string, at: ts.Node): boolean {
  let current: ts.Node | undefined = at.parent;
  while (current) {
    if (isFunctionLike(current)) {
      if (current.parameters.some((param) => declaresName(param.name, name))) return true;
    }
    if (
      ts.isCatchClause(current) &&
      current.variableDeclaration &&
      declaresName(current.variableDeclaration.name, name)
    ) {
      return true;
    }
    const statements =
      ts.isSourceFile(current) || ts.isBlock(current) || ts.isModuleBlock(current)
        ? current.statements
        : null;
    if (statements) {
      for (const stmt of statements) {
        if (!statementDeclares(stmt, name)) continue;
        if (
          ts.isImportDeclaration(stmt) ||
          ts.isImportEqualsDeclaration(stmt) ||
          ts.isFunctionDeclaration(stmt)
        ) {
          return true;
        }
        if (stmt.getStart() < at.getStart()) return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function isGlobalObject(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  if (!ts.isIdentifier(node)) return false;
  if (node.text !== "globalThis" && node.text !== "global") return false;
  return !isShadowed(node.text, node);
}

/** A bare `process`, or `globalThis.process` / `global.process`, not a local shadow. */
function isProcessObjectExpr(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) {
    if (node.text !== "process" || isBindingIdentifier(node)) return false;
    const parent = node.parent;
    if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (parent && ts.isBindingElement(parent) && parent.propertyName === node) return false;
    if (parent && ts.isPropertyAssignment(parent) && parent.name === node) return false;
    return !isShadowed("process", node);
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "process" &&
    isGlobalObject(node.expression)
  ) {
    return true;
  }
  if (ts.isElementAccessExpression(node) && isGlobalObject(node.expression)) {
    return literalKey(node.argumentExpression) === "process";
  }
  return false;
}

function literalKey(expr: ts.Expression | undefined): string | null {
  if (!expr) return null;
  const node = unwrap(expr);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function outerParent(node: ts.Node): ts.Node | undefined {
  let parent = node.parent;
  while (
    parent &&
    (ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isTypeAssertionExpression(parent) ||
      ts.isNonNullExpression(parent))
  ) {
    parent = parent.parent;
  }
  return parent;
}

function sameExpr(candidate: ts.Expression | undefined, expr: ts.Node): boolean {
  return candidate !== undefined && unwrap(candidate) === expr;
}

/** `process.env`, including `process?.env` and `process[\`env\`]`. */
function isEnvObjectExpr(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  if (ts.isPropertyAccessExpression(node) && node.name.text === "env") {
    return isProcessObjectExpr(node.expression);
  }
  if (ts.isElementAccessExpression(node) && literalKey(node.argumentExpression) === "env") {
    return isProcessObjectExpr(node.expression);
  }
  return false;
}

function bindingPropertyName(element: ts.BindingElement): string | null {
  if (element.propertyName) {
    if (ts.isIdentifier(element.propertyName)) return element.propertyName.text;
    if (
      ts.isStringLiteral(element.propertyName) ||
      ts.isNumericLiteral(element.propertyName)
    ) {
      return element.propertyName.text;
    }
    return null;
  }
  if (ts.isIdentifier(element.name)) return element.name.text;
  return null;
}

/** `const { env } = process` or `const { env: alias } = process`. */
function bindingIsProcessEnv(element: ts.BindingElement): boolean {
  if (element.dotDotDotToken || !ts.isIdentifier(element.name)) return false;
  if (bindingPropertyName(element) !== "env") return false;
  const pattern = element.parent;
  if (!ts.isObjectBindingPattern(pattern)) return false;
  const decl = pattern.parent;
  if (!ts.isVariableDeclaration(decl) || !decl.initializer) return false;
  return isProcessObjectExpr(decl.initializer);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function snippet(sf: ts.SourceFile, node: ts.Node): string {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const line = sf.text.split(/\r?\n/)[start.line] ?? "";
  return line.trim().slice(0, 160);
}

function bindsName(initializer: ts.ForInitializer, name: string): boolean {
  if (!ts.isVariableDeclarationList(initializer)) return false;
  return initializer.declarations.some(
    (decl) => ts.isIdentifier(decl.name) && decl.name.text === name,
  );
}

function stringLiteralText(expr: ts.Expression): string | null {
  const node = unwrap(expr);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function constInitializer(
  scope: ts.Node,
  name: string,
  before: number,
): ts.Expression | null {
  const statements = ts.isSourceFile(scope)
    ? scope.statements
    : ts.isBlock(scope) || ts.isModuleBlock(scope)
      ? scope.statements
      : [];
  let found: ts.Expression | null = null;
  for (const stmt of statements) {
    if (stmt.getStart() >= before) break;
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
        found = decl.initializer;
      }
    }
  }
  return found;
}

type Binding =
  | { kind: "forof"; expr: ts.Expression }
  | { kind: "init"; expr: ts.Expression }
  | { kind: "array"; expr: ts.Expression }
  | { kind: "union"; values: string[] };

function literalUnion(param: ts.ParameterDeclaration): string[] | null {
  const type = param.type;
  if (!type || !ts.isUnionTypeNode(type)) return null;
  const values: string[] = [];
  for (const part of type.types) {
    if (
      ts.isLiteralTypeNode(part) &&
      ts.isStringLiteral(part.literal)
    ) {
      values.push(part.literal.text);
    } else {
      return null;
    }
  }
  return values.length > 0 ? values : null;
}

function findBinding(id: ts.Identifier): Binding | null {
  let current: ts.Node | undefined = id.parent;
  while (current) {
    if (
      ts.isForOfStatement(current) &&
      bindsName(current.initializer, id.text) &&
      id.getStart() >= current.statement.getStart()
    ) {
      return { kind: "forof", expr: current.expression };
    }
    if (
      (ts.isArrowFunction(current) ||
        ts.isFunctionExpression(current) ||
        ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current)) &&
      current.body &&
      id.getStart() >= current.body.getStart()
    ) {
      const index = current.parameters.findIndex(
        (param) => ts.isIdentifier(param.name) && param.name.text === id.text,
      );
      if (index >= 0) {
        const param = current.parameters[index]!;
        const union = literalUnion(param);
        if (union) return { kind: "union", values: union };
        if (
          index === 0 &&
          (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
          ts.isCallExpression(current.parent) &&
          ts.isPropertyAccessExpression(current.parent.expression) &&
          ARRAY_METHODS.has(current.parent.expression.name.text)
        ) {
          return { kind: "array", expr: current.parent.expression.expression };
        }
        return null;
      }
    }
    if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isModuleBlock(current)) {
      const init = constInitializer(current, id.text, id.getStart());
      if (init) return { kind: "init", expr: init };
    }
    current = current.parent;
  }
  return null;
}

function stringArrayElements(
  expr: ts.Expression,
  sf: ts.SourceFile,
  seen: Set<ts.Node>,
): string[] | null {
  if (seen.has(expr)) return null;
  seen.add(expr);
  const node = unwrap(expr);
  if (ts.isArrayLiteralExpression(node)) {
    const values: string[] = [];
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) return null;
      const text = stringLiteralText(element);
      if (text === null) return null;
      values.push(text);
    }
    return values;
  }
  if (ts.isIdentifier(node)) {
    const binding = findBinding(node);
    if (!binding || binding.kind !== "init") return null;
    return stringArrayElements(binding.expr, sf, seen);
  }
  return null;
}

function resolveStrings(
  expr: ts.Expression,
  sf: ts.SourceFile,
  seen: Set<ts.Node>,
): string[] | null {
  if (seen.has(expr)) return null;
  const node = unwrap(expr);
  const literal = stringLiteralText(node);
  if (literal !== null) return [literal];
  if (ts.isIdentifier(node)) {
    const binding = findBinding(node);
    if (!binding) return null;
    if (binding.kind === "union") return binding.values;
    if (binding.kind === "forof" || binding.kind === "array") {
      return stringArrayElements(binding.expr, sf, seen);
    }
    return resolveStrings(binding.expr, sf, seen);
  }
  if (ts.isTemplateExpression(node)) {
    let parts: string[][] = [[node.head.text]];
    for (const span of node.templateSpans) {
      const values = resolveStrings(span.expression, sf, seen);
      if (!values || values.length === 0) return null;
      const next: string[][] = [];
      for (const prefix of parts) {
        for (const value of values) {
          next.push([...prefix, value, span.literal.text]);
        }
      }
      parts = next;
    }
    return parts.map((part) => part.join(""));
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "toUpperCase" &&
    node.arguments.length === 0
  ) {
    const base = resolveStrings(node.expression.expression, sf, seen);
    return base ? base.map((value) => value.toUpperCase()) : null;
  }
  if (ts.isElementAccessExpression(node)) {
    return objectStringValues(node.expression, sf, seen);
  }
  return null;
}

function objectStringValues(
  expr: ts.Expression,
  sf: ts.SourceFile,
  seen: Set<ts.Node>,
): string[] | null {
  if (seen.has(expr)) return null;
  seen.add(expr);
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) {
    const binding = findBinding(node);
    if (!binding || binding.kind !== "init") return null;
    return objectStringValues(binding.expr, sf, seen);
  }
  if (!ts.isObjectLiteralExpression(node)) return null;
  const values: string[] = [];
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) return null;
    const text = stringLiteralText(prop.initializer);
    if (text === null) return null;
    values.push(text);
  }
  return values.length > 0 ? values : null;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function findFunction(name: string, sf: ts.SourceFile): ts.FunctionLikeDeclaration | null {
  let found: ts.FunctionLikeDeclaration | null = null;
  function visit(node: ts.Node): void {
    if (found) return;
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.body
    ) {
      found = node;
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return found;
}

function parameterIndex(fn: ts.FunctionLikeDeclaration, name: string): number | null {
  const index = fn.parameters.findIndex(
    (param) => ts.isIdentifier(param.name) && param.name.text === name,
  );
  return index >= 0 ? index : null;
}

/**
 * Names read off one parameter that holds process.env, plus indexes that are
 * themselves parameters (envSet(name, env) → the caller's string literal).
 */
function readsOfEnvParameter(
  fn: ts.FunctionLikeDeclaration,
  paramName: string,
): { names: string[]; keyParameters: number[]; unresolved: boolean } {
  const names: string[] = [];
  const keyParameters: number[] = [];
  let unresolved = false;

  function shadowed(node: ts.Node): boolean {
    if (!isFunctionLike(node) || node === fn) return false;
    return node.parameters.some(
      (param) => ts.isIdentifier(param.name) && param.name.text === paramName,
    );
  }

  function walk(node: ts.Node, hide: boolean): void {
    const nextHide = hide || shadowed(node);
    if (!nextHide && ts.isPropertyAccessExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === paramName &&
        ts.isIdentifier(node.name)
      ) {
        names.push(node.name.text);
      }
    }
    if (!nextHide && ts.isElementAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === paramName) {
        const arg = node.argumentExpression;
        if (arg && stringLiteralText(arg) !== null) {
          names.push(stringLiteralText(arg)!);
        } else if (arg && ts.isIdentifier(unwrap(arg))) {
          const index = parameterIndex(fn, (unwrap(arg) as ts.Identifier).text);
          if (index === null) unresolved = true;
          else keyParameters.push(index);
        } else {
          unresolved = true;
        }
      }
    }
    ts.forEachChild(node, (child) => walk(child, nextHide));
  }

  if (fn.body) walk(fn.body, false);
  return { names, keyParameters, unresolved };
}

function addUnresolved(
  unresolved: string[],
  filePath: string,
  sf: ts.SourceFile,
  node: ts.Node,
): void {
  unresolved.push(`${filePath}:${lineOf(sf, node)}: ${snippet(sf, node)}`);
}

function scanSourceText(filePath: string, text: string): ScanResult {
  const sf = parseSource(filePath, text);
  const names = new Set<string>();
  const sites = new Map<string, string>();
  const unresolved: string[] = [];

  function addName(name: string, node: ts.Node): void {
    names.add(name);
    if (!sites.has(name)) sites.set(name, `${filePath}:${lineOf(sf, node)}`);
  }

  function collectBindingNames(pattern: ts.BindingPattern, node: ts.Node): void {
    for (const element of pattern.elements) {
      if (ts.isOmittedExpression(element)) continue;
      // Rest copies the remaining environment through. It is not a named key.
      // Names pulled out beside it are still recorded.
      if (element.dotDotDotToken) continue;
      if (element.propertyName) {
        if (ts.isIdentifier(element.propertyName)) addName(element.propertyName.text, element);
        else if (ts.isStringLiteral(element.propertyName)) addName(element.propertyName.text, element);
        else addUnresolved(unresolved, filePath, sf, element);
        continue;
      }
      if (ts.isIdentifier(element.name)) addName(element.name.text, element);
      else addUnresolved(unresolved, filePath, sf, element);
    }
    void node;
  }

  function traceFunction(
    fn: ts.FunctionLikeDeclaration,
    paramIndex: number,
    call: ts.CallExpression | null,
  ): void {
    const param = fn.parameters[paramIndex];
    if (!param || !ts.isIdentifier(param.name) || !fn.body) {
      addUnresolved(unresolved, filePath, sf, call ?? fn);
      return;
    }
    const read = readsOfEnvParameter(fn, param.name.text);
    for (const name of read.names) addName(name, call ?? fn);
    if (read.unresolved) addUnresolved(unresolved, filePath, sf, fn);
    if (call) {
      for (const index of read.keyParameters) {
        const arg = call.arguments[index];
        const textValue = arg ? stringLiteralText(arg) : null;
        if (textValue === null) addUnresolved(unresolved, filePath, sf, call);
        else addName(textValue, call);
      }
    }
  }

  function traceCallsPassing(fn: ts.FunctionLikeDeclaration, paramName: string): void {
    function walk(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const envIndex = node.arguments.findIndex(
          (arg) => ts.isIdentifier(unwrap(arg)) && (unwrap(arg) as ts.Identifier).text === paramName,
        );
        if (envIndex >= 0 && ts.isIdentifier(node.expression)) {
          const callee = findFunction(node.expression.text, sf);
          if (!callee) addUnresolved(unresolved, filePath, sf, node);
          else traceFunction(callee, envIndex, node);
        }
      }
      ts.forEachChild(node, walk);
    }
    if (fn.body) walk(fn.body);
  }

  function declarationInScope(scope: ts.Node, name: string, at: ts.Node): ts.Node | null {
    if (isFunctionLike(scope)) {
      for (const param of scope.parameters) {
        if (declaresName(param.name, name)) return param;
      }
    }
    const statements =
      ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope)
        ? scope.statements
        : null;
    if (!statements) return null;
    let found: ts.Node | null = null;
    for (const stmt of statements) {
      if (stmt.getStart() >= at.getStart()) break;
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) found = decl;
        if (ts.isObjectBindingPattern(decl.name)) {
          for (const element of decl.name.elements) {
            if (ts.isOmittedExpression(element) || element.dotDotDotToken) continue;
            if (ts.isIdentifier(element.name) && element.name.text === name) found = element;
          }
        }
      }
    }
    return found;
  }

  function envDeclaration(id: ts.Identifier): ts.Node | null {
    let current: ts.Node | undefined = id.parent;
    while (current) {
      const found = declarationInScope(current, id.text, id);
      if (found) return found;
      current = current.parent;
    }
    return null;
  }

  function isEnvBinding(node: ts.Node): boolean {
    if (ts.isParameter(node)) {
      return node.initializer !== undefined && isEnvObjectExpr(node.initializer);
    }
    if (ts.isVariableDeclaration(node)) {
      return (
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        isEnvObjectExpr(node.initializer)
      );
    }
    if (ts.isBindingElement(node)) return bindingIsProcessEnv(node);
    return false;
  }

  function resolvesToEnvBinding(id: ts.Identifier): boolean {
    if (isBindingIdentifier(id)) return false;
    const decl = envDeclaration(id);
    return decl !== null && isEnvBinding(decl);
  }

  function indexIsCallerSupplied(envExpr: ts.Expression, index: ts.Expression): boolean {
    const envId = unwrap(envExpr);
    const indexId = unwrap(index);
    if (!ts.isIdentifier(envId) || !ts.isIdentifier(indexId)) return false;
    const decl = envDeclaration(envId);
    if (!decl || !ts.isParameter(decl)) return false;
    const fn = decl.parent;
    if (!isFunctionLike(fn)) return false;
    return parameterIndex(fn, indexId.text) !== null;
  }

  function accountEnv(envExpr: ts.Expression): void {
    const parent = outerParent(envExpr);
    if (!parent) {
      addUnresolved(unresolved, filePath, sf, envExpr);
      return;
    }
    if (
      ts.isPropertyAccessExpression(parent) &&
      sameExpr(parent.expression, envExpr) &&
      ts.isIdentifier(parent.name)
    ) {
      addName(parent.name.text, parent);
      return;
    }
    if (ts.isElementAccessExpression(parent) && sameExpr(parent.expression, envExpr)) {
      if (!parent.argumentExpression) {
        addUnresolved(unresolved, filePath, sf, parent);
      } else {
        const values = resolveStrings(parent.argumentExpression, sf, new Set());
        if (values && values.length > 0) {
          for (const value of values) addName(value, parent);
        } else if (!indexIsCallerSupplied(envExpr, parent.argumentExpression)) {
          addUnresolved(unresolved, filePath, sf, parent);
        }
      }
      return;
    }
    if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer &&
      sameExpr(parent.initializer, envExpr)
    ) {
      if (ts.isObjectBindingPattern(parent.name)) {
        collectBindingNames(parent.name, parent);
        return;
      }
      if (ts.isIdentifier(parent.name)) return;
      addUnresolved(unresolved, filePath, sf, parent);
      return;
    }
    if (ts.isParameter(parent) && parent.initializer && sameExpr(parent.initializer, envExpr)) {
      const fn = parent.parent;
      if (isFunctionLike(fn) && ts.isIdentifier(parent.name)) {
        const index = fn.parameters.indexOf(parent);
        traceFunction(fn, index, null);
        traceCallsPassing(fn, parent.name.text);
      } else {
        addUnresolved(unresolved, filePath, sf, parent);
      }
      return;
    }
    if (
      ts.isCallExpression(parent) &&
      parent.arguments.some((arg) => sameExpr(arg, envExpr))
    ) {
      if (ts.isIdentifier(parent.expression)) {
        const callee = findFunction(parent.expression.text, sf);
        const index = parent.arguments.findIndex((arg) => sameExpr(arg, envExpr));
        if (!callee) addUnresolved(unresolved, filePath, sf, parent);
        else traceFunction(callee, index, parent);
      } else {
        addUnresolved(unresolved, filePath, sf, parent);
      }
      return;
    }
    if (ts.isBindingElement(parent) && parent.initializer && sameExpr(parent.initializer, envExpr)) {
      addUnresolved(unresolved, filePath, sf, parent);
      return;
    }
    addUnresolved(unresolved, filePath, sf, envExpr);
  }

  function accountProcessDestructure(decl: ts.VariableDeclaration): void {
    if (!ts.isObjectBindingPattern(decl.name)) {
      addUnresolved(unresolved, filePath, sf, decl);
      return;
    }
    for (const element of decl.name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      if (element.dotDotDotToken) {
        addUnresolved(unresolved, filePath, sf, element);
        continue;
      }
      const prop = bindingPropertyName(element);
      if (prop === null) {
        addUnresolved(unresolved, filePath, sf, element);
        continue;
      }
      if (prop === "env") {
        if (ts.isObjectBindingPattern(element.name)) collectBindingNames(element.name, element);
        else if (!ts.isIdentifier(element.name)) addUnresolved(unresolved, filePath, sf, element);
        continue;
      }
      if (PROCESS_MEMBERS.has(prop)) continue;
      addUnresolved(unresolved, filePath, sf, element);
    }
  }

  function accountProcess(expr: ts.Expression): void {
    const parent = outerParent(expr);
    if (!parent) {
      addUnresolved(unresolved, filePath, sf, expr);
      return;
    }
    // `typeof process` is a value-level TypeOfExpression. A type-position
    // `typeof process` is a TypeQueryNode. Neither reads an env name.
    if (ts.isTypeOfExpression(parent) || ts.isTypeQueryNode(parent)) return;
    if (ts.isPropertyAccessExpression(parent) && sameExpr(parent.expression, expr)) {
      if (parent.name.text === "env") {
        accountEnv(parent);
        return;
      }
      if (PROCESS_MEMBERS.has(parent.name.text)) return;
      addUnresolved(unresolved, filePath, sf, parent);
      return;
    }
    if (ts.isElementAccessExpression(parent) && sameExpr(parent.expression, expr)) {
      const key = literalKey(parent.argumentExpression);
      if (key === "env") {
        accountEnv(parent);
        return;
      }
      if (key && PROCESS_MEMBERS.has(key)) return;
      addUnresolved(unresolved, filePath, sf, parent);
      return;
    }
    if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer &&
      sameExpr(parent.initializer, expr) &&
      ts.isObjectBindingPattern(parent.name)
    ) {
      accountProcessDestructure(parent);
      return;
    }
    addUnresolved(unresolved, filePath, sf, parent);
  }

  function isPropertyName(node: ts.Identifier): boolean {
    const parent = node.parent;
    if (!parent) return false;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
    if (ts.isBindingElement(parent) && parent.propertyName === node) return true;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
    return false;
  }

  function visit(node: ts.Node): void {
    if (ts.isExpression(node) && isProcessObjectExpr(node)) {
      accountProcess(node);
    } else if (
      ts.isIdentifier(node) &&
      !isPropertyName(node) &&
      resolvesToEnvBinding(node)
    ) {
      accountEnv(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { names: [...names].sort(), unresolved, sites };
}

function isRuntimeSource(name: string): boolean {
  return SOURCE_EXT.test(name) && !TEST_FILE.test(name);
}

function walkRuntimeFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules" || entry.name === ".next") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkRuntimeFiles(full, out);
    else if (entry.isFile() && isRuntimeSource(entry.name)) out.push(full);
  }
}

function runtimeFilesForRoot(rootName: string): string[] {
  const full = path.join(repoRoot, rootName);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return isRuntimeSource(rootName) ? [full] : [];
  const files: string[] = [];
  walkRuntimeFiles(full, files);
  return files;
}

function directoryContainsSource(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && SOURCE_EXT.test(entry.name)) return true;
    }
  }
  return false;
}

/** Top-level directories and root files that contain source. */
function topLevelSourceRoots(): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    const full = path.join(repoRoot, entry.name);
    if (entry.isDirectory()) {
      if (directoryContainsSource(full)) found.push(entry.name);
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
      found.push(entry.name);
    }
  }
  return found.sort();
}

function classifiedPaths(): Set<string> {
  return new Set([
    ...INCLUDE_ROOTS.map((root) => root.path),
    ...EXCLUDE_ROOTS.map((root) => root.path),
  ]);
}

const scanCache = new Map<string, ScanResult>();

function scanRoot(rootName: string): ScanResult {
  const cached = scanCache.get(rootName);
  if (cached) return cached;
  const names = new Set<string>();
  const unresolved: string[] = [];
  const sites = new Map<string, string>();
  for (const file of runtimeFilesForRoot(rootName)) {
    const rel = path.relative(repoRoot, file);
    const result = scanSourceText(rel, fs.readFileSync(file, "utf8"));
    for (const name of result.names) {
      names.add(name);
      if (!sites.has(name) && result.sites.has(name)) {
        sites.set(name, result.sites.get(name)!);
      }
    }
    unresolved.push(...result.unresolved);
  }
  const result = { names: [...names].sort(), unresolved, sites };
  scanCache.set(rootName, result);
  return result;
}

function documentedEnvNames(exampleSource: string): Set<string> {
  const names = new Set<string>();
  for (const line of exampleSource.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) names.add(match[1]);
  }
  return names;
}

function readEnvExample(): string {
  return fs.readFileSync(path.join(repoRoot, ENV_EXAMPLE_REL), "utf8");
}

describe("runtime env names are documented in .env.example (RA-7477)", () => {
  it("reads dot, quoted bracket, optional, and destructure access", () => {
    const result = scanSourceText(
      "snippet.ts",
      [
        "process.env.FOO",
        "process.env['BAR']",
        'process.env["BAZ"]',
        "process.env?.QUX",
        "const { NESTED } = process.env",
        "const { RENAMED: alias } = process.env",
        "// process.env.NEXT_PUBLIC_*",
      ].join("\n"),
    );
    expect(result.unresolved).toEqual([]);
    expect(result.names).toEqual(["BAR", "BAZ", "FOO", "NESTED", "QUX", "RENAMED"]);
  });

  it("resolves a for-of over string literals and a filter over a const array", () => {
    const result = scanSourceText(
      "snippet.ts",
      `
        const REQUIRED = ["ONE", "TWO"] as const;
        for (const key of ["THREE"]) {
          void process.env[key];
        }
        REQUIRED.filter((name) => process.env[name]);
      `,
    );
    expect(result.unresolved).toEqual([]);
    expect(result.names).toEqual(["ONE", "THREE", "TWO"]);
  });

  it("resolves optional process, globalThis, template keys, and destructured env", () => {
    const result = scanSourceText(
      "lib/shapes.ts",
      [
        "process?.env.OPT_PROCESS_VAR",
        "const { env } = process; void env.DESTRUCT_VAR",
        "const { env: alias } = process; const { RENAMED } = alias",
        "globalThis.process.env.GLOBAL_VAR",
        "global.process.env.GLOBAL_ALIAS",
        "process[`env`].TEMPLATE_VAR",
        'process["env"].STRING_KEY',
      ].join("\n"),
    );
    expect(result.unresolved).toEqual([]);
    expect(result.names).toEqual([
      "DESTRUCT_VAR",
      "GLOBAL_ALIAS",
      "GLOBAL_VAR",
      "OPT_PROCESS_VAR",
      "RENAMED",
      "STRING_KEY",
      "TEMPLATE_VAR",
    ]);
  });

  it("fails closed on a process alias and ignores an unrelated env binding", () => {
    const alias = scanSourceText(
      "lib/alias.ts",
      "const p = process; void p.env.ALIAS_VAR",
    );
    expect(alias.names).toEqual([]);
    expect(alias.unresolved.join("\n")).toMatch(/lib\/alias\.ts:\d+:/);
    expect(alias.unresolved.join("\n")).toMatch(/const p = process/);

    const unrelated = scanSourceText(
      "lib/unrelated.ts",
      [
        "const env = { HOST: 'local' };",
        "void env.HOST;",
        "const { HOST } = env;",
        "function read(process: { env: { SHADOW: string } }) { return process.env.SHADOW; }",
      ].join("\n"),
    );
    expect(unrelated.names).toEqual([]);
    expect(unrelated.unresolved).toEqual([]);
  });

  it("ignores the process members the scanned tree actually calls", () => {
    const result = scanSourceText(
      "lib/members.ts",
      [
        "process.cwd()",
        "process.exit(1)",
        "process.execPath",
        "process.exitCode = 0",
        "typeof process !== 'undefined' && process.env.AFTER_TYPEOF",
      ].join("\n"),
    );
    expect(result.unresolved).toEqual([]);
    expect(result.names).toEqual(["AFTER_TYPEOF"]);
  });

  it("treats cjs, jsx, mts, and cts as source, including their tests", () => {
    for (const name of ["read.cjs", "view.jsx", "mod.mts", "mod.cts"]) {
      expect(SOURCE_EXT.test(name), name).toBe(true);
      expect(TEST_FILE.test(name), name).toBe(false);
    }
    expect(TEST_FILE.test("read.test.cjs")).toBe(true);
    expect(TEST_FILE.test("read.spec.mts")).toBe(true);
    expect(SOURCE_EXT.test("notes.md")).toBe(false);
  });

  it("fails closed on a non-literal index it cannot resolve", () => {
    const result = scanSourceText(
      "lib/unresolved.ts",
      "export function read(variable: string) { return process.env[variable]; }",
    );
    expect(result.names).toEqual([]);
    expect(result.unresolved.join("\n")).toMatch(/lib\/unresolved\.ts:\d+:/);
    expect(result.unresolved.join("\n")).toMatch(/process\.env\[variable\]/);
  });

  it("traces a parameter that defaults to process.env", () => {
    const result = scanSourceText(
      "snippet.ts",
      `
        export function readToken(env: NodeJS.ProcessEnv = process.env) {
          return env.APIFY_API_TOKEN;
        }
      `,
    );
    expect(result.unresolved).toEqual([]);
    expect(result.names).toEqual(["APIFY_API_TOKEN"]);
  });

  it("allow-lists platform names and leaves application names to .env.example", () => {
    for (const name of [
      "NODE_ENV",
      "NEXT_RUNTIME",
      "CI",
      "PORT",
      "TZ",
      "VERCEL",
      "VERCEL_ENV",
      "VERCEL_URL",
      "VERCEL_GIT_COMMIT_SHA",
      "npm_package_version",
    ]) {
      expect(isBuiltinEnvName(name), name).toBe(true);
    }
    expect(isBuiltinEnvName("DATABASE_URL")).toBe(false);
    expect(isBuiltinEnvName("GIT_SHA")).toBe(false);
    expect(isBuiltinEnvName("DOCKER_BUILD")).toBe(false);
    expect(isBuiltinEnvName("ALLOWED_APP_HOSTS")).toBe(false);
  });

  it("includes the production roots and states a reason for every exclusion", () => {
    const included = new Set(INCLUDE_ROOTS.map((root) => root.path));
    for (const root of ["app", "lib", "components", "hooks", "proxy.ts", "instrumentation.ts"]) {
      expect(included.has(root), root).toBe(true);
    }
    for (const root of topLevelSourceRoots().filter((name) => name.startsWith("next.config."))) {
      expect(included.has(root), root).toBe(true);
    }
    for (const root of [...INCLUDE_ROOTS, ...EXCLUDE_ROOTS]) {
      expect(root.reason.trim().length, root.path).toBeGreaterThan(10);
    }
    const overlap = INCLUDE_ROOTS.map((root) => root.path).filter((root) =>
      EXCLUDE_ROOTS.some((excluded) => excluded.path === root),
    );
    expect(overlap).toEqual([]);
    for (const root of INCLUDE_ROOTS) {
      expect(fs.existsSync(path.join(repoRoot, root.path)), root.path).toBe(true);
    }
  });

  it("fails when a top-level source root is neither included nor excluded", () => {
    const known = classifiedPaths();
    const unclassified = topLevelSourceRoots().filter((root) => !known.has(root));
    const described = unclassified.map((root) => {
      const found = scanRoot(root);
      return found.names.length > 0 ? `${root} (reads ${found.names.join(", ")})` : root;
    });
    expect(
      described,
      `These top-level source roots are neither included nor excluded. Add each to INCLUDE_ROOTS (and document its env names) or EXCLUDE_ROOTS with a reason:\n${described
        .map((root) => `  ${root}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("fails closed when a scanned file reads process.env in a shape that has no name", () => {
    const unresolved = INCLUDE_ROOTS.flatMap((root) => scanRoot(root.path).unresolved);
    expect(
      unresolved,
      `These process references have no resolvable env name. Name the variable literally, or extend the scanner to resolve the shape:\n${unresolved
        .map((line) => `  ${line}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("every runtime process.env name is in .env.example or the built-in allow-list", () => {
    const documented = documentedEnvNames(readEnvExample());
    const sites = new Map<string, string>();
    for (const root of INCLUDE_ROOTS) {
      const found = scanRoot(root.path);
      for (const name of found.names) {
        if (!sites.has(name) && found.sites.has(name)) {
          sites.set(name, found.sites.get(name)!);
        }
      }
    }
    const missing = [...sites.keys()]
      .filter((name) => !documented.has(name) && !isBuiltinEnvName(name))
      .sort();
    expect(
      missing,
      `These names are read in scanned runtime source but absent from .env.example:\n${missing
        .map((name) => `  ${sites.get(name)}: ${name}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
