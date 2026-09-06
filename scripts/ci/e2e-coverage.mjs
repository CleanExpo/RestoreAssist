/**
 * Which end-to-end specs are executed by something, and which by nothing.
 *
 * THE FAULT THIS EXISTS FOR
 * -------------------------
 * Measured 2026-09-06 against `docs/archive/playwright-e2e`: **55 spec files,
 * 10 executed by any pipeline, 45 by nothing.** Among the 45 were all nine
 * billing specs — hard-paywall, credit-exhaust, cancel-flow, webhook-race,
 * feature-gate, grandfather, multi-tab, voluntary-upgrade and billing.spec.ts —
 * plus stripe-payment-intent-webhook, ios-billing-gates, account-deletion and
 * security. On a product that takes money.
 *
 * Nothing was wrong with any of them. They simply ran nowhere, and a suite that
 * runs nowhere fails silently and for free: it never goes red, so it never asks
 * anybody for anything. This is the same defect `pr-checks.yml` recorded for the
 * Python release-script suite and `scripts/ci/run-mjs-tests.mjs` closed for the
 * `.test.mjs` guards. This closes it for the e2e layer.
 *
 * WHAT MAKES THIS STRONGER THAN A LIST
 * ------------------------------------
 * A manifest of intentions would let a spec be recorded as covered while
 * nothing ran it — the same failure wearing a tidier coat. So every claim is
 * checked against the mechanism that would have to be true for it to hold:
 *
 *   smoke            the file must actually contain the @smoke tag
 *   a1               the A1 producer's own --list-specs must name it
 *   workflow:<file>  that workflow file must actually name it
 *   unrun:<reason>   a reason is mandatory; "unrun:" alone is rejected
 *
 * A false claim fails exactly as loudly as an undeclared spec. Declaring a
 * spec `unrun` is honest and permitted; it is a debt with a name, and the
 * summary counts it as not executed.
 *
 * Pure functions here; `check-e2e-coverage.mjs` does the filesystem work.
 */

/** @returns {Map<string,string>} spec path -> disposition */
/**
 * The only dispositions that mean anything. An unrecognised one -- a typo like
 * `smok`, or `unrun` without its colon -- used to escape every verification
 * branch in findCoverageDrift and still be counted as executed by summarise.
 * A typo was therefore the one way to claim coverage that nothing checked.
 * Found by independent review (independent cross-vendor review, 2026-09-07).
 */
const KNOWN_EXACT = new Set(["smoke", "a1"]);
const KNOWN_PREFIXES = ["workflow:", "unrun:"];

export function assertKnownDisposition(spec, disposition) {
  if (KNOWN_EXACT.has(disposition)) return;
  for (const prefix of KNOWN_PREFIXES) {
    if (disposition.startsWith(prefix) && disposition.slice(prefix.length).trim()) {
      return;
    }
  }
  throw new Error(
    `unknown disposition for ${spec}: ${JSON.stringify(disposition)}. ` +
      `Expected one of: smoke, a1, workflow:<file>, unrun:<reason>.`,
  );
}

/**
 * Coverage was decided by searching raw file text, so `@smoke` written in a
 * comment, or a spec filename mentioned in a YAML comment, both counted as
 * "this spec is executed". Playwright's grep and the workflow runner see
 * neither. Strip comments before asking.
 *
 * Deliberately conservative: `//` is only treated as a comment when it is not
 * preceded by `:`, so a `https://` URL is left intact rather than truncating
 * the rest of the line and inventing a different false answer.
 *
 * @param {string} text
 * @param {"ts"|"yml"} kind
 */
export function stripComments(text, kind) {
  if (kind === "yml") {
    return (text ?? "").replace(/(^|\s)#.*$/gmu, "$1");
  }
  return (text ?? "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

export function parseCoverageManifest(text) {
  const out = new Map();
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [spec, ...rest] = line.split(/\s+/);
    const disposition = rest.join(" ").trim();
    if (!disposition) {
      throw new Error(`manifest entry has no disposition: ${spec}`);
    }
    assertKnownDisposition(spec, disposition);
    out.set(spec, disposition);
  }
  return out;
}

/**
 * @param {object} input
 * @param {string[]} input.onDisk spec paths, relative to the e2e root.
 * @param {Map<string,string>} input.manifest
 * @param {string[]} input.smokeTagged specs whose source contains `@smoke`.
 * @param {string[]} input.a1Declared specs the A1 producer lists.
 * @param {Map<string,string[]>} input.workflowNamed workflow file -> specs it names.
 */
export function findCoverageDrift({
  onDisk,
  manifest,
  smokeTagged,
  a1Declared,
  workflowNamed,
}) {
  const unmentioned = onDisk.filter((f) => !manifest.has(f));
  const missing = [...manifest.keys()].filter((f) => !onDisk.includes(f));

  const falseClaims = [];
  const base = (f) => f.split("/").pop();

  for (const [spec, disposition] of manifest) {
    if (!onDisk.includes(spec)) continue; // already reported as missing

    if (disposition === "smoke") {
      if (!smokeTagged.includes(spec)) {
        falseClaims.push(
          `${spec} is recorded as covered by the @smoke run, but the file does not contain the @smoke tag, so nothing selects it.`,
        );
      }
      continue;
    }

    if (disposition === "a1") {
      if (!a1Declared.includes(spec) && !a1Declared.includes(base(spec))) {
        falseClaims.push(
          `${spec} is recorded as an A1 core journey, but the A1 producer's --list-specs does not name it.`,
        );
      }
      continue;
    }

    if (disposition.startsWith("workflow:")) {
      const wf = disposition.slice("workflow:".length).trim();
      const named = workflowNamed.get(wf) ?? [];
      if (!named.includes(spec) && !named.includes(base(spec))) {
        falseClaims.push(
          `${spec} is recorded as run by ${wf}, but that workflow does not name it.`,
        );
      }
      continue;
    }

    if (disposition.startsWith("unrun:")) {
      if (!disposition.slice("unrun:".length).trim()) {
        falseClaims.push(
          `${spec} is declared unrun with no reason. A suite may only go unrun if somebody wrote down why.`,
        );
      }
      continue;
    }

    falseClaims.push(
      `${spec} has an unrecognised disposition ${JSON.stringify(disposition)}. Use smoke, a1, workflow:<file>, or unrun:<reason>.`,
    );
  }

  return { unmentioned, missing, falseClaims };
}

/** What actually runs, versus what is merely written down. */
export function summarise(manifest) {
  let executed = 0;
  let unrun = 0;
  for (const disposition of manifest.values()) {
    if (disposition.startsWith("unrun:")) unrun += 1;
    else executed += 1;
  }
  return { executed, unrun, total: executed + unrun };
}
