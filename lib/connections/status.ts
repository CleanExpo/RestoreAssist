export type RestoreAssistConnectionId =
  | "database"
  | "supabase"
  | "auth"
  | "ai_anthropic"
  | "ascora"
  | "stripe"
  | "email"
  | "sentry"
  | "linear"
  | "google_oauth"
  | "google_drive"
  | "xero"
  | "quickbooks"
  | "myob"
  | "servicem8"
  | "dr_nrpg"
  | "unite_group";

export type RestoreAssistConnectionState =
  | "connected"
  | "ready"
  | "mock"
  | "blocked"
  | "degraded"
  | "unknown";

/**
 * How a connection's state was determined.
 * - "env-presence": the required environment variables exist. Says NOTHING
 *   about whether the provider is actually reachable or the credential valid.
 * - "live-probe": a cheap authenticated call to the provider succeeded (or
 *   failed, downgrading the state to "degraded") within the probe timeout.
 * - "db-config": credentials live per-user in the database, so neither env
 *   presence nor a single global probe applies.
 */
export type RestoreAssistConnectionMethod =
  | "env-presence"
  | "live-probe"
  | "db-config";

export type RestoreAssistConnection = {
  id: RestoreAssistConnectionId;
  label: string;
  state: RestoreAssistConnectionState;
  method: RestoreAssistConnectionMethod;
  safeForMissionControl: boolean;
  detail: string;
  endpoint?: string;
  nextAction?: string;
};

export type RestoreAssistConnectionStatus = {
  source: "restoreassist:connection-status";
  generatedAt: string;
  project: {
    slug: "restoreassist";
    repo: "CleanExpo/RestoreAssist";
    service: "restoreassist-web";
    environment: string;
  };
  summary: Record<RestoreAssistConnectionState, number> & { total: number };
  connections: RestoreAssistConnection[];
};

function envSet(name: string, env: NodeJS.ProcessEnv): boolean {
  return Boolean(env[name]?.trim());
}

function connectionSummary(
  connections: RestoreAssistConnection[],
): RestoreAssistConnectionStatus["summary"] {
  return {
    total: connections.length,
    connected: connections.filter((c) => c.state === "connected").length,
    ready: connections.filter((c) => c.state === "ready").length,
    mock: connections.filter((c) => c.state === "mock").length,
    blocked: connections.filter((c) => c.state === "blocked").length,
    degraded: connections.filter((c) => c.state === "degraded").length,
    unknown: connections.filter((c) => c.state === "unknown").length,
  };
}

/**
 * Presence-only readiness manifest for Unite-Group Mission Control polling.
 * States are derived from env-var presence, never from secret values, and no
 * secret material is ever included in the payload. "connected" is reserved
 * for infrastructure the app cannot boot without; integrations whose live
 * use is still gated report "ready" at best.
 *
 * Every connection carries a `method` label so consumers can distinguish
 * "the env var exists" from "we actually reached the provider". Use
 * buildRestoreAssistConnectionStatusWithProbes for live verification of the
 * cheap, safe probe targets (database, Stripe, Resend).
 */
export function buildRestoreAssistConnectionStatus(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
): RestoreAssistConnectionStatus {
  const environment = env.VERCEL_ENV?.trim() || env.NODE_ENV?.trim() || "development";

  const databaseReady = envSet("DATABASE_URL", env);
  const supabaseReady =
    envSet("NEXT_PUBLIC_SUPABASE_URL", env) && envSet("NEXT_PUBLIC_SUPABASE_ANON_KEY", env);
  const authReady = envSet("NEXTAUTH_SECRET", env) && envSet("NEXTAUTH_URL", env);
  const anthropicReady = envSet("ANTHROPIC_API_KEY", env);
  const ascoraReady = envSet("ASCORA_API_KEY", env) && envSet("ASCORA_API_SECRET", env);
  const stripeReady = envSet("STRIPE_SECRET_KEY", env);
  const stripeWebhookReady = envSet("STRIPE_WEBHOOK_SECRET", env);
  const emailReady = envSet("RESEND_API_KEY", env);
  const sentryReady = envSet("SENTRY_DSN", env) || envSet("NEXT_PUBLIC_SENTRY_DSN", env);
  const linearReady = envSet("LINEAR_API_KEY", env) && envSet("LINEAR_RA_TEAM_ID", env);

  // Google sign-in provider pair — read by lib/auth.ts (GoogleProvider).
  const googleOauthReady =
    envSet("GOOGLE_CLIENT_ID", env) && envSet("GOOGLE_CLIENT_SECRET", env);
  // Google Drive org OAuth — app/api/oauth/google-drive/{start,callback}
  // fall back to the shared Google pair when the Drive-specific pair is unset.
  const googleDriveReady =
    (envSet("GOOGLE_DRIVE_CLIENT_ID", env) || envSet("GOOGLE_CLIENT_ID", env)) &&
    (envSet("GOOGLE_DRIVE_CLIENT_SECRET", env) || envSet("GOOGLE_CLIENT_SECRET", env));

  // Accounting / field-service OAuth apps — lib/integrations/base-client.ts
  // getClientId/getClientSecret read `${provider}_CLIENT_ID` / `_CLIENT_SECRET`.
  const xeroReady = envSet("XERO_CLIENT_ID", env) && envSet("XERO_CLIENT_SECRET", env);
  const xeroWebhookReady = envSet("XERO_WEBHOOK_KEY", env);
  const quickbooksReady =
    envSet("QUICKBOOKS_CLIENT_ID", env) && envSet("QUICKBOOKS_CLIENT_SECRET", env);
  const quickbooksWebhookReady = envSet("QUICKBOOKS_WEBHOOK_TOKEN", env);
  const myobReady = envSet("MYOB_CLIENT_ID", env) && envSet("MYOB_CLIENT_SECRET", env);
  const myobWebhookReady = envSet("MYOB_WEBHOOK_SECRET", env);
  const servicem8Ready =
    envSet("SERVICEM8_CLIENT_ID", env) && envSet("SERVICEM8_CLIENT_SECRET", env);
  const servicem8WebhookReady = envSet("SERVICEM8_WEBHOOK_SECRET", env);

  const connections: RestoreAssistConnection[] = [
    {
      id: "database",
      label: "Primary database (Prisma)",
      state: databaseReady ? "connected" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: databaseReady
        ? "DATABASE_URL is configured; metadata only exposed."
        : "DATABASE_URL is not set — Prisma cannot connect.",
      nextAction: databaseReady ? undefined : "Set DATABASE_URL in the deploy environment.",
    },
    {
      id: "supabase",
      label: "Supabase",
      state: supabaseReady ? "connected" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: supabaseReady
        ? "Supabase URL and anon key are present."
        : "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
      nextAction: supabaseReady ? undefined : "Set the Supabase public env pair.",
    },
    {
      id: "auth",
      label: "Authentication (NextAuth)",
      state: authReady ? "connected" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: authReady
        ? "NextAuth secret and canonical URL are present."
        : "NEXTAUTH_SECRET and NEXTAUTH_URL are required for sign-in.",
      nextAction: authReady ? undefined : "Set NEXTAUTH_SECRET and NEXTAUTH_URL.",
    },
    {
      id: "ai_anthropic",
      label: "Anthropic AI",
      state: anthropicReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: anthropicReady
        ? "Anthropic key present; AI features can run (billing applies on use)."
        : "ANTHROPIC_API_KEY is not set — AI features degrade.",
      nextAction: anthropicReady ? undefined : "Set ANTHROPIC_API_KEY.",
    },
    {
      id: "ascora",
      label: "Ascora job management",
      state: ascoraReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: ascoraReady
        ? "Ascora API credential pair present; live sync remains verification-gated."
        : "ASCORA_API_KEY and ASCORA_API_SECRET are required for job sync.",
      nextAction: ascoraReady ? undefined : "Provision Ascora API credentials.",
    },
    {
      id: "stripe",
      label: "Payments (Stripe)",
      state: stripeReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: stripeReady
        ? stripeWebhookReady
          ? "Stripe secret and webhook secret present; production checkout remains human-gated."
          : "Stripe secret present but STRIPE_WEBHOOK_SECRET is missing — webhooks will fail."
        : "STRIPE_SECRET_KEY is not set.",
      nextAction: stripeReady
        ? stripeWebhookReady
          ? undefined
          : "Set STRIPE_WEBHOOK_SECRET."
        : "Set the Stripe key pair.",
    },
    {
      id: "email",
      label: "Transactional email (Resend)",
      state: emailReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: emailReady
        ? "Resend key present; sends remain policy-gated."
        : "RESEND_API_KEY is not set — no transactional email.",
      nextAction: emailReady ? undefined : "Set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    },
    {
      id: "sentry",
      label: "Error monitoring (Sentry)",
      state: sentryReady ? "connected" : "unknown",
      method: "env-presence",
      safeForMissionControl: true,
      detail: sentryReady
        ? "Sentry DSN present; client/edge/server configs ship in this repo."
        : "No Sentry DSN detected — errors are not being reported.",
      nextAction: sentryReady ? undefined : "Set SENTRY_DSN (and NEXT_PUBLIC_SENTRY_DSN).",
    },
    {
      id: "linear",
      label: "Linear intake",
      state: linearReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: linearReady
        ? "Linear key and RA team id present for ticket routing."
        : "LINEAR_API_KEY and LINEAR_RA_TEAM_ID are required to file work.",
      nextAction: linearReady ? undefined : "Set the Linear intake env pair.",
    },
    {
      id: "google_oauth",
      label: "Google sign-in (OAuth)",
      state: googleOauthReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: googleOauthReady
        ? "Google OAuth client pair present; 'Continue with Google' can run."
        : "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for Google sign-in.",
      nextAction: googleOauthReady ? undefined : "Set the Google OAuth client pair.",
    },
    {
      id: "google_drive",
      label: "Google Drive storage (org OAuth)",
      state: googleDriveReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: googleDriveReady
        ? "Drive OAuth client pair present (GOOGLE_DRIVE_* or shared GOOGLE_* fallback)."
        : "GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET (or the shared GOOGLE_* pair) are required for org Drive storage.",
      nextAction: googleDriveReady ? undefined : "Set the Google Drive OAuth client pair.",
    },
    {
      id: "xero",
      label: "Xero accounting",
      state: xeroReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: xeroReady
        ? xeroWebhookReady
          ? "Xero OAuth client pair and webhook key present."
          : "Xero OAuth client pair present but XERO_WEBHOOK_KEY is missing — invoice/payment webhooks will fail."
        : "XERO_CLIENT_ID and XERO_CLIENT_SECRET are required for the Xero connect flow.",
      nextAction: xeroReady
        ? xeroWebhookReady
          ? undefined
          : "Set XERO_WEBHOOK_KEY."
        : "Set the Xero OAuth client pair.",
    },
    {
      id: "quickbooks",
      label: "QuickBooks accounting",
      state: quickbooksReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: quickbooksReady
        ? quickbooksWebhookReady
          ? "QuickBooks OAuth client pair and webhook verifier token present."
          : "QuickBooks OAuth client pair present but QUICKBOOKS_WEBHOOK_TOKEN is missing — webhooks will fail."
        : "QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET are required for the QuickBooks connect flow.",
      nextAction: quickbooksReady
        ? quickbooksWebhookReady
          ? undefined
          : "Set QUICKBOOKS_WEBHOOK_TOKEN."
        : "Set the QuickBooks OAuth client pair.",
    },
    {
      id: "myob",
      label: "MYOB accounting",
      state: myobReady ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: myobReady
        ? myobWebhookReady
          ? "MYOB OAuth client pair and webhook secret present."
          : "MYOB OAuth client pair present but MYOB_WEBHOOK_SECRET is missing — webhooks will fail."
        : "MYOB_CLIENT_ID and MYOB_CLIENT_SECRET are required for the MYOB connect flow.",
      nextAction: myobReady
        ? myobWebhookReady
          ? undefined
          : "Set MYOB_WEBHOOK_SECRET."
        : "Set the MYOB OAuth client pair.",
    },
    {
      id: "servicem8",
      label: "ServiceM8 field service",
      state: servicem8Ready ? "ready" : "blocked",
      method: "env-presence",
      safeForMissionControl: true,
      detail: servicem8Ready
        ? servicem8WebhookReady
          ? "ServiceM8 OAuth client pair and webhook secret present."
          : "ServiceM8 OAuth client pair present but SERVICEM8_WEBHOOK_SECRET is missing — webhooks will fail."
        : "SERVICEM8_CLIENT_ID and SERVICEM8_CLIENT_SECRET are required for the ServiceM8 connect flow.",
      nextAction: servicem8Ready
        ? servicem8WebhookReady
          ? undefined
          : "Set SERVICEM8_WEBHOOK_SECRET."
        : "Set the ServiceM8 OAuth client pair.",
    },
    {
      id: "dr_nrpg",
      label: "DR-NRPG job dispatch",
      state: "unknown",
      method: "db-config",
      safeForMissionControl: true,
      detail:
        "DR-NRPG credentials are stored per-user in the database (DrNrpgIntegration.drNrpgApiKey), not in environment variables, so global env presence does not apply. Key liveness is verified daily by the dr-nrpg-liveness cron.",
      endpoint: "/api/dr-nrpg/connect",
    },
    {
      id: "unite_group",
      label: "Unite-Group Mission Control",
      state: "ready",
      method: "env-presence",
      safeForMissionControl: true,
      detail:
        "This manifest is designed for Unite-Group to poll and show RestoreAssist readiness without secrets.",
      endpoint: "/api/v1/connections/status",
      nextAction: "Add this endpoint to the Unite-Group project registry.",
    },
  ];

  return {
    source: "restoreassist:connection-status",
    generatedAt: now,
    project: {
      slug: "restoreassist",
      repo: "CleanExpo/RestoreAssist",
      service: "restoreassist-web",
      environment,
    },
    summary: connectionSummary(connections),
    connections,
  };
}

// ---------------------------------------------------------------------------
// Live probes (opt-in via ?probe=1 on the status route)
// ---------------------------------------------------------------------------

export const CONNECTION_PROBE_TIMEOUT_MS = 3000;

/**
 * Injectable probe functions. Each must resolve on success and reject on
 * failure. Defaults hit the real providers; tests inject fakes.
 */
export interface ConnectionProbes {
  /** Prisma `SELECT 1`. */
  database?: () => Promise<void>;
  /** Stripe balance retrieve (read-only, no side effects). */
  stripe?: () => Promise<void>;
  /** Resend domain list (read-only, no side effects). */
  email?: () => Promise<void>;
}

class ProbeTimeoutError extends Error {
  constructor() {
    super("probe timed out");
    this.name = "ProbeTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProbeTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function defaultDatabaseProbe(): Promise<void> {
  // Dynamic import keeps this module import-side-effect-free for consumers
  // (and tests) that only need the env-presence builder.
  const { prisma } = await import("@/lib/prisma");
  await prisma.$queryRaw`SELECT 1`;
}

function bearerFetchProbe(
  url: string,
  token: string,
  timeoutMs: number,
): () => Promise<void> {
  return async () => {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      // Deliberately generic — no provider response body in the payload.
      throw new Error(`provider responded ${response.status}`);
    }
  };
}

type ProbeOutcome = { ok: boolean; reason?: string };

async function runProbe(
  probe: () => Promise<void>,
  timeoutMs: number,
): Promise<ProbeOutcome> {
  try {
    await withTimeout(probe(), timeoutMs);
    return { ok: true };
  } catch (error) {
    // Failures are reported, never thrown, and never echo raw provider or
    // driver error text into the payload.
    if (
      error instanceof ProbeTimeoutError ||
      (error as Error | null)?.name === "TimeoutError"
    ) {
      return { ok: false, reason: "probe timed out" };
    }
    if (error instanceof Error && /^provider responded \d{3}$/.test(error.message)) {
      return { ok: false, reason: error.message };
    }
    return { ok: false, reason: "probe failed" };
  }
}

function applyProbeOutcome(
  connection: RestoreAssistConnection,
  outcome: ProbeOutcome,
  successDetail: string,
): void {
  connection.method = "live-probe";
  if (outcome.ok) {
    connection.detail = successDetail;
    connection.nextAction = undefined;
    return;
  }
  connection.state = "degraded";
  connection.detail = `Live probe failed (${outcome.reason}); credential is present but the provider was not reachable or rejected it.`;
  connection.nextAction = "Investigate provider availability and credential validity.";
}

/**
 * Env-presence manifest upgraded with cheap, safe live probes for the
 * connections we can verify without side effects: database (SELECT 1),
 * Stripe (balance retrieve), Resend (domain list). Probes only run when the
 * corresponding credential is present; each is bounded by a short timeout and
 * a failure downgrades the connection to "degraded" — never throws.
 */
export async function buildRestoreAssistConnectionStatusWithProbes(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date().toISOString(),
  probes: ConnectionProbes = {},
  timeoutMs = CONNECTION_PROBE_TIMEOUT_MS,
): Promise<RestoreAssistConnectionStatus> {
  const status = buildRestoreAssistConnectionStatus(env, now);
  const byId = new Map(status.connections.map((c) => [c.id, c]));

  const targets: Array<{
    connection: RestoreAssistConnection | undefined;
    enabled: boolean;
    probe: () => Promise<void>;
    successDetail: string;
  }> = [
    {
      connection: byId.get("database"),
      enabled: envSet("DATABASE_URL", env),
      probe: probes.database ?? defaultDatabaseProbe,
      successDetail: "Live probe passed: Prisma SELECT 1 succeeded.",
    },
    {
      connection: byId.get("stripe"),
      enabled: envSet("STRIPE_SECRET_KEY", env),
      probe:
        probes.stripe ??
        bearerFetchProbe(
          "https://api.stripe.com/v1/balance",
          env.STRIPE_SECRET_KEY ?? "",
          timeoutMs,
        ),
      successDetail: "Live probe passed: Stripe balance endpoint accepted the key.",
    },
    {
      connection: byId.get("email"),
      enabled: envSet("RESEND_API_KEY", env),
      probe:
        probes.email ??
        bearerFetchProbe(
          "https://api.resend.com/domains",
          env.RESEND_API_KEY ?? "",
          timeoutMs,
        ),
      successDetail: "Live probe passed: Resend domains endpoint accepted the key.",
    },
  ];

  await Promise.all(
    targets.map(async ({ connection, enabled, probe, successDetail }) => {
      if (!connection || !enabled) return;
      const outcome = await runProbe(probe, timeoutMs);
      applyProbeOutcome(connection, outcome, successDetail);
    }),
  );

  status.summary = connectionSummary(status.connections);
  return status;
}
