/**
 * RA-8418 — every route that runs the BotID server check must be on the
 * browser protect list, or the browser never sends the proof headers and the
 * check refuses real people.
 *
 * The test discovers the routes itself (no fixed file list): it walks app/api
 * for route.ts files that call `verifyBotId(`, works out which exported
 * handler makes the call, and asks the shared list whether the browser would
 * protect that path and method, using the botid client's own matcher.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTID_PROTECTED_ROUTES,
  botIdPathPattern,
  isBotIdProtected,
  type BotIdProtectedRoute,
} from "@/lib/auth/botid-routes";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const API_DIR = join(REPO_ROOT, "app", "api");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

interface BotCheckedHandler {
  file: string;
  urlPath: string;
  method: string;
}

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkRouteFiles(full));
    else if (name === "route.ts" || name === "route.tsx") out.push(full);
  }
  return out;
}

/** app/api/portal/[token]/evidence/route.ts -> /api/portal/sample-segment/evidence */
function routeFileToUrlPath(file: string, appDir: string): string {
  const segments = relative(appDir, file).split(sep).slice(0, -1);
  return (
    "/" +
    segments
      .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
      .map((s) => (s.startsWith("[") ? "sample-segment" : s))
      .join("/")
  );
}

/**
 * For each `verifyBotId(` call, find the top-level declaration that encloses
 * it. It must be an exported HTTP handler; anything else fails loudly so the
 * test is taught the new shape instead of guessing a method.
 */
function botCheckedMethods(source: string, file: string): string[] {
  const decls: { index: number; method: string | null }[] = [];
  const declRe =
    /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)/gm;
  for (let m = declRe.exec(source); m; m = declRe.exec(source)) {
    const name = m[1] ?? m[2];
    const exported = m[0].startsWith("export");
    const method =
      exported && (HTTP_METHODS as readonly string[]).includes(name)
        ? name
        : null;
    decls.push({ index: m.index, method });
  }
  const methods = new Set<string>();
  const callRe = /verifyBotId\(/g;
  for (let c = callRe.exec(source); c; c = callRe.exec(source)) {
    const enclosing = decls.filter((d) => d.index < c!.index).pop();
    if (!enclosing?.method) {
      throw new Error(
        `${file}: verifyBotId( is called outside an exported HTTP handler; ` +
          "update botid-routes.test.ts to resolve which method reaches it",
      );
    }
    methods.add(enclosing.method);
  }
  return [...methods];
}

function discoverBotCheckedHandlers(): BotCheckedHandler[] {
  const appDir = join(REPO_ROOT, "app");
  const handlers: BotCheckedHandler[] = [];
  for (const file of walkRouteFiles(API_DIR)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("verifyBotId(")) continue;
    const rel = relative(REPO_ROOT, file);
    for (const method of botCheckedMethods(source, rel)) {
      handlers.push({ file: rel, urlPath: routeFileToUrlPath(file, appDir), method });
    }
  }
  return handlers;
}

function unprotected(
  handlers: BotCheckedHandler[],
  routes: readonly BotIdProtectedRoute[],
): string[] {
  return handlers
    .filter((h) => !isBotIdProtected(h.urlPath, h.method, routes))
    .map((h) => `${h.method} ${h.urlPath} (${h.file})`);
}

describe("BotID protect list covers every bot-checked route (RA-8418)", () => {
  const handlers = discoverBotCheckedHandlers();

  it("discovers the bot-checked routes (guards against a vacuous pass)", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(6);
  });

  it("puts every route that calls verifyBotId( on the browser list", () => {
    expect(unprotected(handlers, BOTID_PROTECTED_ROUTES)).toEqual([]);
  });

  it("negative control: an unlisted bot-checked route is reported", () => {
    const planted: BotCheckedHandler = {
      file: "app/api/planted/[token]/route.ts",
      urlPath: "/api/planted/sample-segment",
      method: "POST",
    };
    expect(unprotected([planted], BOTID_PROTECTED_ROUTES)).toEqual([
      "POST /api/planted/sample-segment (app/api/planted/[token]/route.ts)",
    ]);
  });

  it("negative control: the wrong method is not protected", () => {
    expect(
      isBotIdProtected("/api/auth/register", "GET", BOTID_PROTECTED_ROUTES),
    ).toBe(false);
  });

  it("attributes the call to the enclosing handler, not every export", () => {
    const source = [
      "export async function GET() {",
      "  return ok();",
      "}",
      "export async function POST() {",
      "  const bot = await verifyBotId();",
      "}",
    ].join("\n");
    expect(botCheckedMethods(source, "x/route.ts")).toEqual(["POST"]);
  });

  it("fails loudly when the call sits in a non-handler helper", () => {
    const source = [
      "async function guard() {",
      "  return verifyBotId();",
      "}",
      "export async function POST() {}",
    ].join("\n");
    expect(() => botCheckedMethods(source, "x/route.ts")).toThrow(
      /outside an exported HTTP handler/,
    );
  });

  it("matches a wildcard segment the way the botid client does", () => {
    const pattern = botIdPathPattern("/api/portal/*/evidence");
    expect(pattern.test("/api/portal/abc123/evidence")).toBe(true);
    expect(pattern.test("/api/portal/abc123/evidence/extra")).toBe(false);
    expect(pattern.test("/api/portal/abc123/other")).toBe(false);
  });

  it("uses the same matcher source as the installed botid client", () => {
    // If botid changes how it matches paths, this copy must change with it.
    const matcher =
      '.replace(/[.?+^$[\\]\\\\(){}|-]/g,"\\\\$&").split("*").join(".*");return new RegExp(`^${e}$`)';
    for (const entry of ["index.mjs", join("core", "index.mjs")]) {
      const dist = readFileSync(
        join(REPO_ROOT, "node_modules", "botid", "dist", "client", entry),
        "utf8",
      );
      expect(dist).toContain(matcher);
    }
  });
});
