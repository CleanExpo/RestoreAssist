/**
 * Pure helpers for the cutover onboarding flow (gate G1).
 */

/** Per-workspace tenant-DB lifecycle. `none` = behaves exactly as today (shared DB). */
export type TenantDbStatus =
  | "none"
  | "provisioning"
  | "ready"
  | "error"
  | "credential_error";

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const POSTGRES_SCHEMES = new Set(["postgres:", "postgresql:"]);
const SAFE_CONNECTION_PARAMETERS = new Set([
  "application_name",
  "connect_timeout",
  "connection_limit",
  "pgbouncer",
  "pool_timeout",
  "schema",
  "sslmode",
  "statement_cache_size",
]);

function normaliseHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function configuredHostPatterns(raw = process.env.TENANT_DATABASE_HOST_ALLOWLIST): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map(normaliseHostname)
    .filter(Boolean);
}

/**
 * Provisioning is intentionally limited to explicitly approved managed DB
 * hosts. An absent/empty allowlist denies every candidate, and wildcards are
 * suffix-only (`*.example.com`) so `evil-example.com` cannot match.
 */
export function isAllowlistedTenantDatabaseHost(
  hostname: string,
  rawAllowlist = process.env.TENANT_DATABASE_HOST_ALLOWLIST,
): boolean {
  const host = normaliseHostname(hostname);
  const patterns = configuredHostPatterns(rawAllowlist);
  if (!host || patterns.length === 0) return false;

  return patterns.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      return suffix.length > 2 && host.endsWith(suffix) && host.length > suffix.length;
    }
    return pattern === host;
  });
}

/**
 * Validate a tenant DB connection string before anything touches it. v1 is
 * Postgres only. Rejects empty, malformed, non-Postgres, and host-less strings —
 * so a bad string never reaches the connectivity test or storage.
 */
export function validateConnectionString(raw: string): ValidationResult {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "A connection string is required." };
  if (value.length > 4_096) {
    return { ok: false, error: "The connection string is too long." };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "That doesn't look like a valid connection string." };
  }

  if (!POSTGRES_SCHEMES.has(url.protocol)) {
    return { ok: false, error: "Only PostgreSQL connection strings are supported." };
  }
  if (!url.hostname) {
    return { ok: false, error: "The connection string is missing a host." };
  }
  const seenParameters = new Set<string>();
  for (const [rawName] of url.searchParams) {
    const name = rawName.toLowerCase();
    if (!SAFE_CONNECTION_PARAMETERS.has(name)) {
      return {
        ok: false,
        error: `The connection string contains an unsupported parameter: ${rawName}.`,
      };
    }
    if (seenParameters.has(name)) {
      return {
        ok: false,
        error: `The connection string repeats the ${rawName} parameter.`,
      };
    }
    seenParameters.add(name);
  }
  const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
  if (sslmode !== "verify-full") {
    return {
      ok: false,
      error: "The connection string must use sslmode=verify-full.",
    };
  }
  const schema = url.searchParams.get("schema");
  if (schema && !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema)) {
    return { ok: false, error: "The connection string contains an invalid schema." };
  }
  const boundedIntegers = [
    ["connect_timeout", 1, 10],
    ["connection_limit", 1, 5],
    ["pool_timeout", 1, 10],
    ["statement_cache_size", 0, 1_000],
  ] as const;
  for (const [name, minimum, maximum] of boundedIntegers) {
    const rawParameter = url.searchParams.get(name);
    if (rawParameter === null) continue;
    if (!/^\d+$/.test(rawParameter)) {
      return { ok: false, error: `The ${name} parameter must be an integer.` };
    }
    const parameter = Number(rawParameter);
    if (parameter < minimum || parameter > maximum) {
      return {
        ok: false,
        error: `The ${name} parameter must be between ${minimum} and ${maximum}.`,
      };
    }
  }
  const pgbouncer = url.searchParams.get("pgbouncer");
  if (pgbouncer !== null && pgbouncer !== "true") {
    return { ok: false, error: "The pgbouncer parameter must be true when present." };
  }
  const applicationName = url.searchParams.get("application_name");
  if (applicationName && !/^[A-Za-z0-9._-]{1,64}$/.test(applicationName)) {
    return { ok: false, error: "The application_name parameter is invalid." };
  }
  return { ok: true };
}

/**
 * The hostname a connection string points at, with credentials stripped — a
 * safe "connected to <host>" confidence signal for the onboarding UI. Never
 * returns the user or password. Null when the string can't be parsed.
 */
export function hostFromConnectionString(raw: string): string | null {
  try {
    const { hostname } = new URL((raw ?? "").trim());
    return hostname || null;
  } catch {
    return null;
  }
}

/** First claim may only deploy once the workspace's own DB is ready. */
export function canDeployFirstClaim(status: TenantDbStatus): boolean {
  return status === "ready";
}
