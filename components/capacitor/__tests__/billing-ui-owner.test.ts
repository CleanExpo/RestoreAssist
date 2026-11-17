import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RA-8437 — every screen that can start a purchase must hide it in the iOS
 * shell (App Review 3.1.1, RA-1842 Path B).
 *
 * The server refuses the shell on every route that imports
 * lib/ios-billing-guard. This test discovers those routes, finds every
 * non-API source file that names one of them in a string literal, and
 * requires that file, or EVERY component that renders it (walking importers
 * up to a page), to use the single client owner: useHideBilling() or
 * <BillingGate>. Nothing here is a fixed list: a new guarded route or a new
 * purchase button is picked up automatically.
 *
 * Before this test, FloorPlanUnderlayLoader showed a priced "Add Floor Plan
 * Underlay" button in the shell because nobody copied the rule into it.
 */

const repoRoot = process.cwd();
const SOURCE_ROOTS = ["app", "components", "hooks", "lib"];
const OWNER_USE = /\buseHideBilling\(\)|<BillingGate\b/u;

type SourceMap = Map<string, string>;

function walk(dir: string, acc: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(rel, acc);
    } else if (/\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

/** URL of every API route whose handler imports the server iOS guard. */
export function guardedUrls(sources: SourceMap): string[] {
  const urls: string[] = [];
  for (const [file, src] of sources) {
    const m = /^app\/api\/(.+)\/route\.ts$/u.exec(file);
    if (m && /from\s+["']@\/lib\/ios-billing-guard["']/u.test(src)) {
      urls.push(`/api/${m[1]}`);
    }
  }
  return urls.sort();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|\\]/gu, "\\$&").replace(/\\?\[[^\]/]+\\?\]/gu, "[^/\"'`]+");
}

/** Drop comments so a documented path (often in backticks) is not a call. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[\s;{}(),])\/\/[^\n]*/gu, "$1");
}

function resolveImport(from: string, spec: string, sources: SourceMap): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const cand of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (sources.has(cand)) return cand;
  }
  return null;
}

/**
 * Pure detector. Returns each caller of a guarded URL that has a render path
 * (a chain of importers ending at a file nothing imports) with no owner use.
 */
export function findUngatedCallers(sources: SourceMap, urls: string[]): string[] {
  const importers = new Map<string, Set<string>>();
  const importRe = /(?:from\s+|import\(\s*)["']([^"']+)["']/gu;
  for (const [file, src] of sources) {
    if (file.startsWith("app/api/")) continue;
    for (const m of src.matchAll(importRe)) {
      const target = resolveImport(file, m[1], sources);
      if (!target || target === file) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target)!.add(file);
    }
  }

  const callRes = urls.map((u) => new RegExp(`["'\`]${escapeRe(u)}["'\`?]`, "u"));
  const memo = new Map<string, boolean>();
  const covered = (file: string, stack: Set<string>): boolean => {
    if (memo.has(file)) return memo.get(file)!;
    if (OWNER_USE.test(sources.get(file) ?? "")) return true;
    // A cycle with no owner on it proves nothing: fail closed.
    if (stack.has(file)) return false;
    const parents = [...(importers.get(file) ?? [])];
    stack.add(file);
    const ok = parents.length > 0 && parents.every((p) => covered(p, stack));
    stack.delete(file);
    memo.set(file, ok);
    return ok;
  };

  const ungated: string[] = [];
  for (const [file, src] of sources) {
    if (file.startsWith("app/api/")) continue;
    const code = stripComments(src);
    if (!callRes.some((re) => re.test(code))) continue;
    if (!covered(file, new Set())) ungated.push(file);
  }
  return ungated.sort();
}

function loadTree(): SourceMap {
  const sources: SourceMap = new Map();
  for (const root of SOURCE_ROOTS) {
    for (const file of walk(root)) {
      sources.set(file, readFileSync(join(repoRoot, file), "utf8"));
    }
  }
  return sources;
}

describe("detector (synthetic tree — proves it can fail)", () => {
  const url = "/api/addons/checkout";
  const route = `import { rejectIfIOSCapacitor } from "@/lib/ios-billing-guard";`;

  it("discovers guarded routes from the guard import", () => {
    const tree: SourceMap = new Map([
      ["app/api/addons/checkout/route.ts", route],
      ["app/api/other/route.ts", "export {}"],
    ]);
    expect(guardedUrls(tree)).toEqual([url]);
  });

  it("flags a caller nothing gates, and ignores a comment mention", () => {
    const tree: SourceMap = new Map([
      ["components/Buy.tsx", `fetch("/api/addons/checkout", { method: "POST" })`],
      ["components/Doc.tsx", `// POST /api/addons/checkout prices this`],
      ["lib/doc.ts", "/** `/api/addons/checkout` sells it */\n// see `/api/addons/checkout`\nexport {};"],
      ["app/x/page.tsx", `import Buy from "@/components/Buy";`],
    ]);
    expect(findUngatedCallers(tree, [url])).toEqual(["components/Buy.tsx"]);
  });

  it("accepts the owner in the file or on every render path", () => {
    const tree: SourceMap = new Map([
      ["components/A.tsx", `const h = useHideBilling(); fetch("/api/addons/checkout")`],
      ["components/B.tsx", `url: "/api/addons/checkout"`],
      ["components/Mid.tsx", `import B from "./B";`],
      ["app/y/page.tsx", `import Mid from "@/components/Mid"; <BillingGate><Mid/></BillingGate>`],
    ]);
    expect(findUngatedCallers(tree, [url])).toEqual([]);
  });

  it("flags a caller when only one of two render paths is gated", () => {
    const tree: SourceMap = new Map([
      ["components/B.tsx", `fetch(\`/api/addons/checkout?x=1\`)`],
      ["app/gated/page.tsx", `import B from "@/components/B"; useHideBilling()`],
      ["app/open/page.tsx", `import B from "@/components/B";`],
    ]);
    expect(findUngatedCallers(tree, [url])).toEqual(["components/B.tsx"]);
  });
});

describe("real tree", () => {
  const tree = loadTree();
  const urls = guardedUrls(tree);

  it("finds the guarded billing routes (the scan did work)", () => {
    expect(urls).toEqual(
      expect.arrayContaining([
        "/api/addons/checkout",
        "/api/create-checkout-session",
        "/api/subscription/portal",
      ]),
    );
  });

  it("every caller of a guarded endpoint is hidden in the iOS shell", () => {
    expect(
      findUngatedCallers(tree, urls),
      "These files can start a purchase the server refuses in the iOS shell, " +
        "and no render path hides them. Call useHideBilling() from " +
        "@/components/capacitor/use-hide-billing (or wrap in <BillingGate>).",
    ).toEqual([]);
  });
});
