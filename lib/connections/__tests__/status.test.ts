import { describe, it, expect } from "vitest";
import {
  buildRestoreAssistConnectionStatus,
  buildRestoreAssistConnectionStatusWithProbes,
} from "../status";

const EMPTY_ENV = {} as NodeJS.ProcessEnv;

const FULL_ENV = {
  VERCEL_ENV: "production",
  DATABASE_URL: "postgresql://user:redacted@host/db",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
  NEXTAUTH_SECRET: "nextauth-secret-value",
  NEXTAUTH_URL: "https://restoreassist.example",
  ANTHROPIC_API_KEY: "sk-ant-value",
  ASCORA_API_KEY: "ascora-key",
  ASCORA_API_SECRET: "ascora-secret-value",
  STRIPE_SECRET_KEY: "sk_test_value",
  STRIPE_WEBHOOK_SECRET: "whsec_value",
  RESEND_API_KEY: "re_value",
  LINEAR_API_KEY: "lin_api_value",
  LINEAR_RA_TEAM_ID: "team-uuid",
  GOOGLE_CLIENT_ID: "google-client-id-value",
  GOOGLE_CLIENT_SECRET: "google-client-secret-value",
  GOOGLE_DRIVE_CLIENT_ID: "gdrive-client-id-value",
  GOOGLE_DRIVE_CLIENT_SECRET: "gdrive-client-secret-value",
  XERO_CLIENT_ID: "xero-client-id-value",
  XERO_CLIENT_SECRET: "xero-client-secret-value",
  XERO_WEBHOOK_KEY: "xero-webhook-key-value",
  QUICKBOOKS_CLIENT_ID: "qb-client-id-value",
  QUICKBOOKS_CLIENT_SECRET: "qb-client-secret-value",
  QUICKBOOKS_WEBHOOK_TOKEN: "qb-webhook-token-value",
  MYOB_CLIENT_ID: "myob-client-id-value",
  MYOB_CLIENT_SECRET: "myob-client-secret-value",
  MYOB_WEBHOOK_SECRET: "myob-webhook-secret-value",
  SERVICEM8_CLIENT_ID: "sm8-client-id-value",
  SERVICEM8_CLIENT_SECRET: "sm8-client-secret-value",
  SERVICEM8_WEBHOOK_SECRET: "sm8-webhook-secret-value",
} as NodeJS.ProcessEnv;

describe("buildRestoreAssistConnectionStatus", () => {
  it("reports blocked/unknown states when env is empty", () => {
    const status = buildRestoreAssistConnectionStatus(EMPTY_ENV, "2026-07-02T00:00:00.000Z");
    const byId = Object.fromEntries(status.connections.map((c) => [c.id, c]));

    expect(byId.database.state).toBe("blocked");
    expect(byId.supabase.state).toBe("blocked");
    expect(byId.auth.state).toBe("blocked");
    expect(byId.ai_anthropic.state).toBe("blocked");
    expect(byId.ascora.state).toBe("blocked");
    expect(byId.stripe.state).toBe("blocked");
    expect(byId.sentry.state).toBe("unknown");
    expect(byId.google_oauth.state).toBe("blocked");
    expect(byId.google_drive.state).toBe("blocked");
    expect(byId.xero.state).toBe("blocked");
    expect(byId.quickbooks.state).toBe("blocked");
    expect(byId.myob.state).toBe("blocked");
    expect(byId.servicem8.state).toBe("blocked");
    expect(byId.unite_group.state).toBe("ready");
    expect(status.summary.total).toBe(status.connections.length);
    expect(status.summary.blocked).toBeGreaterThan(0);
  });

  it("reports connected/ready states with a fully configured env", () => {
    const status = buildRestoreAssistConnectionStatus(FULL_ENV, "2026-07-02T00:00:00.000Z");
    const byId = Object.fromEntries(status.connections.map((c) => [c.id, c]));

    expect(byId.database.state).toBe("connected");
    expect(byId.supabase.state).toBe("connected");
    expect(byId.auth.state).toBe("connected");
    expect(byId.sentry.state).toBe("unknown");
    expect(byId.ai_anthropic.state).toBe("ready");
    expect(byId.ascora.state).toBe("ready");
    expect(byId.stripe.state).toBe("ready");
    expect(byId.linear.state).toBe("ready");
    expect(byId.google_oauth.state).toBe("ready");
    expect(byId.google_drive.state).toBe("ready");
    expect(byId.xero.state).toBe("ready");
    expect(byId.quickbooks.state).toBe("ready");
    expect(byId.myob.state).toBe("ready");
    expect(byId.servicem8.state).toBe("ready");
    expect(status.project.environment).toBe("production");
    expect(status.summary.blocked).toBe(0);
  });

  it("labels every check with its verification method", () => {
    const status = buildRestoreAssistConnectionStatus(FULL_ENV, "2026-07-02T00:00:00.000Z");
    const byId = Object.fromEntries(status.connections.map((c) => [c.id, c]));

    for (const connection of status.connections) {
      expect(["env-presence", "live-probe", "db-config"]).toContain(connection.method);
    }
    // No probes ran, so nothing may claim live verification.
    expect(status.connections.some((c) => c.method === "live-probe")).toBe(false);
    // DR-NRPG credentials are per-user DB rows, not env vars.
    expect(byId.dr_nrpg.method).toBe("db-config");
    expect(byId.dr_nrpg.state).toBe("unknown");
  });

  it("falls back to the shared Google pair for Drive when GOOGLE_DRIVE_* is unset", () => {
    const env = {
      GOOGLE_CLIENT_ID: "google-client-id-value",
      GOOGLE_CLIENT_SECRET: "google-client-secret-value",
    } as NodeJS.ProcessEnv;
    const status = buildRestoreAssistConnectionStatus(env, "2026-07-02T00:00:00.000Z");
    const drive = status.connections.find((c) => c.id === "google_drive");

    expect(drive?.state).toBe("ready");
  });

  it("flags a missing Stripe webhook secret without blocking", () => {
    const env = { ...FULL_ENV, STRIPE_WEBHOOK_SECRET: "" } as NodeJS.ProcessEnv;
    const status = buildRestoreAssistConnectionStatus(env, "2026-07-02T00:00:00.000Z");
    const stripe = status.connections.find((c) => c.id === "stripe");

    expect(stripe?.state).toBe("ready");
    expect(stripe?.nextAction).toBe("Set STRIPE_WEBHOOK_SECRET.");
  });

  it("flags missing webhook credentials on the accounting connectors without blocking", () => {
    const env = {
      ...FULL_ENV,
      XERO_WEBHOOK_KEY: "",
      QUICKBOOKS_WEBHOOK_TOKEN: "",
      MYOB_WEBHOOK_SECRET: "",
      SERVICEM8_WEBHOOK_SECRET: "",
    } as NodeJS.ProcessEnv;
    const status = buildRestoreAssistConnectionStatus(env, "2026-07-02T00:00:00.000Z");
    const byId = Object.fromEntries(status.connections.map((c) => [c.id, c]));

    expect(byId.xero.state).toBe("ready");
    expect(byId.xero.nextAction).toBe("Set XERO_WEBHOOK_KEY.");
    expect(byId.quickbooks.state).toBe("ready");
    expect(byId.quickbooks.nextAction).toBe("Set QUICKBOOKS_WEBHOOK_TOKEN.");
    expect(byId.myob.state).toBe("ready");
    expect(byId.myob.nextAction).toBe("Set MYOB_WEBHOOK_SECRET.");
    expect(byId.servicem8.state).toBe("ready");
    expect(byId.servicem8.nextAction).toBe("Set SERVICEM8_WEBHOOK_SECRET.");
  });

  it("never leaks secret values into the payload", () => {
    const status = buildRestoreAssistConnectionStatus(FULL_ENV, "2026-07-02T00:00:00.000Z");
    const serialized = JSON.stringify(status);

    for (const secret of [
      "sk-ant-value",
      "sk_test_value",
      "whsec_value",
      "re_value",
      "anon-key-value",
      "nextauth-secret-value",
      "ascora-secret-value",
      "lin_api_value",
      "redacted",
      "google-client-secret-value",
      "gdrive-client-secret-value",
      "xero-client-secret-value",
      "qb-client-secret-value",
      "myob-client-secret-value",
      "sm8-client-secret-value",
      "xero-webhook-key-value",
      "qb-webhook-token-value",
      "myob-webhook-secret-value",
      "sm8-webhook-secret-value",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe("buildRestoreAssistConnectionStatusWithProbes", () => {
  const NOW = "2026-07-02T00:00:00.000Z";

  it("labels probed connections live-probe and leaves the rest env-presence", async () => {
    const status = await buildRestoreAssistConnectionStatusWithProbes(FULL_ENV, NOW, {
      database: async () => {},
      stripe: async () => {},
      email: async () => {},
    });
    const byId = Object.fromEntries(status.connections.map((c) => [c.id, c]));

    expect(byId.database.method).toBe("live-probe");
    expect(byId.database.state).toBe("connected");
    expect(byId.stripe.method).toBe("live-probe");
    expect(byId.stripe.state).toBe("ready");
    expect(byId.email.method).toBe("live-probe");
    expect(byId.email.state).toBe("ready");
    // Non-probed checks keep the honest env-presence label.
    expect(byId.supabase.method).toBe("env-presence");
    expect(byId.ascora.method).toBe("env-presence");
  });

  it("reports a failing probe as degraded instead of throwing", async () => {
    const status = await buildRestoreAssistConnectionStatusWithProbes(FULL_ENV, NOW, {
      database: async () => {},
      stripe: async () => {
        throw new Error("provider responded 401");
      },
      email: async () => {},
    });
    const byId = Object.fromEntries(status.connections.map((c) => [c.id, c]));

    expect(byId.stripe.state).toBe("degraded");
    expect(byId.stripe.method).toBe("live-probe");
    expect(byId.stripe.detail).toContain("provider responded 401");
    expect(status.summary.degraded).toBe(1);
  });

  it("reports a hung probe as degraded via the timeout", async () => {
    const status = await buildRestoreAssistConnectionStatusWithProbes(
      FULL_ENV,
      NOW,
      {
        database: () => new Promise<void>(() => {}), // never settles
        stripe: async () => {},
        email: async () => {},
      },
      25, // short timeout to keep the test fast
    );
    const database = status.connections.find((c) => c.id === "database");

    expect(database?.state).toBe("degraded");
    expect(database?.method).toBe("live-probe");
    expect(database?.detail).toContain("probe timed out");
  });

  it("does not echo raw provider error text into the payload", async () => {
    const status = await buildRestoreAssistConnectionStatusWithProbes(FULL_ENV, NOW, {
      database: async () => {},
      stripe: async () => {},
      email: async () => {
        throw new Error("ECONNREFUSED api.resend.com sk_live_leaky_detail");
      },
    });
    const serialized = JSON.stringify(status);

    expect(serialized).not.toContain("ECONNREFUSED");
    expect(serialized).not.toContain("sk_live_leaky_detail");
    expect(status.connections.find((c) => c.id === "email")?.detail).toContain(
      "probe failed",
    );
  });

  it("skips probes for connections whose credential is absent", async () => {
    const env = { ...FULL_ENV, STRIPE_SECRET_KEY: "" } as NodeJS.ProcessEnv;
    let stripeProbed = false;
    const status = await buildRestoreAssistConnectionStatusWithProbes(env, NOW, {
      database: async () => {},
      stripe: async () => {
        stripeProbed = true;
      },
      email: async () => {},
    });
    const stripe = status.connections.find((c) => c.id === "stripe");

    expect(stripeProbed).toBe(false);
    expect(stripe?.state).toBe("blocked");
    expect(stripe?.method).toBe("env-presence");
  });
});
