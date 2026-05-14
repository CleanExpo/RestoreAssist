/**
 * Vercel BotID — server-side bot detection.
 *
 * Replaces the prior Cloudflare Turnstile verifier (lib/turnstile.ts, removed).
 * BotID is native to Vercel: no separate account, no env vars to manage on the
 * platform side. Detection signal is collected client-side by <BotIdClient />
 * and verified server-side via checkBotId().
 *
 * Behaviour parity with the old Turnstile gate (RA-1286):
 *   - Production: bot signal → { ok: false, reason: "Bot detected" }
 *   - Dev / preview: BotID returns bypassed=true via its built-in dev gate
 *     (NODE_ENV !== "production"), so this returns { ok: true, disabled: true }
 *
 * Docs: https://vercel.com/docs/vercel-botid
 */
import { checkBotId } from "botid/server";

export type BotIdResult =
  | { ok: true; disabled?: boolean }
  | { ok: false; reason: string };

/**
 * Verify the incoming request isn't a bot. Returns { ok: true } on success.
 * No token is passed in — BotID reads its own client-injected signal from
 * the request headers automatically.
 */
export async function verifyBotId(): Promise<BotIdResult> {
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
