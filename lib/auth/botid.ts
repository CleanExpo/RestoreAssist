/**
 * Vercel BotID — server-side bot detection.
 *
 * Replaces the prior Cloudflare Turnstile verifier (lib/turnstile.ts, removed).
 * BotID is native to Vercel: no separate account, no env vars to manage on the
 * platform side. Detection signal is collected client-side by <BotIdClient />
 * and verified server-side via checkBotId().
 *
 * Behaviour parity with the old Turnstile gate (RA-1286):
 *   - Production (restoreassist.app): bot signal → { ok: false, reason: "Bot detected" }
 *   - Sandbox (restoreassist-sandbox.vercel.app): bypassed — feeds the @smoke suite
 *   - Dev / preview (NODE_ENV !== "production"): bypassed via BotID's built-in gate
 *
 * Docs: https://vercel.com/docs/vercel-botid
 */
import { headers } from "next/headers";
import { timingSafeEqual } from "crypto";
import { checkBotId } from "botid/server";

export type BotIdResult =
  | { ok: true; disabled?: boolean }
  | { ok: false; reason: string };

/**
 * RA-4987 — prod-half smoke bypass.
 *
 * The preview/sandbox cascade in verifyBotId() only fires off production.
 * `smoke-prod.yml` runs the @smoke suite against https://restoreassist.app
 * every 15 min from GitHub Actions egress IPs, which BotID flags as bots —
 * the same failure that produced 30+ red runs before 2026-05-18.
 *
 * The fix is a secret-gated header, NOT an IP allowlist (GH egress IPs
 * rotate and can't be verified). A request that carries
 * `x-smoke-test-token` matching `SMOKE_TEST_BOT_BYPASS_SECRET` skips the
 * gate. Protect the secret like a webhook secret — anyone holding it can
 * bypass BotID on prod.
 *
 * Fail-closed: when the env var is unset/empty there is NO bypass path —
 * the header is ignored and the real BotID signal is checked. This mirrors
 * the CRON_SECRET policy in lib/cron/auth.ts (RA-6679).
 */
const SMOKE_TOKEN_HEADER = "x-smoke-test-token";

async function hasValidSmokeToken(): Promise<boolean> {
  const secret = process.env.SMOKE_TEST_BOT_BYPASS_SECRET;
  // Fail CLOSED — no secret configured means no bypass is possible, even if
  // a caller sends the header.
  if (!secret) {
    return false;
  }
  try {
    const h = await headers();
    const token = h.get(SMOKE_TOKEN_HEADER) ?? "";
    // Constant-time compare to avoid a timing oracle on the secret. Guard the
    // length first because timingSafeEqual throws on unequal buffer lengths —
    // same pattern as lib/cron/auth.ts and lib/portal-token.ts.
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(secret, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    // headers() throws in non-request contexts (e.g. cron). No bypass.
    return false;
  }
}

/**
 * Hostnames that bypass the BotID gate. Sandbox host is explicit; we do
 * NOT bypass on `restoreassist.app` (production) or any other host.
 *
 * RA-4986 — the bypass cascade tried in order:
 *   1. `VERCEL_ENV=preview` (Vercel preview deploy, e.g. PR previews)
 *   2. Request host is on SANDBOX_HOSTS (sandbox project deployments —
 *      VERCEL_ENV=production there too, so the env check alone misses it)
 *   3. Vercel BotID's own `verification.bypassed` (dev gate)
 */
const SANDBOX_HOSTS = new Set<string>([
  "restoreassist-sandbox.vercel.app",
]);

async function isSandboxHost(): Promise<boolean> {
  try {
    const h = await headers();
    const host = h.get("host") || h.get("x-forwarded-host") || "";
    // Exact-match against the allowlist. Wildcard subdomain matches are
    // intentionally NOT supported — preview-deploy URLs of the form
    // `restoreassist-sandbox-<hash>-unite-group.vercel.app` are correctly
    // handled by the VERCEL_ENV=preview branch below; only the canonical
    // sandbox alias hits this branch.
    return SANDBOX_HOSTS.has(host.toLowerCase());
  } catch {
    // headers() throws in non-request contexts (e.g. cron). Fall through.
    return false;
  }
}

/**
 * Verify the incoming request isn't a bot. Returns { ok: true } on success.
 * No token is passed in — BotID reads its own client-injected signal from
 * the request headers automatically.
 */
export async function verifyBotId(): Promise<BotIdResult> {
  // RA-4986 — sandbox/preview bypass cascade.
  if (process.env.VERCEL_ENV === "preview") {
    return { ok: true, disabled: true };
  }
  if (await isSandboxHost()) {
    return { ok: true, disabled: true };
  }
  // RA-4987 — secret-gated prod smoke bypass. Audit-logged so every
  // header-bypass is visible in Vercel Observability.
  if (await hasValidSmokeToken()) {
    console.warn(
      JSON.stringify({
        event: "botid.smoke_bypass",
        reason: "valid x-smoke-test-token header",
        vercelEnv: process.env.VERCEL_ENV ?? null,
      }),
    );
    return { ok: true, disabled: true };
  }
  try {
    const verification = await checkBotId();
    if (verification.bypassed) {
      // Dev / preview pass-through. Matches the previous Turnstile dev
      // soft-allow behaviour.
      return { ok: true, disabled: true };
    }
    if (verification.isBot) {
      return { ok: false, reason: "Bot detected" };
    }
    return { ok: true };
  } catch (err) {
    // Fail-closed on verifier outage — matches the prior Turnstile policy
    // (the whole point of the gate is to be strict during abuse spikes).
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Bot verification error: ${msg}` };
  }
}
