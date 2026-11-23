/**
 * RA-8350 guard: every source file that issues a server redirect is on a
 * reviewed list.
 *
 * Two open-redirect defects of one kind (RA-8349: ?next= in the login
 * handoff; RA-8350: ?path= in the storage routes) showed that checking each
 * route for one shape of bad target does not stop the kind. This test stops
 * it at review time instead: a new file that calls NextResponse.redirect( or
 * Response.redirect( fails here until someone checks where its target comes
 * from and adds it below with that reason.
 *
 * Adding a file: confirm the redirect target is either a fixed/server-built
 * URL, or a request value passed through an allow-list owner (safe in-app
 * path helper, or isAllowedMediaUrl in lib/media/cloudinary-asset-url.ts).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "lib", "components", "hooks", "services"];
const SCAN_ROOT_FILES = ["proxy.ts", "middleware.ts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);
const REDIRECT_CALL = /\b(?:NextResponse|Response)\.redirect\(/;

/** Reviewed inventory: file -> where the redirect target comes from. */
const REVIEWED: Record<string, string> = {
  "app/api/auth/handoff/initiate/route.ts":
    "?next= from the request; must pass the safe in-app path check (RA-8349)",
  "app/api/billing/connect/return/route.ts":
    "fixed in-app invoices path, or the Stripe account-link URL returned by the Stripe API",
  "app/api/integrations/oauth/[provider]/callback/route.ts":
    "fixed in-app integrations path built on the app origin",
  "app/api/invites/oauth-complete/route.ts":
    "in-app /invite/<token> path on the request URL",
  "app/api/oauth/google-drive/callback/route.ts":
    "fixed in-app settings path built on the app origin",
  "app/api/oauth/google-drive/start/route.ts":
    "Google OAuth authorise URL built on the server",
  "app/api/oauth/microsoft-onedrive/callback/route.ts":
    "fixed in-app settings path built on the app origin",
  "app/api/oauth/microsoft-onedrive/start/route.ts":
    "Microsoft OAuth authorise URL built on the server",
  "app/api/reports/[id]/download/route.ts":
    "fixed in-app /api/reports/<id>/pdf path on the request origin",
  "app/api/storage/file/route.ts":
    "?path= from the request; absolute hosts must pass isAllowedMediaUrl (RA-8350)",
  "app/api/storage/thumbnail/route.ts":
    "?path= from the request; absolute hosts must pass isAllowedMediaUrl (RA-8350)",
  "app/auth/redeem/route.ts":
    "?next= from the request; must pass the safe in-app path check (RA-8349)",
  "proxy.ts":
    "auth, setup and seat redirects; pathname set on a clone of the request URL",
};

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
}

function redirectFiles(): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
  for (const f of SCAN_ROOT_FILES) {
    try {
      if (statSync(join(ROOT, f)).isFile()) files.push(join(ROOT, f));
    } catch {
      /* not present */
    }
  }
  return files
    .filter((f) => REDIRECT_CALL.test(readFileSync(f, "utf8")))
    .map((f) => relative(ROOT, f).split(sep).join("/"))
    .sort();
}

describe("server redirect inventory (RA-8350)", () => {
  const found = redirectFiles();

  it("finds redirect calls at all (positive control)", () => {
    expect(found).toContain("app/api/storage/file/route.ts");
  });

  it("every file that redirects has been reviewed", () => {
    const unreviewed = found.filter((f) => !(f in REVIEWED));
    expect(
      unreviewed,
      "New redirect file(s). Check where the target comes from, then add to REVIEWED with the reason.",
    ).toEqual([]);
  });

  it("the reviewed list has no stale entries", () => {
    const stale = Object.keys(REVIEWED).filter((f) => !found.includes(f));
    expect(stale, "Remove entries for files that no longer redirect.").toEqual(
      [],
    );
  });
});
