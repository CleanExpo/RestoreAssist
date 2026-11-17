/**
 * RA-8438 — discovering guard. The status that follows a signature has one
 * owner (lib/authority-forms/form-status.ts). Any route under app/api that
 * writes PARTIALLY_SIGNED or COMPLETED to an AuthorityFormInstance by hand is
 * a second copy of the rule, and this test names it.
 *
 * Discovery, not a fixed list: every non-test .ts file under app/api is read.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const API = join(ROOT, "app", "api");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const WRITES_INSTANCE = /authorityFormInstance\s*\.\s*(update|updateMany|upsert)\s*\(/;
const DERIVED_STATUS_LITERAL = /status\s*:\s*["'](PARTIALLY_SIGNED|COMPLETED)["']/;

export function findHandWrittenStatusWriters(files: string[]): string[] {
  return files
    .filter((f) => {
      const src = readFileSync(f, "utf8");
      return WRITES_INSTANCE.test(src) && DERIVED_STATUS_LITERAL.test(src);
    })
    .map((f) => relative(ROOT, f));
}

describe("authority-form status writers (RA-8438)", () => {
  it("scans a non-trivial set of route files (positive control on discovery)", () => {
    const files = walk(API);
    expect(files.length).toBeGreaterThan(100);
    expect(
      files.some((f) => f.endsWith(join("sign", "[token]", "route.ts"))),
    ).toBe(true);
  });

  it("the detector fires on a hand-written status write", () => {
    const src = `await prisma.authorityFormInstance.update({ where: { id }, data: { status: "PARTIALLY_SIGNED" } });`;
    expect(WRITES_INSTANCE.test(src) && DERIVED_STATUS_LITERAL.test(src)).toBe(
      true,
    );
  });

  it("no app/api file writes a signature-derived status outside the owner", () => {
    expect(findHandWrittenStatusWriters(walk(API))).toEqual([]);
  });
});
