/**
 * Pure helpers for the cutover onboarding flow (gate G1).
 */

/** Per-workspace tenant-DB lifecycle. `none` = behaves exactly as today (shared DB). */
export type TenantDbStatus = "none" | "provisioning" | "ready" | "error";

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const POSTGRES_SCHEMES = new Set(["postgres:", "postgresql:"]);

/**
 * Validate a tenant DB connection string before anything touches it. v1 is
 * Postgres only. Rejects empty, malformed, non-Postgres, and host-less strings —
 * so a bad string never reaches the connectivity test or storage.
 */
export function validateConnectionString(raw: string): ValidationResult {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "A connection string is required." };

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
  return { ok: true };
}

/** First claim may only deploy once the workspace's own DB is ready. */
export function canDeployFirstClaim(status: TenantDbStatus): boolean {
  return status === "ready";
}
