/**
 * Founder signup alert — launch-night Unit 4.
 *
 * `notifyWelcome` (lib/notifications.ts) creates an in-app notification for
 * the NEW USER. Nothing told the founder. On a launch night that means real
 * signups land silently and the only way to discover a customer exists is to
 * query the database by hand the next morning.
 *
 * This closes that loop with the smallest possible surface:
 *
 *   - Recipient is `SIGNUP_ALERT_EMAIL`. Unset => documented NO-OP, exactly
 *     like `CRON_ALERT_EMAIL` in app/api/cron/cron-watchdog/route.ts. We do
 *     not fall back to a public support address: silently mailing signup PII
 *     somewhere the operator did not nominate is worse than not mailing.
 *   - It NEVER throws. The only caller is the signup path, and an alert that
 *     can break the money path it exists to watch is worse than no alert.
 *     Every failure is swallowed into a structured result and logged.
 *
 * Requires a transactional email provider (MAILTRAP_API_KEY + SENDER_EMAIL,
 * or RESEND_API_KEY + RESEND_FROM_EMAIL). Without one `sendTransactionalEmail`
 * returns a `not_configured` error and this reports `sent: false`.
 */

import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { sanitiseEmailField } from "@/lib/email/sanitise-header";

export interface FounderSignupAlertInput {
  userId: string;
  name: string;
  email: string;
  trialEndsAt: Date | null;
  creditsRemaining: number;
}

export type FounderSignupAlertResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "send_failed" };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendFounderSignupAlert(
  input: FounderSignupAlertInput,
): Promise<FounderSignupAlertResult> {
  const to = process.env.SIGNUP_ALERT_EMAIL?.trim();
  if (!to) {
    console.warn(
      "[signup-alert] SIGNUP_ALERT_EMAIL unset — new signup NOT announced:",
      input.email,
    );
    return { sent: false, reason: "not_configured" };
  }

  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const trialEnds = input.trialEndsAt
    ? input.trialEndsAt.toISOString().slice(0, 10)
    : "unknown";

  try {
    const result = await sendTransactionalEmail({
      to,
      // The address is in the subject so the founder can triage — and reply —
      // from a phone notification without opening anything.
      //
      // sanitiseEmailField folds CR/LF to spaces. The subject is a HEADER, and
      // the values reaching it are attacker-chosen: sanitizeString() in the
      // register route strips tags and null bytes but NOT embedded newlines.
      // Low real-world risk (the provider takes JSON, not raw SMTP) — but this
      // is a header boundary, so it gets the header sanitiser.
      subject: sanitiseEmailField(
        `New RestoreAssist signup: ${input.name} <${input.email}>`,
      ),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>New signup</h2>
          <table cellpadding="6" style="border-collapse: collapse;">
            <tr><td><strong>Name</strong></td><td>${name}</td></tr>
            <tr><td><strong>Email</strong></td><td>${email}</td></tr>
            <tr><td><strong>Trial ends</strong></td><td>${trialEnds}</td></tr>
            <tr><td><strong>Report credits</strong></td><td>${input.creditsRemaining}</td></tr>
            <tr><td><strong>User ID</strong></td><td>${escapeHtml(input.userId)}</td></tr>
          </table>
          <p style="color:#555;font-size:13px;">
            They cannot generate a report until they add their own Anthropic or
            OpenAI API key (Settings &rarr; AI Providers). That is the most
            likely place a new trial stalls — worth a personal note.
          </p>
        </div>
      `,
      text:
        `New RestoreAssist signup\n\n` +
        `Name:  ${input.name}\n` +
        `Email: ${input.email}\n` +
        `Trial ends: ${trialEnds}\n` +
        `Report credits: ${input.creditsRemaining}\n` +
        `User ID: ${input.userId}\n\n` +
        `They cannot generate a report until they add their own Anthropic or ` +
        `OpenAI API key (Settings -> AI Providers).\n`,
    });

    if (result.error || !result.data?.id) {
      console.error(
        "[signup-alert] Provider did not accept the signup alert:",
        result.error?.message ?? "no message id",
      );
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    // Deliberately swallowed — see the module docblock.
    console.error(
      "[signup-alert] Failed to send signup alert:",
      err instanceof Error ? err.message : String(err),
    );
    return { sent: false, reason: "send_failed" };
  }
}
