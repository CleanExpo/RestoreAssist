/**
 * Lightweight transactional email sender — Mailtrap (preferred) or Resend.
 * Fire-and-forget: reports errors loudly but never throws, so callers
 * don't fail. Every failure path emits `[email-send]` via console.error
 * plus a structured reportError so Vercel Observability can alert on it.
 */

import { reportError } from "@/lib/observability";
import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** When set, prefer the org's Resend BYOK key over platform env. */
  organizationId?: string | null;
}

/** Hard ceiling so a hung provider cannot pin the serverless function. */
export { EMAIL_SEND_TIMEOUT_MS } from "@/lib/email/send-transactional";

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!isEmailServiceConfigured() && !payload.organizationId) {
    console.error(
      "[email-send] MAILTRAP_API_KEY / RESEND_API_KEY is not configured — email NOT sent",
      { subject: payload.subject },
    );
    reportError(
      new Error(
        "[email-send] Email service is not configured — email NOT sent",
      ),
      { stage: "email-send-config", subject: payload.subject },
    );
    return;
  }

  const result = await sendTransactionalEmail({
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    replyTo: payload.replyTo,
    organizationId: payload.organizationId,
  });

  if (result.error) {
    console.error(
      `[email-send] ${result.provider ?? "email"} error: ${result.error.message}`,
    );
    reportError(new Error(`[email-send] ${result.error.message}`), {
      stage: "email-send",
      subject: payload.subject,
      provider: result.provider,
      source: result.source,
    });
  }
}
