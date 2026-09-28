import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

/**
 * RA-7477: every env name read on a runtime path must appear in .env.example.
 *
 * Design B. Include roots are explicit, and so is every excluded root, with
 * a reason. A new top-level directory or root file that contains
 * .ts/.tsx/.js/.mjs source and is on neither list fails this test, so a
 * hand-kept include list cannot hide a new folder.
 *
 * Reads .env.example only — never a live env file. Tests are not scanned.
 * A process.env read whose name cannot be resolved fails the test and names
 * the file. It is not skipped.
 */

const repoRoot = path.resolve(__dirname, "../..");

/** The only env file this guard is allowed to open. */
const ENV_EXAMPLE_REL = ".env.example";

const SOURCE_EXT = /\.(ts|tsx|js|mjs)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs)$/;

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

type ScanResult = { names: string[]; unresolved: string[] };

function isBuiltinEnvName(name: string): boolean {
  if ((BUILTIN_ENV_NAMES as readonly string[]).includes(name)) return true;
  return BUILTIN_ENV_PREFIXES.some((prefix) =>
    prefix.endsWith("_")
      ? name.startsWith(prefix)
      : name === prefix || name.startsWith(`${prefix}_`),
  );
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
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

function isProcessEnv(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  if (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "env" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    !node.questionDotToken
  ) {
    return true;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.argumentExpression &&
    ts.isStringLiteral(node.argumentExpression) &&
    node.argumentExpression.text === "env"
  ) {
    return true;
  }
  return false;
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
  const unresolved: string[] = [];

  function addResolved(values: string[] | null, node: ts.Node): void {
    if (!values || values.length === 0) {
      addUnresolved(unresolved, filePath, sf, node);
      return;
    }
    for (const value of values) names.add(value);
  }

  function collectBindingNames(pattern: ts.BindingPattern, node: ts.Node): void {
    for (const element of pattern.elements) {
      if (ts.isOmittedExpression(element)) continue;
      if (element.dotDotDotToken) continue;
      if (element.propertyName) {
        if (ts.isIdentifier(element.propertyName)) names.add(element.propertyName.text);
        else if (ts.isStringLiteral(element.propertyName)) names.add(element.propertyName.text);
        else addUnresolved(unresolved, filePath, sf, element);
        continue;
      }
      if (ts.isIdentifier(element.name)) names.add(element.name.text);
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
    for (const name of read.names) names.add(name);
    if (read.unresolved) addUnresolved(unresolved, filePath, sf, fn);
    if (call) {
      for (const index of read.keyParameters) {
        const arg = call.arguments[index];
        const textValue = arg ? stringLiteralText(arg) : null;
        if (textValue === null) addUnresolved(unresolved, filePath, sf, call);
        else names.add(textValue);
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

  function visit(node: ts.Node): void {
    if (isProcessEnv(node as ts.Expression)) {
      const parent = node.parent;
      if (
        parent &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        ts.isIdentifier(parent.name)
      ) {
        names.add(parent.name.text);
      } else if (
        parent &&
        ts.isElementAccessExpression(parent) &&
        parent.expression === node
      ) {
        if (!parent.argumentExpression) addUnresolved(unresolved, filePath, sf, parent);
        else addResolved(resolveStrings(parent.argumentExpression, sf, new Set()), parent);
      } else if (
        parent &&
        ts.isBindingElement(parent) &&
        parent.initializer === node
      ) {
        addUnresolved(unresolved, filePath, sf, parent);
      } else if (
        parent &&
        ts.isVariableDeclaration(parent) &&
        parent.initializer === node &&
        ts.isObjectBindingPattern(parent.name)
      ) {
        collectBindingNames(parent.name, parent);
      } else if (parent && ts.isParameter(parent) && parent.initializer === node) {
        const fn = parent.parent;
        if (isFunctionLike(fn) && ts.isIdentifier(parent.name)) {
          const index = fn.parameters.indexOf(parent);
          traceFunction(fn, index, null);
          traceCallsPassing(fn, parent.name.text);
        } else {
          addUnresolved(unresolved, filePath, sf, parent);
        }
      } else if (parent && ts.isCallExpression(parent) && parent.arguments.some((arg) => arg === node)) {
        if (ts.isIdentifier(parent.expression)) {
          const callee = findFunction(parent.expression.text, sf);
          const index = parent.arguments.findIndex((arg) => arg === node);
          if (!callee) addUnresolved(unresolved, filePath, sf, parent);
          else traceFunction(callee, index, parent);
        } else {
          addUnresolved(unresolved, filePath, sf, parent);
        }
      } else {
        addUnresolved(unresolved, filePath, sf, node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { names: [...names].sort(), unresolved };
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

function scanRoot(rootName: string): ScanResult {
  const names = new Set<string>();
  const unresolved: string[] = [];
  for (const file of runtimeFilesForRoot(rootName)) {
    const rel = path.relative(repoRoot, file);
    const result = scanSourceText(rel, fs.readFileSync(file, "utf8"));
    for (const name of result.names) names.add(name);
    unresolved.push(...result.unresolved);
  }
  return { names: [...names].sort(), unresolved };
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
      `These process.env reads have no resolvable name. Name the variable literally, or extend the scanner to resolve the shape:\n${unresolved
        .map((line) => `  ${line}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("every runtime process.env name is in .env.example or the built-in allow-list", () => {
    const documented = documentedEnvNames(readEnvExample());
    const missing = [
      ...new Set(INCLUDE_ROOTS.flatMap((root) => scanRoot(root.path).names)),
    ]
      .filter((name) => !documented.has(name) && !isBuiltinEnvName(name))
      .sort();
    expect(
      missing,
      `These names are read in scanned runtime source but absent from .env.example:\n${missing
        .map((name) => `  ${name}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
