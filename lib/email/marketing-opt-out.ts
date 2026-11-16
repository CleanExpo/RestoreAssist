/**
 * RA-8355 — the one owner of the opt-out pieces every sales or marketing email
 * must carry. A commercial email built without this has no working way for
 * the recipient to stop it (the win-back email shipped that way; RA-7979 was
 * the same defect on Pulse emails). Call it; never hand-write the footer.
 *
 * It returns everything the send call needs:
 * - `replyTo`: a monitored mailbox, so a reply asking to stop reaches a person
 *   (EMAIL_REPLY_TO, else the support mailbox — the re-engagement route rule).
 * - `headers`: an RFC 2369 `List-Unsubscribe` mailto header to that mailbox.
 * - `htmlFooter` / `textFooter`: a visible unsubscribe line naming the same
 *   mailbox, for the HTML and plain-text parts.
 */

import { BRAND } from "@/lib/brand";

export interface MarketingOptOut {
  replyTo: string;
  headers: Record<string, string>;
  htmlFooter: string;
  textFooter: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The monitored mailbox that receives replies and unsubscribe requests. */
export function marketingOptOutMailbox(): string {
  return (
    process.env.EMAIL_REPLY_TO?.trim() || BRAND.company.supportEmail.trim()
  );
}

export function buildMarketingOptOut(): MarketingOptOut {
  const mailbox = marketingOptOutMailbox();
  const mailto = `mailto:${mailbox}?subject=Unsubscribe`;
  const legal = BRAND.company.legal;
  const abn = BRAND.company.abn ? ` (ABN ${BRAND.company.abn})` : "";

  return {
    replyTo: mailbox,
    headers: { "List-Unsubscribe": `<${mailto}>` },
    htmlFooter: `<p style="margin: 5px 0;">To unsubscribe, email <a href="${escapeHtml(mailto)}" style="color: #64748b;">${escapeHtml(mailbox)}</a> with the subject "Unsubscribe" and we will stop sending these emails.</p>
          <p style="margin: 5px 0;">${escapeHtml(legal)}${escapeHtml(abn)}</p>`,
    textFooter: `To unsubscribe, email ${mailbox} with the subject "Unsubscribe" and we will stop sending these emails.\n${legal}${abn}`,
  };
}
