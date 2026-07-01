/**
 * Tenant-DB provisioning state machine (cutover onboarding, gate G1).
 *
 * Orchestrates connecting a workspace to its own database:
 *   validate → test → migrate → store → ready
 *
 * Ordering is a safety property, not decoration: the connection string is only
 * stored AFTER connectivity and the baseline migration succeed, so a failed
 * attempt never leaves a half-configured "connected" workspace. Every side
 * effect is injected, so the orchestration is unit-testable without a database;
 * production wires the real connectivity test, tenant migration, encrypted store,
 * and status update. `resumeFrom` makes a retry idempotent — it skips phases that
 * already succeeded.
 */
export type ProvisionPhase = "validate" | "test" | "migrate" | "store" | "ready";

export interface ProvisionDeps {
  /** Reject a malformed / non-Postgres string before anything else. */
  validate: (connectionString: string) => { ok: boolean; error?: string };
  /** Prove the DB is reachable with the given string. */
  test: (connectionString: string) => Promise<boolean>;
  /** Apply the tenant baseline migration. */
  migrate: (connectionString: string) => Promise<void>;
  /** Envelope-encrypt + persist the string (only reached after test+migrate). */
  store: (workspaceId: string, connectionString: string) => Promise<void>;
  /** Flip the workspace to tenant-DB-ready. */
  markReady: (workspaceId: string) => Promise<void>;
}

export interface ProvisionInput {
  workspaceId: string;
  connectionString: string;
  /** Retry entry point; phases before it are assumed already done. */
  resumeFrom?: ProvisionPhase;
}

export interface ProvisionResult {
  status: "ready" | "error";
  reachedPhase: ProvisionPhase;
  error?: string;
}

const ORDER: ProvisionPhase[] = ["validate", "test", "migrate", "store", "ready"];

/** True when `phase` should run given the resume point. */
function shouldRun(phase: ProvisionPhase, resumeFrom?: ProvisionPhase): boolean {
  if (!resumeFrom) return true;
  return ORDER.indexOf(phase) >= ORDER.indexOf(resumeFrom);
}

export async function provisionTenantDb(
  input: ProvisionInput,
  deps: ProvisionDeps,
): Promise<ProvisionResult> {
  const { workspaceId, connectionString, resumeFrom } = input;
  // Tracks the phase currently executing so a thrown error is attributed correctly.
  let phase: ProvisionPhase = "validate";

  try {
    if (shouldRun("validate", resumeFrom)) {
      phase = "validate";
      const v = deps.validate(connectionString);
      if (!v.ok) {
        return { status: "error", reachedPhase: "validate", error: v.error };
      }
    }
    if (shouldRun("test", resumeFrom)) {
      phase = "test";
      const reachable = await deps.test(connectionString);
      if (!reachable) {
        return {
          status: "error",
          reachedPhase: "test",
          error: "Could not connect to the database with the details provided.",
        };
      }
    }
    if (shouldRun("migrate", resumeFrom)) {
      phase = "migrate";
      await deps.migrate(connectionString);
    }
    if (shouldRun("store", resumeFrom)) {
      phase = "store";
      await deps.store(workspaceId, connectionString);
    }
    phase = "ready";
    await deps.markReady(workspaceId);
    return { status: "ready", reachedPhase: "ready" };
  } catch (err) {
    return {
      status: "error",
      reachedPhase: phase,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
