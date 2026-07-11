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
 * Sends from the verified RESEND_FROM_EMAIL domain with reply-to pointed at the
 * RestoreAssist inbox (RESEND_REPLY_TO, else the support mailbox).
 *
 *   curl -X POST https://restoreassist.app/api/internal/send-reengagement \
 *     -H "Authorization: Bearer $REENGAGEMENT_SEND_TOKEN" \
 *     -H "content-type: application/json" \
 *     -d '{"recipientEmail":"x@y.com","recipientName":"Ryan"}'
 */

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email-send";
import { reengagementEmail } from "@/lib/email-templates";
import { BRAND } from "@/lib/brand";

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

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ sent: false, reason: "RESEND_API_KEY not set" });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
  const ctaPath =
    body.ctaPath && body.ctaPath.startsWith("/")
      ? body.ctaPath
      : "/dashboard/pricing";
  const replyTo = process.env.RESEND_REPLY_TO || BRAND.company.supportEmail;

  try {
    await sendEmail({
      to: recipientEmail,
      subject: "Pick up where you left off — RestoreAssist",
      html: reengagementEmail({
        recipientName: body.recipientName?.trim() || "there",
        ctaUrl: `${baseUrl}${ctaPath}?utm_source=reengagement`,
        senderName: "Phill",
      }),
      replyTo,
    });
    return NextResponse.json({ sent: true, to: recipientEmail });
  } catch {
    // sendEmail is fire-and-forget, but guard anyway — never leak internals.
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
