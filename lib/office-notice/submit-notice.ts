/**
 * RA-8503 (DRC S10): tell the office when a technician submits a job visit.
 *
 * On a successful submit the organisation's ADMIN and MANAGER users (and the
 * owner) get one in-app notification, and one email goes to the office
 * address set in organisation settings, or to the owner's email when none is
 * set.
 *
 * What the office is told is deliberately narrow: the job number, the
 * property address, the technician's name and a link to the job. The
 * inspection is read through a fixed select, so the insured's contact
 * details (on the linked Client) and any money (estimates, rates, invoices)
 * are never loaded and cannot leak into the notice.
 *
 * Exactly once per submit: the submit route calls this only after its CAS
 * wins the DRAFT to SUBMITTED transition, and the email is claimed in the
 * outbound delivery ledger under a key bound to the inspection and that
 * submit's time, so a retry of the same submit cannot send a second email.
 *
 * Never throws: a failed notice must not fail a submit that already landed.
 */

import { prisma } from "@/lib/prisma";
import { createNotificationForUsers } from "@/lib/notifications";
import { deliverEmailOnce } from "@/lib/email-delivery-ledger";
import { assertEmailSuccess, escapeHtml, withEmailTimeout } from "@/lib/email";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { getAppUrl } from "@/lib/app-url";

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
  propertyAddress: string;
  technicianName: string;
  jobUrl: string;
}

export function submitNoticeEmailKey(
  inspectionId: string,
  submittedAt: Date,
): string {
  return `inspection-submitted-office:${inspectionId}:${submittedAt.toISOString()}`;
}

/** Subject, HTML and text for the office email. Only these four facts. */
export function buildSubmitNoticeEmail(content: SubmitNoticeContent): {
  subject: string;
  html: string;
  text: string;
} {
  const job = escapeHtml(content.jobNumber);
  const address = escapeHtml(content.propertyAddress);
  const tech = escapeHtml(content.technicianName);
  const subject = `Job ${content.jobNumber} complete: report ready to send`;
  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Job complete</title></head>
  <body style="font-family: sans-serif; line-height: 1.6; color: #0b1f3a; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="font-size: 22px; margin: 0 0 16px;">Job ${job} is complete</h1>
    <p>${tech} has submitted the site visit. The report is ready to send.</p>
    <p style="margin: 0;"><strong>Job number:</strong> ${job}</p>
    <p style="margin: 0;"><strong>Property:</strong> ${address}</p>
    <p style="margin: 0 0 24px;"><strong>Technician:</strong> ${tech}</p>
    <p><a href="${escapeHtml(content.jobUrl)}" style="color: #3b6d8c;">Open the job</a></p>
    <p style="color: #64748b; font-size: 13px;">You receive this because your organisation's office address is set to this inbox in RestoreAssist settings.</p>
  </body>
</html>`;
  const text = `Job ${content.jobNumber} is complete

${content.technicianName} has submitted the site visit. The report is ready to send.

Job number: ${content.jobNumber}
Property: ${content.propertyAddress}
Technician: ${content.technicianName}

Open the job: ${content.jobUrl}`;
  return { subject, html, text };
}

async function resolveOrganization(ownerUserId: string) {
  const select = {
    id: true,
    ownerId: true,
    officeNotificationEmail: true,
    owner: { select: { email: true } },
  } as const;
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { organizationId: true, email: true },
  });
  const org = owner?.organizationId
    ? await prisma.organization.findUnique({
        where: { id: owner.organizationId },
        select,
      })
    : await prisma.organization.findFirst({
        where: { ownerId: ownerUserId },
        select,
      });
  return { owner, org };
}

export async function notifyOfficeOfSubmittedVisit(
  input: SubmitNoticeInput,
): Promise<void> {
  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id: input.inspectionId },
      select: {
        id: true,
        userId: true,
        inspectionNumber: true,
        propertyAddress: true,
        technicianName: true,
      },
    });
    if (!inspection) return;

    const { owner, org } = await resolveOrganization(inspection.userId);

    const technicianName =
      inspection.technicianName?.trim() ||
      input.submitterName?.trim() ||
      "A technician";
    const content: SubmitNoticeContent = {
      jobNumber: inspection.inspectionNumber,
      propertyAddress: inspection.propertyAddress,
      technicianName,
      jobUrl: `${getAppUrl()}/dashboard/inspections/${inspection.id}`,
    };

    // In-app: ADMIN and MANAGER users of the organisation, plus the owner.
    // A solo business without an organisation row notifies its owner.
    const recipientIds = new Set<string>();
    if (org) {
      recipientIds.add(org.ownerId);
      const staff = await prisma.user.findMany({
        where: { organizationId: org.id, role: { in: ["ADMIN", "MANAGER"] } },
        select: { id: true },
      });
      for (const user of staff) recipientIds.add(user.id);
    } else {
      recipientIds.add(inspection.userId);
    }
    await createNotificationForUsers([...recipientIds], {
      title: "Job complete: report ready to send",
      message: `${technicianName} submitted job ${content.jobNumber} at ${content.propertyAddress}.`,
      type: "SUCCESS",
      link: `/dashboard/inspections/${inspection.id}`,
    });

    const recipient =
      org?.officeNotificationEmail?.trim() ||
      org?.owner?.email?.trim() ||
      owner?.email?.trim() ||
      null;
    if (!recipient) {
      console.warn("[office-notice] no office or owner email", {
        inspectionId: inspection.id,
      });
      return;
    }

    const email = buildSubmitNoticeEmail(content);
    const key = submitNoticeEmailKey(inspection.id, input.submittedAt);
    await deliverEmailOnce({
      idempotencyKey: key,
      kind: SUBMIT_NOTICE_EMAIL_KIND,
      recipient,
      payloadIdentity: key,
      send: async () =>
        assertEmailSuccess(
          await withEmailTimeout(
            sendTransactionalEmail({
              to: recipient,
              subject: email.subject,
              html: email.html,
              text: email.text,
              organizationId: org?.id ?? null,
              idempotencyKey: key,
            }),
          ),
          "email-inspection-submitted-office",
        ),
    });
  } catch (error) {
    console.error("[office-notice] submit notice failed (non-blocking):", {
      inspectionId: input.inspectionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
