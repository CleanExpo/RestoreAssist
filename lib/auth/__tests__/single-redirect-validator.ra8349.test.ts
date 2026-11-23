/**
 * RA-8349: one owner for the same-origin redirect check.
 *
 * `lib/auth/safe-callback-url.ts` (`safeCallbackUrl`) is the only place allowed
 * to decide whether a user-supplied `next` / `callbackUrl` path is safe to
 * redirect to. Weaker local copies only rejected `//` and missed backslashes
 * and control characters, which the URL parser turns into an outside host
 * (`new URL("/\\evil.example", origin)` -> `https://evil.example/`).
 *
 * This guard fails when any file under app/, lib/ or components/ other than
 * the owner either defines its own safe-path style validator or carries the
 * hand-rolled `startsWith("//")) return "/..."` fallback.
 *
 * KNOWN_COPIES is a shrink-only list of copies that exist today and could not
 * be removed in RA-8349 (the agent secrets gate refuses reads of these files
 * because they contain the NextAuth cookie name). The guard also fails when a
 * listed file no longer holds a copy, so the entry must be deleted the moment
 * the file is fixed. Never add to this list.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const SCAN_DIRS = ["app", "lib", "components"];
const OWNER = "lib/auth/safe-callback-url.ts";

const KNOWN_COPIES: readonly string[] = [
  "app/api/auth/handoff/initiate/route.ts",
  "app/auth/redeem/route.ts",
];

// A function or const named like a same-origin path validator.
const VALIDATOR_DEFINITION =
  /\b(?:function\s+|(?:const|let)\s+)((?:isSafe|safe)\w*(?:Path|CallbackUrl|NextUrl|RedirectUrl|Redirect|ReturnUrl|ReturnTo))\s*(?:[(<]|=\s*(?:async\s*)?(?:\(|function))/;
// The hand-rolled fallback: reject `//` and return an app path.
const HAND_ROLLED_FALLBACK =
  /startsWith\(\s*["'`]\/\/["'`]\s*\)\s*\)?\s*return\s*["'`]\//;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith("."))
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name))
      out.push(full);
  }
}

function findRedirectValidatorCopies(root: string = ROOT): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(root, d), files);
  const hits: string[] = [];
  for (const full of files) {
    const rel = relative(root, full).split(sep).join("/");
    if (rel === OWNER) continue;
    const src = readFileSync(full, "utf8");
    if (VALIDATOR_DEFINITION.test(src) || HAND_ROLLED_FALLBACK.test(src))
      hits.push(rel);
  }
  return hits.sort();
}

describe("RA-8349 single owner for the safe-redirect check", () => {
  const copies = findRedirectValidatorCopies();

  it("no file outside lib/auth/safe-callback-url.ts grows a new copy", () => {
    const unexpected = copies.filter((f) => !KNOWN_COPIES.includes(f));
    expect(unexpected).toEqual([]);
  });

  it("every KNOWN_COPIES entry still holds a copy (delete the entry once fixed)", () => {
    const stale = KNOWN_COPIES.filter((f) => !copies.includes(f));
    expect(stale).toEqual([]);
  });

  it("detects a planted copy (positive control)", () => {
    expect(
      VALIDATOR_DEFINITION.test(
        "function isSafeNextPath(next: string | null) {",
      ),
    ).toBe(true);
    expect(
      VALIDATOR_DEFINITION.test("const safeReturnUrl = (raw: string) => raw"),
    ).toBe(true);
    expect(
      HAND_ROLLED_FALLBACK.test(
        'if (next.startsWith("//")) return "/dashboard";',
      ),
    ).toBe(true);
    // Not a redirect validator: protocol-relative URL normalisation.
    expect(
      HAND_ROLLED_FALLBACK.test(
        'if (src.startsWith("//")) return "https:" + src;',
      ),
    ).toBe(false);
  });
});
