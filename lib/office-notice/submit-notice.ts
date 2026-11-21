/**
 * RA-8503 (DRC S10): tell the office when a technician submits a job visit.
 *
 * On a successful submit the organisation's ADMIN and MANAGER users (and the
 * owner) get one in-app notification, and one email goes to the
 * organisation's office (business) email from organisation settings, or to
 * the owner's email when that is blank or not a valid address.
 *
 * Who is told follows the job's tenant, resolved by getResourceTenant (the
 * same membership-window rule the submit gate uses), never the creator's
 * current organisation: a removed member's old job tells the business that
 * owns it, and never the person removed or a firm they joined later.
 *
 * What the office is told is deliberately narrow: the job number, the
 * technician's name and a link to the job. The property address, the
 * insured's contact details and any money are never put in the notice; the
 * inspection is read through a fixed select so they cannot leak.
 *
 * At most once per submit: the submit route calls this only after its CAS
 * wins the DRAFT to SUBMITTED transition, so a retry or a lost race tells
 * nobody, and the email is claimed in the outbound delivery ledger under a
 * key bound to that submit's time. A notice lost to a provider failure or a
 * restart is not resent automatically; the ledger row and the
 * "[office-notice]" outcome log line are the record, and the in-app
 * notification, once written, is the durable channel.
 *
 * Never throws: a failed notice must not fail a submit that already landed.
 */

import { prisma } from "@/lib/prisma";
import { createNotificationForUsers } from "@/lib/notifications";
import {
  deliverEmailOnce,
  EmailDeliveryPending,
} from "@/lib/email-delivery-ledger";
import { escapeHtml, withEmailTimeout } from "@/lib/email";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { getAppUrl } from "@/lib/app-url";
import { getResourceTenant } from "@/lib/organization-credits";
import { reportError } from "@/lib/observability";

export const SUBMIT_NOTICE_EMAIL_KIND = "INSPECTION_SUBMITTED_OFFICE";

export interface SubmitNoticeInput {
  inspectionId: string;
  /** The submittedAt the submit route wrote in its winning CAS. */
  submittedAt: Date;
  /** Display name of the signed-in submitter, used when the job has none. */
  submitterName?: string | null;
}

export interface SubmitNoticeContent {
  jobNumber: string;
  technicianName: string;
  jobUrl: string;
}

export type SubmitNoticeOutcome =
  | "sent"
  | "replayed"
  | "inspection_missing"
  | "no_tenant"
  | "no_recipient"
  | "failed";

// Values saved before RA-8503 were never validated, so check at send time.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usableEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed)
    ? trimmed
    : null;
}

function logOutcome(
  inspectionId: string,
  outcome: SubmitNoticeOutcome,
  detail: Record<string, unknown> = {},
): void {
  console.info("[office-notice]", { inspectionId, outcome, ...detail });
}

export function submitNoticeEmailKey(
  inspectionId: string,
  submittedAt: Date,
): string {
  return `inspection-submitted-office:${inspectionId}:${submittedAt.toISOString()}`;
}

/** Subject, HTML and text for the office email. Only these three facts. */
export function buildSubmitNoticeEmail(content: SubmitNoticeContent): {
  subject: string;
  html: string;
  text: string;
} {
  const job = escapeHtml(content.jobNumber);
  const tech = escapeHtml(content.technicianName);
  const subject = `Job ${content.jobNumber} complete: report ready to send`;
  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Job complete</title></head>
  <body style="font-family: sans-serif; line-height: 1.6; color: #0b1f3a; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="font-size: 22px; margin: 0 0 16px;">Job ${job} is complete</h1>
    <p>${tech} has submitted the site visit. The report is ready to send.</p>
    <p style="margin: 0;"><strong>Job number:</strong> ${job}</p>
    <p style="margin: 0 0 24px;"><strong>Technician:</strong> ${tech}</p>
    <p><a href="${escapeHtml(content.jobUrl)}" style="color: #3b6d8c;">Open the job</a></p>
    <p style="color: #64748b; font-size: 13px;">You receive this because this inbox is your organisation's office email in RestoreAssist, or its owner's email when no office email is set.</p>
  </body>
</html>`;
  const text = `Job ${content.jobNumber} is complete

${content.technicianName} has submitted the site visit. The report is ready to send.

Job number: ${content.jobNumber}
Technician: ${content.technicianName}

Open the job: ${content.jobUrl}`;
  return { subject, html, text };
}

const ORG_SELECT = {
  id: true,
  ownerId: true,
  email: true,
  owner: { select: { email: true } },
} as const;

/**
 * The organisation that owns the job, or null for a sole trader. One owner
 * may own several organisations; when the tenant names none and the owner
 * owns more than one, no organisation is guessed.
 */
async function resolveTenantOrganization(tenant: {
  ownerId: string;
  organizationId: string | null;
}) {
  if (tenant.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: tenant.organizationId },
      select: ORG_SELECT,
    });
    return org && org.ownerId === tenant.ownerId ? org : null;
  }
  const owned = await prisma.organization.findMany({
    where: { ownerId: tenant.ownerId },
    select: ORG_SELECT,
    take: 2,
  });
  return owned.length === 1 ? owned[0] : null;
}

export async function notifyOfficeOfSubmittedVisit(
  input: SubmitNoticeInput,
): Promise<void> {
  let ledgerKey: string | null = null;
  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id: input.inspectionId },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        inspectionNumber: true,
        technicianName: true,
      },
    });
    if (!inspection) {
      logOutcome(input.inspectionId, "inspection_missing");
      return;
    }

    const tenant = await getResourceTenant(
      inspection.userId,
      inspection.createdAt,
    );
    if (!tenant) {
      // Fail closed, as the tenancy helper does: no proven tenant, no notice.
      logOutcome(inspection.id, "no_tenant");
      return;
    }
    const org = await resolveTenantOrganization(tenant);

    const technicianName =
      inspection.technicianName?.trim() ||
      input.submitterName?.trim() ||
      "A technician";
    const content: SubmitNoticeContent = {
      jobNumber: inspection.inspectionNumber,
      technicianName,
      jobUrl: `${getAppUrl()}/dashboard/inspections/${inspection.id}`,
    };

    // In-app: the tenant's owner, plus the organisation's ADMIN and MANAGER
    // users when the job belongs to an organisation.
    const recipientIds = new Set<string>([tenant.ownerId]);
    if (org) {
      const staff = await prisma.user.findMany({
        where: { organizationId: org.id, role: { in: ["ADMIN", "MANAGER"] } },
        select: { id: true },
      });
      for (const user of staff) recipientIds.add(user.id);
    }
    await createNotificationForUsers([...recipientIds], {
      title: "Job complete: report ready to send",
      message: `${technicianName} submitted job ${content.jobNumber}.`,
      type: "SUCCESS",
      link: `/dashboard/inspections/${inspection.id}`,
    });

    const ownerEmail = org
      ? org.owner?.email
      : (
          await prisma.user.findUnique({
            where: { id: tenant.ownerId },
            select: { email: true },
          })
        )?.email;
    const recipient = usableEmail(org?.email) ?? usableEmail(ownerEmail);
    if (!recipient) {
      logOutcome(inspection.id, "no_recipient", {
        inAppTargeted: recipientIds.size,
      });
      return;
    }

    const email = buildSubmitNoticeEmail(content);
    const key = submitNoticeEmailKey(inspection.id, input.submittedAt);
    ledgerKey = key;
    const delivery = await deliverEmailOnce({
      idempotencyKey: key,
      kind: SUBMIT_NOTICE_EMAIL_KIND,
      recipient,
      payloadIdentity: key,
      // The ledger records SENT only on a provider receipt. Anything else
      // (not configured, rejected, timed out) is left unsent and is never
      // resent automatically, which is the safe side for a once-only notice.
      send: () =>
        withEmailTimeout(
          sendTransactionalEmail({
            to: recipient,
            subject: email.subject,
            html: email.html,
            text: email.text,
            organizationId: org?.id ?? null,
            idempotencyKey: key,
          }),
        ),
    });
    logOutcome(inspection.id, delivery.replayed ? "replayed" : "sent", {
      ledgerKey: key,
      inAppTargeted: recipientIds.size,
    });
  } catch (error) {
    const ledgerState =
      error instanceof EmailDeliveryPending ? error.state : undefined;
    logOutcome(input.inspectionId, "failed", { ledgerKey, ledgerState });
    // This line never adds the recipient address; the ledger row holds it.
    reportError(error, {
      route: "/api/inspections/[id]/submit",
      stage: "office-notice",
      inspectionId: input.inspectionId,
      ledgerKey,
      ledgerState,
    });
  }
}
