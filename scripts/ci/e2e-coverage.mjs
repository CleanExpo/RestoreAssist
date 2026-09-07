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

function escapeRegExp(v) {
  return v.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Does `text` genuinely NAME this spec?
 *
 * A bare `text.includes(name)` counted one spec's basename appearing INSIDE
 * another's. Two such pairs exist in this repository today:
 *   auth.spec.ts   is a substring of  invite-tech-google-oauth.spec.ts
 *   health.spec.ts is a substring of  crm-health.spec.ts
 * A workflow naming only the longer one silently satisfied the shorter one's
 * coverage claim, and the shorter spec stayed unexecuted while the gate passed.
 *
 * THE FIRST FIX FOR THAT WAS STILL SUBSTRING MATCHING, and it left the same
 * class open one turn later. It allowed `/` before the needle so a
 * path-qualified mention would count, which meant a DIFFERENT spec sharing a
 * basename satisfied the claim: a workflow running `other/cancel-flow.spec.ts`
 * discharged the coverage obligation for `billing/cancel-flow.spec.ts`, and the
 * billing spec stayed unexecuted while the gate passed. Same false green, same
 * file, second instance. Found by independent review 2026-09-07 and confirmed by
 * executable probe before being believed.
 *
 * So this no longer matches substrings at all. The text is split into whole
 * path tokens and each is compared for EQUALITY against the spec, optionally
 * prefixed by one of the known e2e roots. `billing/auth.spec.ts` is simply not
 * equal to `auth.spec.ts`, so no amount of shared basename can discharge the
 * wrong spec's claim.
 *
 * @param {string} text
 * @param {string} spec spec path relative to the e2e root
 * @param {string[]} roots repo-relative e2e roots a mention may be prefixed by
 */
export function mentionsSpec(text, spec, roots = []) {
  const wanted = new Set([
    spec,
    ...roots.map((r) => `${String(r).replace(/\/+$/u, "")}/${spec}`),
  ]);
  const tokens = String(text ?? "").match(/[A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]+)*/gu) ?? [];
  return tokens.some((t) => wanted.has(t.replace(/^\.\//u, "")));
}

// The modifier chains whose titles Playwright's `--grep` actually selects.
// Anything not named here -- step, beforeEach, beforeAll, afterEach, afterAll,
// use, extend, setTimeout, info -- takes a title that --grep never matches, so a
// tag sitting in one selects no test.
const TITLE_MODIFIERS = new Set([
  "only",
  "skip",
  "fixme",
  "fail",
  "slow",
  "describe",
  "serial",
  "parallel",
]);

/**
 * Playwright's `--grep` matches TEST TITLES. `@smoke` written anywhere else --
 * a string literal, a run instruction, a variable -- selects nothing, so
 * counting it as smoke coverage claims a spec runs when it does not. Comments
 * were already excluded by stripComments; this closes the rest by requiring the
 * tag to sit in the title argument of a test() or describe() call.
 *
 * ONLY the modifier chains Playwright's `--grep` actually selects are accepted,
 * and they are an ALLOW-LIST. The first attempt at this was a deny-list that
 * excluded `step` -- and it still admitted `test.beforeEach("setup @smoke")`,
 * `beforeAll`, `afterEach` and `afterAll`, every one of which takes a title that
 * `--grep` does not match. A deny-list on this surface needs one more spelling
 * forever, and each missing spelling is a spec recorded as covered while nothing
 * runs it. Found by independent review round 2, 2026-09-07, in the very fix
 * written for round 1's `test.step` finding.
 *
 * `.step` was the first instance and remains excluded.
 * `test.step()` also takes a title string, so the earlier modifier chain
 * `(?:\s*\.\s*\w+)*` matched it -- but `--grep` does not match step titles.
 * A spec whose only `@smoke` sat in a `test.step()` was therefore recorded as
 * smoke-covered while `--grep @smoke` selected nothing and Playwright exited 0,
 * leaving the spec unexecuted and the gate green. Found by independent review
 * 2026-09-07 and confirmed by executable probe before being believed.
 *
 * @param {string} source spec file contents
 */
export function hasSmokeTitle(source) {
  const call =
    /(?:^|[^A-Za-z0-9_$.])(test|describe)((?:\s*\.\s*\w+)*)\s*\(\s*(['"`])([\s\S]*?)\3/gmu;
  for (const m of (source ?? "").matchAll(call)) {
    const modifiers = m[2].match(/\w+/gu) ?? [];
    // ALLOW-LIST. A deny-list here needed one more spelling forever: excluding
    // `step` still admitted beforeEach, beforeAll, afterEach and afterAll, every
    // one of which takes a title that `--grep` does not match.
    if (!modifiers.every((mod) => TITLE_MODIFIERS.has(mod))) continue;
    if (m[4].includes("@smoke")) return true;
  }
  return false;
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
/**
 * Resolve a producer's declared spec names against the real spec set.
 *
 * A declaration may be a full e2e-root-relative path or a bare filename. A bare
 * filename is honoured only when exactly one spec carries it; if two specs in
 * different directories share a basename the declaration is ambiguous and
 * resolves to NOTHING, so the claim fails rather than silently attaching to the
 * wrong spec. Failing closed here reds the gate; failing open greened it.
 *
 * @param {string[]} declared
 * @param {string[]} specs e2e-root-relative spec paths
 * @returns {Set<string>} the specs unambiguously declared
 */
export function resolveDeclared(declared, specs) {
  const byBase = new Map();
  for (const s of specs) {
    const b = s.split("/").pop();
    byBase.set(b, (byBase.get(b) ?? []).concat(s));
  }
  const out = new Set();
  for (const d of declared ?? []) {
    const name = String(d).trim().replace(/^\.\//u, "");
    if (!name) continue;
    if (specs.includes(name)) {
      out.add(name);
      continue;
    }
    const hits = byBase.get(name.split("/").pop()) ?? [];
    if (hits.length === 1 && name.indexOf("/") === -1) out.add(hits[0]);
  }
  return out;
}

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
      // The A1 producer prints bare filenames, so a declaration is resolved
      // against the spec set and accepted ONLY when it identifies exactly one
      // spec. An ambiguous basename resolves to nothing rather than to whichever
      // spec asked first -- that is the same collision as above, arriving
      // through the producer instead of through a workflow.
      if (!resolveDeclared(a1Declared, onDisk).has(spec)) {
        falseClaims.push(
          `${spec} is recorded as an A1 core journey, but the A1 producer's --list-specs does not name it.`,
        );
      }
      continue;
    }

    if (disposition.startsWith("workflow:")) {
      const wf = disposition.slice("workflow:".length).trim();
      const named = workflowNamed.get(wf) ?? [];
      // NO base(spec) FALLBACK. `named` already holds exact e2e-root-relative
      // spec paths from mentionsSpec, so a basename comparison here re-opened
      // precisely the cross-directory collision mentionsSpec was rewritten to
      // close: a workflow naming root-level `auth.spec.ts` discharged the claim
      // for `billing/auth.spec.ts`, which then ran nowhere behind a green gate.
      // Fixing the matcher and leaving its consumer alone fixed nothing.
      if (!named.includes(spec)) {
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
