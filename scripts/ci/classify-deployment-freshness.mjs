const SHA1_HEX = /^[0-9a-f]{40}$/i;

/** Production is serving the exact revision CI expects. */
export const FRESH = "fresh";
/** Production is healthy, but is not serving the revision CI expects. */
export const STALE = "stale";
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
 * that is STALE, not UNREACHABLE. (An older build predating the
 * `deploymentSha` field omits the key entirely, which is exactly the
 * un-promoted case.)
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
      verdict: STALE,
      reason:
        "production reports no deploymentSha, so it predates that field — it is running a build older than this revision",
    };
  }

  if (!SHA1_HEX.test(observed)) {
    return {
      verdict: STALE,
      reason: `production reported a malformed deploymentSha ${JSON.stringify(observed)}`,
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
