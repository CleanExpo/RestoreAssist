import { describe, it, expect } from "vitest";
import { buildRestoreAssistConnectionStatus } from "../status";

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
  SENTRY_DSN: "https://abc@sentry.example/1",
  LINEAR_API_KEY: "lin_api_value",
  LINEAR_RA_TEAM_ID: "team-uuid",
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
    expect(byId.sentry.state).toBe("connected");
    expect(byId.ai_anthropic.state).toBe("ready");
    expect(byId.ascora.state).toBe("ready");
    expect(byId.stripe.state).toBe("ready");
    expect(byId.linear.state).toBe("ready");
    expect(status.project.environment).toBe("production");
    expect(status.summary.blocked).toBe(0);
  });

  it("flags a missing Stripe webhook secret without blocking", () => {
    const env = { ...FULL_ENV, STRIPE_WEBHOOK_SECRET: "" } as NodeJS.ProcessEnv;
    const status = buildRestoreAssistConnectionStatus(env, "2026-07-02T00:00:00.000Z");
    const stripe = status.connections.find((c) => c.id === "stripe");

    expect(stripe?.state).toBe("ready");
    expect(stripe?.nextAction).toBe("Set STRIPE_WEBHOOK_SECRET.");
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
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
