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
import { tryCreateNotificationForUsers } from "@/lib/notifications";
import {
  deliverEmailOnce,
  EmailDeliveryPending,
} from "@/lib/email-delivery-ledger";
import { escapeHtml, withEmailTimeout } from "@/lib/email";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { getAppUrl } from "@/lib/app-url";
import { getResourceTenant } from "@/lib/organization-credits";
import { reportError } from "@/lib/observability";
import { parseEmail } from "@/lib/validation/email";
import { decodeSanitizedEntities } from "@/lib/sanitize";

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
  /** RA-8516: the in-app notification was not written; see `email`. */
  | "in_app_failed"
  | "failed";

/**
 * A trimmed, valid single address, or null. Values saved before RA-8503 were
 * never validated, so this is checked at send time too. The same check
 * (parseEmail) guards the profile and setup saves. Also used by the RA-8497
 * booking notice.
 */
export function usableEmail(value: string | null | undefined): string | null {
  return parseEmail(value);
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
  createdAt: true,
  owner: { select: { email: true } },
} as const;

/**
 * The organisation that owns the job, or null for a sole trader. One owner
 * may own several organisations; when the tenant names none and the owner
 * owns more than one, no organisation is guessed.
 *
 * When the tenant is the creator themself, getResourceTenant names no
 * organisation, so one is only used when it is the owner's sole organisation
 * AND it already existed when the job was made. An organisation set up after
 * the job is not the job's, so its office and staff are not told; the owner
 * alone is.
 */
async function resolveTenantOrganization(
  tenant: { ownerId: string; organizationId: string | null },
  jobCreatedAt: Date,
) {
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
  if (owned.length !== 1) return null;
  const [org] = owned;
  return org.createdAt.getTime() <= jobCreatedAt.getTime() ? org : null;
}

/**
 * getResourceTenant answers "the creator themself" for every ADMIN before it
 * looks at membership history. A creator who has since left an organisation
 * they belonged to when the job was made is therefore not proven to be the
 * job's tenant: the job may be that organisation's work. Fail closed.
 */
async function selfTenantUnproven(
  creatorId: string,
  jobCreatedAt: Date,
): Promise<boolean> {
  const creator = await prisma.user.findUnique({
    where: { id: creatorId },
    select: { organizationLeftAt: true },
  });
  const leftAt = creator?.organizationLeftAt;
  return leftAt instanceof Date && leftAt.getTime() > jobCreatedAt.getTime();
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
    if (
      !tenant.organizationId &&
      (await selfTenantUnproven(inspection.userId, inspection.createdAt))
    ) {
      logOutcome(inspection.id, "no_tenant", { reason: "left_after_job" });
      return;
    }
    const org = await resolveTenantOrganization(tenant, inspection.createdAt);

    // RA-8516: technicianName is stored through sanitizeString, which
    // entity-encodes it ("O'Brien" is stored as "O&#x27;Brien"). Decode it
    // once here so the email escapes it exactly once, at render.
    const technicianName =
      decodeSanitizedEntities(inspection.technicianName ?? "").trim() ||
      input.submitterName?.trim() ||
      "A technician";
    const content: SubmitNoticeContent = {
      jobNumber: inspection.inspectionNumber,
      technicianName,
      jobUrl: `${getAppUrl()}/dashboard/inspections/${inspection.id}`,
    };

    // In-app: the tenant's owner, plus the organisation's ADMIN and MANAGER
    // users when the job belongs to an organisation.
    //
    // RA-8516 assumption, pinned by a test: a job created by an ADMIN who is
    // a member of someone else's organisation (not its owner) resolves to
    // that ADMIN alone, because getResourceTenant treats every ADMIN as their
    // own tenant, so only they are told. That creator is not reachable today:
    // invites and role changes only grant MANAGER or USER
    // (app/api/team/invites, app/api/team/members/[id]). Revisit this if a
    // member can ever be made ADMIN.
    const recipientIds = new Set<string>([tenant.ownerId]);
    if (org) {
      const staff = await prisma.user.findMany({
        where: { organizationId: org.id, role: { in: ["ADMIN", "MANAGER"] } },
        select: { id: true },
      });
      for (const user of staff) recipientIds.add(user.id);
    }
    const inApp = await tryCreateNotificationForUsers([...recipientIds], {
      title: "Job complete: report ready to send",
      message: `${technicianName} submitted job ${content.jobNumber}.`,
      type: "SUCCESS",
      link: `/dashboard/inspections/${inspection.id}`,
    });
    const inAppDetail = {
      inAppTargeted: recipientIds.size,
      inAppWritten: inApp.ok ? inApp.written : 0,
    };
    if (!inApp.ok) {
      // The submit already landed; report the lost in-app notice and still
      // try the email, which is the only other channel.
      reportError(inApp.error, {
        route: "/api/inspections/[id]/submit",
        stage: "office-notice-in-app",
        inspectionId: inspection.id,
      });
    }
    // RA-8516: never log "sent" when nothing was written in-app.
    const emailOutcome = (
      outcome: "sent" | "replayed" | "no_recipient",
    ): SubmitNoticeOutcome => (inApp.ok ? outcome : "in_app_failed");

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
      logOutcome(inspection.id, emailOutcome("no_recipient"), {
        email: "no_recipient",
        ...inAppDetail,
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
    const emailResult = delivery.replayed ? "replayed" : "sent";
    logOutcome(inspection.id, emailOutcome(emailResult), {
      email: emailResult,
      ledgerKey: key,
      ...inAppDetail,
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
