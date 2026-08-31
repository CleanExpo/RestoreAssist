import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { STRIPE_API_VERSION } from "../stripe";

/**
 * One owner for the Stripe API version.
 *
 * `lib/stripe.ts` pinned `2026-08-26.dahlia` while
 * `scripts/reconcile-stripe-subscriptions.ts` pinned `2026-05-27.dahlia` --
 * FOUR versions behind, and nothing objected. The reconciler omitted
 * `typescript: true`, so the SDK's types accepted any string and the stale pin
 * compiled happily for months.
 *
 * That is not a tidiness problem. A reconciler reading Stripe on a different
 * API version than the writer can see differently shaped objects, which is
 * precisely the class of silent disagreement that script exists to detect.
 * Dahlia moved the billing period off the Subscription root onto the
 * SubscriptionItem (RA-6968/6967); two clients on two versions can disagree
 * about where a renewal date lives.
 */

const ROOT = process.cwd();

/** Tracked source only: `git ls-files` skips .next and node_modules build output. */
function trackedSources(): string[] {
  return execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

describe("the Stripe API version has exactly one owner", () => {
  it("is a dated Stripe version string", () => {
    expect(STRIPE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.[a-z]+$/);
  });

  it("appears as a literal in no tracked source but its owner", () => {
    /**
     * The guard that would have caught the drift. Any other file spelling a
     * version literal is a second owner, and second owners are how one of them
     * silently falls four versions behind.
     */
    const offenders = trackedSources().filter((file) => {
      if (file === "lib/stripe.ts") return false;
      // This test names the old and new versions on purpose, to say what it is
      // guarding against; excluding itself keeps that possible.
      if (file.endsWith("lib/__tests__/stripe-api-version.test.ts")) return false;
      const source = readFileSync(join(ROOT, file), "utf8");
      return /apiVersion\s*:\s*["']\d{4}-\d{2}-\d{2}\./.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("is what every Stripe client is constructed with", () => {
    // Discovery rather than a list: a new `new Stripe(...)` added later is
    // checked automatically, which a hardcoded pair of paths would not be.
    const clients = trackedSources().filter((file) =>
      /new Stripe\(/.test(readFileSync(join(ROOT, file), "utf8")),
    );
    expect(clients.length).toBeGreaterThan(1);
    for (const file of clients) {
      const source = readFileSync(join(ROOT, file), "utf8");
      // Scan the CONSTRUCTOR CALL, not the whole file.
      //
      // The first version of this matched /typescript:\s*true/ anywhere in the
      // source, and the comment above the reconciler's client says the words
      // "typescript: true" -- so deleting the real option still passed. A test
      // that cannot fail for the reason it exists is worse than no test, and
      // this one was caught only by asserting the mutation had applied before
      // trusting the green.
      const call = source.slice(source.indexOf("new Stripe("));
      const options = call.slice(0, call.indexOf("});") + 3);
      expect(options.length, `${file}: could not isolate the Stripe options`)
        .toBeGreaterThan(20);
      expect(options, `${file} must use the shared constant`).toMatch(
        /apiVersion:\s*STRIPE_API_VERSION/,
      );
      // The coupling that makes a stale pin fail the BUILD rather than drift.
      // Its absence in the reconciler is the whole reason this happened.
      expect(options, `${file} must set typescript: true`).toMatch(
        /typescript:\s*true/,
      );
    }
  });

  it("no longer carries the stale reconciler pin anywhere", () => {
    const stale = trackedSources().filter((file) => {
      if (file.endsWith("lib/__tests__/stripe-api-version.test.ts")) return false;
      return readFileSync(join(ROOT, file), "utf8").includes("2026-05-27.dahlia");
    });
    expect(stale).toEqual([]);
  });
});
