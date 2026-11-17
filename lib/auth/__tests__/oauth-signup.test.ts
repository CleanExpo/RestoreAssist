/**
 * RA-8435 — one owner for "a new Apple/Google account was created".
 *
 * Before this, the app (native Apple/Google) and Firebase Google sign-in
 * routes each created the account from a hand-written copy of the web
 * sign-up rule and left out the `signup_completed` event, so every app
 * sign-up was missing from the activation funnel.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@/lib/analytics/track", () => ({
  track: (...args: unknown[]) => track(...args),
}));

import { recordOAuthSignupCompleted } from "../oauth-signup";

beforeEach(() => {
  track.mockReset();
  track.mockResolvedValue(undefined);
});

describe("recordOAuthSignupCompleted", () => {
  it("emits signup_completed once with the parsed first-touch attribution", async () => {
    const raw = encodeURIComponent(JSON.stringify({ source: "google", campaign: "x" }));
    await recordOAuthSignupCompleted("user-1", raw);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("user-1", "signup_completed", {
      hasOrganization: false,
      method: "oauth",
      attribution: { source: "google", campaign: "x" },
    });
  });

  it("records null attribution when there is no first-touch cookie", async () => {
    await recordOAuthSignupCompleted("user-2", undefined);
    expect(track).toHaveBeenCalledWith("user-2", "signup_completed", {
      hasOrganization: false,
      method: "oauth",
      attribution: null,
    });
  });

  it("never throws when tracking fails, so sign-in cannot be broken by analytics", async () => {
    track.mockRejectedValueOnce(new Error("db down"));
    await expect(recordOAuthSignupCompleted("user-3", "%E0%A4%A")).resolves.toBeUndefined();
  });
});

// Discovering test: every non-test file under app/api/auth or lib/auth* that
// creates a User row must go through the shared owner. A new sign-up route
// added later is picked up without editing this list.
const ROOT = join(__dirname, "..", "..", "..");
const SHARED_IMPORT = /from\s+["']@\/lib\/auth\/oauth-signup["']/;
const USER_CREATE = /\.user\.create\(/;

// Email + password sign-up is not an Apple/Google sign-up. It keeps its own
// `signup_completed` emitter with method "credentials"; the assertion below
// keeps this exception honest.
const OWN_EMITTER_ALLOWED = new Set(["app/api/auth/register/route.ts"]);

// Not yet wired to the shared owner. lib/auth.ts (NextAuth events.createUser,
// the web path) still records signup_completed with its own inline `track`
// call; moving it onto recordOAuthSignupCompleted is the RA-8435 follow-up.
// This list may only shrink: the ratchet test below fails once a file here
// imports the shared owner, so the entry must then be deleted.
const PENDING_MIGRATION = new Set(["lib/auth.ts"]);

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
}

function signupScopeFiles(): string[] {
  const out: string[] = [];
  walk(join(ROOT, "app", "api", "auth"), out);
  walk(join(ROOT, "lib", "auth"), out);
  for (const name of readdirSync(join(ROOT, "lib"))) {
    if (/^auth.*\.tsx?$/.test(name)) out.push(join(ROOT, "lib", name));
  }
  return out.map((f) => relative(ROOT, f).split(sep).join("/"));
}

describe("sign-up routes go through the shared owner", () => {
  const creators = signupScopeFiles().filter((f) =>
    USER_CREATE.test(readFileSync(join(ROOT, f), "utf8")),
  );

  it("finds the known account-creating routes (positive control)", () => {
    expect(creators).toContain("app/api/auth/native-token-exchange/route.ts");
    expect(creators).toContain("app/api/auth/google-signin/route.ts");
  });

  it("every account-creating file imports recordOAuthSignupCompleted", () => {
    const offenders = creators.filter(
      (f) =>
        !OWN_EMITTER_ALLOWED.has(f) &&
        !PENDING_MIGRATION.has(f) &&
        !SHARED_IMPORT.test(readFileSync(join(ROOT, f), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("the pending list only shrinks: wired files must be removed from it", () => {
    const wiredButStillPending = [...PENDING_MIGRATION].filter((f) =>
      SHARED_IMPORT.test(readFileSync(join(ROOT, f), "utf8")),
    );
    expect(wiredButStillPending).toEqual([]);
    for (const f of PENDING_MIGRATION) {
      // A pending file must still emit the event itself until it is wired.
      expect(readFileSync(join(ROOT, f), "utf8")).toMatch(/"signup_completed"/);
    }
  });

  it("the email sign-up exception still emits its own signup_completed", () => {
    for (const f of OWN_EMITTER_ALLOWED) {
      expect(readFileSync(join(ROOT, f), "utf8")).toMatch(/"signup_completed"/);
    }
  });
});
