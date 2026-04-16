/**
 * Lightweight Resend email sender — uses raw fetch (no SDK).
 * Fire-and-forget: logs errors but never throws, so callers don't fail.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

const FROM = "RestoreAssist <noreply@restoreassist.app>";

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(
      "[email-send] RESEND_API_KEY is not set — skipping email send",
    );
    return;
  }

  const body: Record<string, unknown> = {
    from: FROM,
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
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      console.error(`[email-send] Resend error ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error("[email-send] Fetch failed:", err);
  }
}
