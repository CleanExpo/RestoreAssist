/**
 * Lightweight Resend email sender — uses raw fetch (no SDK).
 * Fire-and-forget: reports errors loudly but never throws, so callers
 * don't fail. Every failure path emits `[email-send]` via console.error
 * plus a structured reportError so Vercel Observability can alert on it.
 */

import { reportError } from "@/lib/observability";
import { resolveResendConfig } from "@/lib/email/resolve-resend-config";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** When set, prefer the org's Resend BYOK key over platform env. */
  organizationId?: string | null;
}

/** Hard ceiling so a hung Resend cannot pin the serverless function. */
export const EMAIL_SEND_TIMEOUT_MS = 10_000;

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const config = await resolveResendConfig(payload.organizationId);

  if (!config) {
    console.error(
      "[email-send] RESEND_API_KEY is not configured — email NOT sent",
      { subject: payload.subject },
    );
    reportError(
      new Error(
        "[email-send] RESEND_API_KEY is not configured — email NOT sent",
      ),
      { stage: "email-send-config", subject: payload.subject },
    );
    return;
  }

  const body: Record<string, unknown> = {
    from: config.from,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
  };

  if (payload.replyTo) {
    body.reply_to = payload.replyTo;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      console.error(`[email-send] Resend error ${res.status}: ${text}`);
      reportError(new Error(`[email-send] Resend error ${res.status}`), {
        stage: "email-send",
        subject: payload.subject,
        resendStatus: res.status,
        source: config.source,
      });
    }
  } catch (err) {
    console.error("[email-send] Fetch failed:", err);
    reportError(err, { stage: "email-send", subject: payload.subject });
  }
}
