/**
 * RA-8417 — every route that stores a password hash must run the known-leak
 * check. Routes are found by scanning app/api, not from a fixed list, so a
 * new or forgotten route (like the old app/api/user/change-password) cannot
 * slip past the guard.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

const ROOT = resolve(__dirname, "../../..");
const API_DIR = join(ROOT, "app/api");

// Known gap, tracked on RA-8417: homeowner portal accounts still allow 8
// characters with no known-leak check. Remove this entry when that route
// adopts lib/auth/password-policy.ts.
const KNOWN_GAPS = new Set(["app/api/portal/invitations/accept/route.ts"]);

const STORES_PASSWORD_HASH = /bcrypt\.hash\(\s*\w*password\w*\s*,/i;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" ? [] : routeFiles(full);
    }
    return name === "route.ts" ? [full] : [];
  });
}

const hashingRoutes = routeFiles(API_DIR)
  .filter((file) => STORES_PASSWORD_HASH.test(readFileSync(file, "utf8")))
  .map((file) => relative(ROOT, file).split("\\").join("/"));

describe("routes that store a password hash", () => {
  it("are found by the scan (control: the known routes)", () => {
    expect(hashingRoutes).toEqual(
      expect.arrayContaining([
        "app/api/auth/register/route.ts",
        "app/api/auth/reset-password/route.ts",
        "app/api/auth/change-password/route.ts",
        "app/api/invites/[token]/route.ts",
        ...KNOWN_GAPS,
      ]),
    );
  });

  it.each(hashingRoutes.filter((f) => !KNOWN_GAPS.has(f)))(
    "%s runs the known-leak check",
    (file) => {
      expect(readFileSync(join(ROOT, file), "utf8")).toMatch(
        /rejectIfBreached\(/,
      );
    },
  );
});
