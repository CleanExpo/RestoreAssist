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

const PROD_HOSTNAME_PATTERNS: readonly RegExp[] = [
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

const SANDBOX_HOSTNAME_HINTS: readonly RegExp[] = [
  /sandbox/i,
  /staging/i,
  /preview/i,
  /localhost/i,
  /127\.0\.0\.1/,
];

export interface SandboxAssertion {
  baseUrl: string;
  databaseUrl?: string | undefined;
}

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

function looksLikeSandbox(value: string): boolean {
  return SANDBOX_HOSTNAME_HINTS.some((re) => re.test(value));
}

export function assertSandbox({
  baseUrl,
  databaseUrl,
}: SandboxAssertion): void {
  if (!baseUrl) {
    throw new ProdAccessRefused("baseUrl", "<empty>", "is required");
  }

  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    throw new ProdAccessRefused("baseUrl", baseUrl, "is not a valid URL");
  }

  if (looksLikeProd(hostname)) {
    throw new ProdAccessRefused(
      "baseUrl",
      hostname,
      "matches a production hostname pattern",
    );
  }

  // Belt-and-braces: even if the hostname doesn't match a known prod
  // pattern, require an affirmative sandbox/staging/local hint. This
  // catches the case where someone points at a brand-new prod hostname
  // we forgot to add to PROD_HOSTNAME_PATTERNS.
  if (!looksLikeSandbox(hostname)) {
    throw new ProdAccessRefused(
      "baseUrl",
      hostname,
      "does not contain a sandbox/staging/localhost marker",
    );
  }

  if (databaseUrl !== undefined && databaseUrl.length > 0) {
    if (looksLikeProd(databaseUrl)) {
      // Don't echo the URL — it has credentials. Echo just the hostname.
      let dbHost = "<unparseable>";
      try {
        dbHost = new URL(databaseUrl).hostname;
      } catch {
        /* ignore */
      }
      throw new ProdAccessRefused(
        "databaseUrl",
        dbHost,
        "matches a production database pattern",
      );
    }
  }
}
