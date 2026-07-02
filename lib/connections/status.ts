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
  | "unite_group";

export type RestoreAssistConnectionState =
  | "connected"
  | "ready"
  | "mock"
  | "blocked"
  | "unknown";

export type RestoreAssistConnection = {
  id: RestoreAssistConnectionId;
  label: string;
  state: RestoreAssistConnectionState;
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
    unknown: connections.filter((c) => c.state === "unknown").length,
  };
}

/**
 * Presence-only readiness manifest for Unite-Group Mission Control polling.
 * States are derived from env-var presence, never from secret values, and no
 * secret material is ever included in the payload. "connected" is reserved
 * for infrastructure the app cannot boot without; integrations whose live
 * use is still gated report "ready" at best.
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

  const connections: RestoreAssistConnection[] = [
    {
      id: "database",
      label: "Primary database (Prisma)",
      state: databaseReady ? "connected" : "blocked",
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
      safeForMissionControl: true,
      detail: linearReady
        ? "Linear key and RA team id present for ticket routing."
        : "LINEAR_API_KEY and LINEAR_RA_TEAM_ID are required to file work.",
      nextAction: linearReady ? undefined : "Set the Linear intake env pair.",
    },
    {
      id: "unite_group",
      label: "Unite-Group Mission Control",
      state: "ready",
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
