/**
 * Sandbox-only assertion.
 *
 * The harness creates synthetic users, inspections, photos, and AI
 * generations. Running it against prod would (a) pollute the prod DB,
 * (b) charge prod's Anthropic budget, (c) create fake claims that
 * could leak into pilot dashboards. None of those are recoverable.
 *
 * Every entry point passes its BASE_URL + DATABASE_URL through
 * `assertSandbox()` before any HTTP or DB call. Failure throws — the
 * runner cannot be configured around it.
 */

import { fetch as undiciFetch, type RequestInit } from "undici";

const PROD_HOSTNAME_PATTERNS: readonly RegExp[] = [
  /^restoreassist\.app$/i,
  /^www\.restoreassist\.app$/i,
  /^app\.restoreassist\.com\.au$/i,
  /^restoreassist\.com\.au$/i,
  /^www\.restoreassist\.com\.au$/i,
  // Production Supabase project ref — substring match in DATABASE_URL.
  // Update when the prod project ref is known; left as a placeholder
  // string the operator MUST replace before first use of the harness.
  /\bRA_PROD_DB_REF\b/,
  // The REAL production Supabase project ref (RA-7008). The placeholder above
  // was never substituted, so an actual prod DATABASE_URL passed this guard.
  // The ref is already public via NEXT_PUBLIC_SUPABASE_URL — no secret leaked.
  /\budooysjajglluvuxkijp\b/i,
];

export interface SandboxAssertion {
  baseUrl: string;
  databaseUrl?: string | undefined;
  allowedBaseUrls?: string[] | undefined;
  allowedDatabaseHosts?: string[] | undefined;
}

interface RevisionProbeResponse {
  ok: boolean;
  status: number;
  url: string;
  json: () => Promise<unknown>;
}

type RevisionProbeFetch = (
  url: string,
  init: RequestInit,
) => Promise<RevisionProbeResponse>;

export class ProdAccessRefused extends Error {
  constructor(field: string, value: string, reason: string) {
    super(
      `[pilot-tester safety] Refused to start: ${field}=${value} ${reason}.\n` +
        `This harness must NEVER run against production. Set BASE_URL to the sandbox or localhost.`,
    );
    this.name = "ProdAccessRefused";
  }
}

function looksLikeProd(value: string): boolean {
  return PROD_HOSTNAME_PATTERNS.some((re) => re.test(value));
}

function configuredValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function assertSandbox({
  baseUrl,
  databaseUrl,
  allowedBaseUrls = configuredValues(process.env.PILOT_TESTER_ALLOWED_BASE_URLS),
  allowedDatabaseHosts = configuredValues(
    process.env.PILOT_TESTER_ALLOWED_DATABASE_HOSTS,
  ),
}: SandboxAssertion): void {
  if (!baseUrl) {
    throw new ProdAccessRefused("baseUrl", "<empty>", "is required");
  }

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    throw new ProdAccessRefused("baseUrl", baseUrl, "is not a valid URL");
  }
  const hostname = parsedBase.hostname;

  if (looksLikeProd(hostname)) {
    throw new ProdAccessRefused(
      "baseUrl",
      hostname,
      "matches a production hostname pattern",
    );
  }

  const localOrigin =
    (hostname === "localhost" || hostname === "127.0.0.1") &&
    (parsedBase.protocol === "http:" || parsedBase.protocol === "https:");
  const exactOrigin = `${parsedBase.protocol}//${parsedBase.host}`;
  if (!localOrigin && parsedBase.protocol !== "https:") {
    throw new ProdAccessRefused(
      "baseUrl",
      exactOrigin,
      "must use HTTPS unless it is an exact localhost origin",
    );
  }
  if (!localOrigin && !allowedBaseUrls.includes(exactOrigin)) {
    throw new ProdAccessRefused(
      "baseUrl",
      exactOrigin,
      "is not in PILOT_TESTER_ALLOWED_BASE_URLS",
    );
  }
  if (parsedBase.pathname !== "/" || parsedBase.search || parsedBase.hash) {
    throw new ProdAccessRefused("baseUrl", exactOrigin, "must be an origin without a path, query or fragment");
  }

  if (databaseUrl !== undefined && databaseUrl.length > 0) {
    let dbHost = "<unparseable>";
    try {
      dbHost = new URL(databaseUrl).hostname;
    } catch {
      throw new ProdAccessRefused("databaseUrl", dbHost, "is not a valid database URL");
    }
    if (looksLikeProd(databaseUrl) || !allowedDatabaseHosts.includes(dbHost)) {
      // Don't echo the URL — it has credentials. Echo just the hostname.
      throw new ProdAccessRefused(
        "databaseUrl",
        dbHost,
        looksLikeProd(databaseUrl)
          ? "matches a production database pattern"
          : "is not in PILOT_TESTER_ALLOWED_DATABASE_HOSTS",
      );
    }
  }
}

export function assertRuntimeRevision(
  payload: unknown,
  expectedRevision: string,
): string {
  if (!/^[0-9a-f]{40}$/i.test(expectedRevision)) {
    throw new Error("[pilot-tester revision] expected release revision is not a 40-character Git SHA");
  }
  const observed =
    payload && typeof payload === "object" && "deploymentSha" in payload
      ? (payload as { deploymentSha?: unknown }).deploymentSha
      : null;
  if (typeof observed !== "string" || !/^[0-9a-f]{40}$/i.test(observed)) {
    throw new Error("[pilot-tester revision] sandbox health exposes no exact deploymentSha");
  }
  if (observed.toLowerCase() !== expectedRevision.toLowerCase()) {
    throw new Error(
      `[pilot-tester revision] sandbox deployment ${observed} does not match release ${expectedRevision}`,
    );
  }
  return observed.toLowerCase();
}

/**
 * Prove the sandbox runtime, not merely the checked-out harness, is the release
 * candidate. This runs before authentication or any synthetic record creation.
 */
export async function probeSandboxRuntimeRevision(
  baseUrl: string,
  expectedRevision: string,
  fetchImpl: RevisionProbeFetch = undiciFetch as unknown as RevisionProbeFetch,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/health`;
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
  });
  if (!response.ok || response.status !== 200) {
    throw new Error(
      `[pilot-tester revision] sandbox health probe failed with HTTP ${response.status}`,
    );
  }
  if (response.url !== url) {
    throw new Error(
      `[pilot-tester revision] sandbox health redirected: expected ${url}, observed ${response.url || "<missing>"}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("[pilot-tester revision] sandbox health returned invalid JSON");
  }
  return assertRuntimeRevision(payload, expectedRevision);
}
