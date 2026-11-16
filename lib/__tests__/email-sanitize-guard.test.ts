/**
 * RA-8404 guard — an email address is an identity, not display text.
 *
 * `sanitizeString` strips tags and entity-encodes ' & < > ", so passing an
 * email through it stores an address nobody can log in with or receive mail
 * at. Email values go through `parseEmail` in lib/email-identity.ts instead.
 *
 * This reads every .ts/.tsx file under app/ and lib/ and fails when:
 *   - a file importing sanitizeString passes it an email-named value (multi-line), or
 *   - a `sanitizeFields(` call lists an email field, or
 *   - a file that imports sanitizeString passes an email-named string key to
 *     a local wrapper (e.g. profile's `field("businessEmail", 320)`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", "__tests__", ".next"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const SANITIZE_EMAIL_ARG = /sanitizeString\(\s*[^,()]*email/gi;
const SANITIZE_FIELDS_EMAIL = /sanitizeFields\([^)]*["'`]\w*email\w*["'`]/gis;
const WRAPPER_EMAIL_KEY = /\b\w+\(\s*["'`]\w*email\w*["'`]\s*,\s*\d+/gi;
const IMPORTS_SANITIZE_STRING = /import\s*\{[^}]*\bsanitizeString\b[^}]*\}\s*from/;

function findEmailSanitizeViolations(file: string, text: string): string[] {
  const hits: string[] = [];
  const at = (index: number) => `${file}:${text.slice(0, index).split("\n").length}`;
  for (const m of text.matchAll(SANITIZE_FIELDS_EMAIL)) hits.push(`${at(m.index!)} sanitizeFields email field`);
  // Only the encoder from lib/sanitize rewrites ' and &. A file-local helper
  // that shares the name (initial-entry's trim-to-null) does not.
  if (!IMPORTS_SANITIZE_STRING.test(text)) return hits;
  for (const m of text.matchAll(SANITIZE_EMAIL_ARG)) hits.push(`${at(m.index!)} sanitizeString(email)`);
  for (const m of text.matchAll(WRAPPER_EMAIL_KEY)) hits.push(`${at(m.index!)} wrapper(email key)`);
  return hits;
}

describe("RA-8404 email values never pass through sanitizeString", () => {
  it("the matcher fires on each known shape (positive control)", () => {
    const imp = 'import { sanitizeString } from "@/lib/sanitize";\n';
    expect(findEmailSanitizeViolations("a.ts", `${imp}const e = sanitizeString(body.email, 320);`)).toHaveLength(1);
    expect(findEmailSanitizeViolations("b.ts", `${imp}x: sanitizeString(\n  data.ownerManagementEmail,\n),`)).toHaveLength(1);
    // A file-local helper of the same name that does not encode is not the defect.
    expect(findEmailSanitizeViolations("f.ts", "const sanitizeString = (v) => v;\nsanitizeString(data.email);")).toHaveLength(0);
    expect(findEmailSanitizeViolations("c.ts", 'sanitizeFields(body, ["name", "email"])')).toHaveLength(1);
    expect(findEmailSanitizeViolations("d.ts", `${imp}const b = field("businessEmail", 320);`)).toHaveLength(1);
    expect(findEmailSanitizeViolations("e.ts", `${imp}const n = sanitizeString(body.name, 200);`)).toHaveLength(0);
  });

  it("no file under app/ or lib/ does it", () => {
    const violations = ["app", "lib"].flatMap((dir) =>
      sourceFiles(join(ROOT, dir)).flatMap((path) =>
        findEmailSanitizeViolations(relative(ROOT, path), readFileSync(path, "utf8")),
      ),
    );
    expect(violations).toEqual([]);
  });
});
