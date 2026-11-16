/**
 * POST /api/internal/send-reengagement — RA-7026.
 *
 * Headless, token-authed path to send the on-brand customer re-engagement
 * email (the admin UI path `/api/notifications/email` is session-gated and
 * can't be driven by automation). Bearer-token authenticated the same way the
 * cron routes are — CLAUDE.md rule 1 exempts bearer-token internal routes from
 * getServerSession. The token (REENGAGEMENT_SEND_TOKEN) is a dedicated secret,
 * so a leak can't reach anything but this one endpoint.
 *
 * Sends from the verified SENDER_EMAIL domain with reply-to pointed at the
 * RestoreAssist inbox (else the support mailbox).
 *
 *   curl -X POST https://restoreassist.app/api/internal/send-reengagement \
 *     -H "Authorization: Bearer $REENGAGEMENT_SEND_TOKEN" \
 *     -H "content-type: application/json" \
 *     -d '{"recipientEmail":"x@y.com","recipientName":"Ryan"}'
 */

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendReengagementEmail } from "@/lib/email";
import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";

/** Constant-time bearer check; fails closed when the token is unset. */
function verifyToken(request: NextRequest): boolean {
  const secret = process.env.REENGAGEMENT_SEND_TOKEN;
  if (!secret) return false;
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Body {
  recipientEmail?: string;
  recipientName?: string;
  /** Optional in-app path for the CTA; must be root-relative. */
  ctaPath?: string;
}

export async function POST(request: NextRequest) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipientEmail = body.recipientEmail?.trim();
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return NextResponse.json(
      { error: "A valid recipientEmail is required" },
      { status: 400 },
    );
  }

  if (!isEmailServiceConfigured()) {
    return NextResponse.json({
      sent: false,
      reason: "Email service is not configured",
    });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
  const ctaPath =
    body.ctaPath && body.ctaPath.startsWith("/")
      ? body.ctaPath
      : "/dashboard/pricing";

  try {
    // RA-8356: one sales sender owns this email and its opt-out
    // (reply-to, List-Unsubscribe, visible unsubscribe line, text part).
    const messageId = await sendReengagementEmail({
      recipientEmail,
      recipientName: body.recipientName?.trim() || "there",
      ctaUrl: `${baseUrl}${ctaPath}?utm_source=reengagement`,
      senderName: "Phill",
    });
    if (!messageId) {
      return NextResponse.json(
        { sent: false, reason: "Email provider did not confirm delivery" },
        { status: 502 },
      );
    }
    return NextResponse.json({ sent: true, to: recipientEmail, messageId });
  } catch {
    // sendEmail is fire-and-forget, but guard anyway — never leak internals.
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
