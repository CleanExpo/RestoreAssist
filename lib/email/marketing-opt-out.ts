/**
 * RA-8355: the one owner of the opt-out pieces every sales or win-back email
 * must carry. Call it; never hand-write another unsubscribe footer.
 *
 * - `replyTo`: a monitored mailbox, `EMAIL_REPLY_TO` else the support mailbox
 *   (the same rule as app/api/internal/send-reengagement/route.ts).
 * - `headers`: RFC 2369 `List-Unsubscribe` pointing at that mailbox.
 * - `footerHtml` / `footerText`: a visible unsubscribe line plus the legal
 *   name and, when configured, the ABN.
 *
 * Account holders have no stored opt-out flag yet, so the mailbox is the
 * opt-out. A one-click web unsubscribe needs a schema change and is out of
 * scope here.
 */

import { BRAND } from "@/lib/brand";

export interface MarketingOptOut {
  replyTo: string;
  headers: Record<string, string>;
  footerHtml: string;
  footerText: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function marketingOptOut(): MarketingOptOut {
  const mailbox =
    process.env.EMAIL_REPLY_TO?.trim() || BRAND.company.supportEmail;
  const mailto = `mailto:${mailbox}?subject=Unsubscribe`;
  const identity = [
    BRAND.company.legal,
    BRAND.company.abn ? `ABN ${BRAND.company.abn}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const footerHtml = `<p style="color:#64748b;font-size:12px;line-height:1.6;margin:0 0 8px 0;">To stop receiving these emails, <a href="${escapeHtml(mailto)}" style="color:#64748b;text-decoration:underline;">unsubscribe</a> or email ${escapeHtml(mailbox)} with the subject "Unsubscribe".</p>
<p style="color:#94a3b8;font-size:11px;margin:0;">${escapeHtml(identity)}</p>`;

  const footerText = `To unsubscribe from these emails, email ${mailbox} with the subject "Unsubscribe".\n${identity}`;

  return {
    replyTo: mailbox,
    headers: { "List-Unsubscribe": `<${mailto}>` },
    footerHtml,
    footerText,
  };
}
