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

/** This file searches for strings it must itself contain. */
const SELF = "lib/__tests__/stripe-api-version.test.ts";

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
      if (file === SELF) return false;
      const source = readFileSync(join(ROOT, file), "utf8");
      return /apiVersion\s*:\s*["']\d{4}-\d{2}-\d{2}\./.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("is what every Stripe client is constructed with", () => {
    /**
     * Discovery rather than a list: a client added later is checked
     * automatically, which a hardcoded set of paths would not be.
     *
     * Two corrections are baked into this, both found after the first version
     * shipped.
     *
     * It matched `/new Stripe\(/`, which MISSES
     * `scripts/ci/producers/d1-billing-flows.ts` -- that file does
     * `const StripeCtor = (await import("stripe")).default` and then
     * `new StripeCtor(key)`. A guard that discovers by one spelling is a list
     * wearing a regex.
     *
     * And it did not exclude ITSELF. This file necessarily contains the string
     * it searches for, so once committed it matched itself and demanded its own
     * body construct a Stripe client. It passed when first run only because the
     * file was still untracked and `git ls-files` did not return it -- a test
     * that goes green before commit and red after is the worst kind, because
     * the author sees the green.
     */
    const clients = trackedSources().filter((file) => {
      if (file === SELF) return false;
      return /new Stripe\w*\(/.test(readFileSync(join(ROOT, file), "utf8"));
    });
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
      const at = source.search(/new Stripe\w*\(/);
      expect(at, `${file}: client construction not located`).toBeGreaterThan(-1);
      const call = source.slice(at);
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

  it("no longer PINS the stale reconciler version anywhere", () => {
    /**
     * Matches an `apiVersion:` assignment, not a mention.
     *
     * The first version searched for the bare literal, and then my own
     * corrective comment -- which names the version it is correcting -- tripped
     * it. That is the second time in one session a guard fired on prose written
     * to explain the very defect it guards. Explaining a stale pin is not
     * carrying one, and a test that cannot tell those apart pushes the next
     * author to delete the explanation.
     */
    const stale = trackedSources().filter((file) => {
      if (file === SELF) return false;
      return /apiVersion\s*:\s*["']2026-05-27\.dahlia["']/.test(
        readFileSync(join(ROOT, file), "utf8"),
      );
    });
    expect(stale).toEqual([]);
  });
});
