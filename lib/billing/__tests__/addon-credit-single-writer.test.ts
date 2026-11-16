/**
 * RA-8402 — one owner for report-pack fulfilment.
 *
 * RA-6930 made `fulfillAddonFromSession` (lib/billing/fulfill-one-time.ts) the
 * owner: it writes the AddonPurchase marker row and the `addonReports`
 * increment in ONE transaction. A second, older copy
 * (app/api/addons/check-pending) wrote the marker first and the credits second
 * with no transaction, so a failed second write left a paid customer holding 0
 * reports while every other path saw the marker and skipped.
 *
 * This test walks the source tree with the TypeScript parser (so comments that
 * describe the rule do not count) and fails when any file other than the owner
 * creates an AddonPurchase row or increments `addonReports`. Untracked files
 * are scanned too, so a newly written second writer fails before it is staged.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const OWNER = "lib/billing/fulfill-one-time.ts";

/**
 * Writers that are NOT report-pack fulfilment, each with its reason and the
 * exact writes it is allowed. Pinned per write, not per file: a marker write
 * or a second increment added to an allowed file still fails.
 */
const ALLOWED: Record<string, { reason: string; writes: string[] }> = {
  "app/api/webhooks/stripe/route.ts": {
    reason: "subscription signup bonus, granted once under the signupBonusApplied guard; not a pack purchase",
    writes: ["addonReports increment"],
  },
  "scripts/upgrade-user-package.ts": {
    reason: "operator script granting the same one-time signup bonus under signupBonusApplied; not a pack purchase",
    writes: ["addonReports increment"],
  },
};

/** The kind of a hit, without its file and line: "addonReports increment". */
const kindOf = (hit: string) => hit.slice(hit.indexOf(" ") + 1);

const MARKER_WRITES = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

function sourceFiles(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "*.ts", "*.tsx", "*.mts", "*.mjs", "*.js"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !/(^|\/)(__tests__|node_modules)\//.test(f) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
}

function propName(name: ts.PropertyName | ts.MemberName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name)) return name.text;
  return undefined;
}

/** Returns a description of each credit or marker write in `text`. */
function findWrites(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    // `addonReports: { increment: n }`: an increment is what grants report credit
    if (
      ts.isPropertyAssignment(node) &&
      propName(node.name) === "addonReports" &&
      ts.isObjectLiteralExpression(node.initializer) &&
      node.initializer.properties.some((p) => p.name && propName(p.name) === "increment")
    ) {
      hits.push(`${file}:${line(node)} addonReports increment`);
    }
    // `<client>.addonPurchase.create(...)` and siblings
    if (
      ts.isPropertyAccessExpression(node) &&
      MARKER_WRITES.has(node.name.text) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "addonPurchase"
    ) {
      hits.push(`${file}:${line(node)} addonPurchase.${node.name.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("add-on credits and the purchase marker have exactly one writer (RA-8402)", () => {
  it("detects a planted second writer and ignores comments (positive control)", () => {
    const planted = [
      "// addonReports: { increment: 8 } in a comment is not a write",
      "/* prisma.addonPurchase.create({}) */",
      "await prisma.addonPurchase.create({ data: {} });",
      "await prisma.user.update({ data: { addonReports: {",
      "  increment: n } } });",
    ].join("\n");
    expect(findWrites("planted.ts", planted)).toEqual([
      "planted.ts:3 addonPurchase.create",
      "planted.ts:4 addonReports increment",
    ]);
  });

  it("the owner is still the writer", () => {
    const hits = findWrites(OWNER, readFileSync(join(ROOT, OWNER), "utf8"));
    expect(hits.some((h) => h.includes("addonPurchase.create"))).toBe(true);
    expect(hits.some((h) => h.includes("addonReports increment"))).toBe(true);
  });

  it("no other source file writes them", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (file === OWNER) continue;
      let text: string;
      try {
        text = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue; // deleted in the working tree but still in the index
      }
      if (!text.includes("addonReports") && !text.includes("addonPurchase")) continue;
      // An allowed file may carry its pinned writes once each; anything beyond them is an offender.
      const remaining = [...(ALLOWED[file]?.writes ?? [])];
      for (const hit of findWrites(file, text)) {
        const i = remaining.indexOf(kindOf(hit));
        if (i >= 0) remaining.splice(i, 1);
        else offenders.push(hit);
      }
    }
    expect(offenders, "only lib/billing/fulfill-one-time.ts may write these; call fulfillAddonFromSession").toEqual([]);
  });

  it("every allow-listed file makes exactly its pinned writes, so the list cannot hide a stale entry", () => {
    for (const [file, { reason, writes }] of Object.entries(ALLOWED)) {
      expect(reason).toMatch(/\w/);
      const kinds = findWrites(file, readFileSync(join(ROOT, file), "utf8")).map(kindOf);
      expect(kinds, `${file} writes differ from its allow-list entry`).toEqual(writes);
    }
  });
});
