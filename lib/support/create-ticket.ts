/**
 * RA-8399 — the one place a support ticket is created.
 *
 * Before this, the contact form, the in-app help form, the evidence-score page
 * and the paid Job File Audit intake each saved a `SupportTicket` row and
 * stopped. Nobody was told, while the sender read "We'll respond within 24
 * hours". Each "row saved, nobody told" case had been fixed one at a time
 * (RA-1297, RA-6936, RA-8028); this module makes the alert part of creating a
 * ticket, so a new entry point cannot skip it.
 * `lib/support/__tests__/create-ticket-owner.test.ts` fails if any other
 * source file calls `supportTicket.create`.
 *
 * The alert is best-effort. The ticket is saved first; a failed or
 * unconfigured send is logged with the ticket id and never changes what the
 * caller returns. Database errors (for example the intake route's P2002
 * duplicate-payment check) still propagate to the caller unchanged.
 *
 * Recipient: `SUPPORT_ALERT_EMAIL`, falling back to the public support mailbox
 * in `lib/brand.ts`, which already receives customer replies (RA-6936).
 */

import type { Prisma, SupportTicket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import { getAppUrl } from "@/lib/app-url";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { sanitiseEmailField } from "@/lib/email/sanitise-header";

export const SUPPORT_ALERT_BODY_PREVIEW_CHARS = 500;

export type SupportTicketAlertResult =
  | { sent: true }
  | { sent: false; reason: "send_failed" };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function supportAlertRecipient(): string {
  return (
    process.env.SUPPORT_ALERT_EMAIL?.trim() || BRAND.company.supportEmail
  );
}

/** Email staff about a ticket that has just been saved. Never throws. */
export async function sendSupportTicketAlert(
  ticket: Pick<
    SupportTicket,
    "id" | "subject" | "priority" | "category" | "name" | "email" | "body"
  >,
): Promise<SupportTicketAlertResult> {
  const preview = ticket.body.slice(0, SUPPORT_ALERT_BODY_PREVIEW_CHARS);
  const truncated = ticket.body.length > SUPPORT_ALERT_BODY_PREVIEW_CHARS;
  const link = `${getAppUrl()}/dashboard/support`;
  const priority = ticket.priority.toUpperCase();

  try {
    const result = await sendTransactionalEmail({
      to: supportAlertRecipient(),
      subject: sanitiseEmailField(
        `[Support ${priority}] ${ticket.subject} (${ticket.id})`,
      ),
      idempotencyKey: `support-ticket-alert:${ticket.id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>New support ticket</h2>
          <table cellpadding="6" style="border-collapse: collapse;">
            <tr><td><strong>Ticket</strong></td><td>${escapeHtml(ticket.id)}</td></tr>
            <tr><td><strong>Priority</strong></td><td>${escapeHtml(priority)}</td></tr>
            <tr><td><strong>Category</strong></td><td>${escapeHtml(ticket.category)}</td></tr>
            <tr><td><strong>Subject</strong></td><td>${escapeHtml(ticket.subject)}</td></tr>
            <tr><td><strong>From</strong></td><td>${escapeHtml(ticket.name)} &lt;${escapeHtml(ticket.email)}&gt;</td></tr>
          </table>
          <pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(preview)}${truncated ? "..." : ""}</pre>
          <p><a href="${escapeHtml(link)}">Open the support inbox</a></p>
        </div>
      `,
      text:
        `New support ticket\n\n` +
        `Ticket:   ${ticket.id}\n` +
        `Priority: ${priority}\n` +
        `Category: ${ticket.category}\n` +
        `Subject:  ${ticket.subject}\n` +
        `From:     ${ticket.name} <${ticket.email}>\n\n` +
        `${preview}${truncated ? "..." : ""}\n\n` +
        `Support inbox: ${link}\n`,
    });

    if (result.error || !result.data?.id) {
      console.error(
        `[support-alert] Staff alert NOT sent for ticket ${ticket.id}:`,
        result.error?.message ?? "no message id",
      );
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error(
      `[support-alert] Staff alert NOT sent for ticket ${ticket.id}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { sent: false, reason: "send_failed" };
  }
}

/**
 * Save a support ticket, then alert staff. Returns the saved row. The only
 * caller-visible failure is the database write itself.
 */
export async function createSupportTicket(
  data: Prisma.SupportTicketUncheckedCreateInput,
): Promise<SupportTicket> {
  const ticket = await prisma.supportTicket.create({ data });
  await sendSupportTicketAlert(ticket);
  return ticket;
}
