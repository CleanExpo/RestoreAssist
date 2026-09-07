const SHA1_HEX = /^[0-9a-f]{40}$/i;

/** Production is serving the exact revision CI expects. */
export const FRESH = "fresh";
/** Production is healthy, and names a DIFFERENT revision than CI expects. */
export const STALE = "stale";
/** Production is healthy but does not say which revision it is serving. */
export const UNREPORTED = "unreported";
/** Production could not be probed at all. */
export const UNREACHABLE = "unreachable";

/**
 * Decide what a production `/api/health` probe says about deploy freshness.
 *
 * WHY THIS IS SEPARATE FROM "THE SMOKE FAILED"
 * --------------------------------------------
 * These two states need different humans doing different things:
 *
 *   STALE       nothing is broken. main moved ahead and the release was never
 *               promoted. The fix is to run a deploy, not to debug the app.
 *   UNREACHABLE production did not answer, answered non-JSON, or redirected
 *               somewhere else. Something is actually wrong right now.
 *
 * Collapsing both into one red check means a months-long "you have not
 * deployed" backlog is indistinguishable from a live outage, and a real
 * outage arriving during that backlog is invisible.
 *
 * A 200 JSON body proves the app is up and serving. So an absent, malformed,
 * or mismatched `deploymentSha` on an otherwise healthy response is a
 * statement about *which build* is running, not about whether it is running:
 * never UNREACHABLE.
 *
 * ABSENT IS NOT OLD — corrected 2026-09-06.
 * This module used to read a missing `deploymentSha` as "a build predating the
 * field, which is exactly the un-promoted case". That inference held on Vercel,
 * where `VERCEL_GIT_COMMIT_SHA` is always injected, so absence could only mean
 * age. Production runs on DigitalOcean, and `app/api/health/route.ts` computes
 * the field as `VERCEL_GIT_COMMIT_SHA || GIT_SHA || null`. DigitalOcean injects
 * neither unless the app spec declares it, so the key was absent on every build
 * however fresh, and the verdict was permanently STALE.
 *
 * Measured that day: the ACTIVE DigitalOcean deployment was `commit 9b8285e
 * pushed to main` — current main, deployed 05:51Z — while `/api/health` still
 * reported `deploymentSha: null` and the 15-minute smoke reported STALE. That
 * is the exact collapse the paragraph above exists to prevent, arrived at from
 * the other direction: when the answer never changes, a genuinely un-promoted
 * production is indistinguishable from the normal state.
 *
 * So a revision the deployment does not report is UNREPORTED: build identity is
 * unverifiable. It is not silently fine either — the caller must say so out
 * loud, because absence of evidence is not evidence. The remedy is to make the
 * deployment report its own revision (set `GIT_SHA` in the app spec), after
 * which this check starts carrying information again.
 *
 * Pure and side-effect free so every branch is unit-testable without a
 * network; the caller does the fetching and maps the verdict to an exit code.
 *
 * @returns {{ verdict: string, reason: string }}
 */
export function classifyDeploymentFreshness({
  expectedSha,
  reached,
  requestedUrl,
  finalUrl,
  status,
  contentType,
  body,
}) {
  if (!SHA1_HEX.test(expectedSha ?? "")) {
    throw new Error(
      "expectedSha must be a 40-character commit SHA to classify freshness",
    );
  }

  if (!reached) {
    return {
      verdict: UNREACHABLE,
      reason: "health endpoint could not be reached",
    };
  }

  // A redirect means something other than the app answered for this origin.
  // Treat it as an outage rather than reading a SHA off an unknown responder.
  if (finalUrl !== requestedUrl) {
    return {
      verdict: UNREACHABLE,
      reason: `health request redirected to ${finalUrl}`,
    };
  }

  if (status !== 200) {
    return { verdict: UNREACHABLE, reason: `health returned HTTP ${status}` };
  }

  if (!contentType?.includes("application/json")) {
    return {
      verdict: UNREACHABLE,
      reason: `health returned non-JSON content-type ${contentType ?? "(none)"}`,
    };
  }

  if (!body || typeof body !== "object") {
    return { verdict: UNREACHABLE, reason: "health body is not a JSON object" };
  }

  const observed = body.deploymentSha;

  if (typeof observed !== "string" || observed.length === 0) {
    return {
      verdict: UNREPORTED,
      reason:
        "production reports no deploymentSha, so which build is running cannot be " +
        "verified from here — this says nothing about its age. Set GIT_SHA in the " +
        "app spec so the deployment reports its own revision.",
    };
  }

  if (!SHA1_HEX.test(observed)) {
    return {
      verdict: UNREPORTED,
      reason:
        `production reported a malformed deploymentSha ${JSON.stringify(observed)}, ` +
        "so which build is running cannot be verified. Set GIT_SHA in the app spec " +
        "to a real 40-character commit SHA.",
    };
  }

  if (observed.toLowerCase() !== expectedSha.toLowerCase()) {
    return {
      verdict: STALE,
      reason: `production is serving ${observed.slice(0, 7)}, expected ${expectedSha.slice(0, 7)}`,
    };
  }

  return { verdict: FRESH, reason: `production is serving ${observed}` };
}
