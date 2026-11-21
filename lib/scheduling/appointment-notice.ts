/**
 * RA-8497 (DRC S4): tell a technician about the site visit the office booked
 * for them, "like an Outlook meeting request".
 *
 * The technician gets one in-app notification, which carries the office's
 * note, and one email with a calendar file (.ics) attached, so the visit lands
 * in their own calendar at the organisation's local time.
 *
 * What leaves RestoreAssist by email is deliberately narrow: the visit title
 * the office typed, the day and times, the job number and a link to the job.
 * The property address, the insured's details and the office's note are never
 * put in the email or the calendar file (email is forwarded, synced to phones
 * and kept by mail providers); they stay behind the login, on the in-app
 * notice and the job page. The booking is read through a fixed select so they
 * cannot leak.
 *
 * Who is told: only the booking's assignee. The booking route has already
 * proved that person is in the caller's organisation and can open the job.
 *
 * At most once per booking: the email is claimed in the outbound delivery
 * ledger (RA-8503's path) under a key bound to the booking id. A notice lost
 * to a provider failure or a restart is not resent automatically; the ledger
 * row and the "[appointment-notice]" log line are the record.
 *
 * Never throws: a failed notice must not fail a booking that already landed.
 */
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import {
  deliverEmailOnce,
  EmailDeliveryPending,
} from "@/lib/email-delivery-ledger";
import { escapeHtml, withEmailTimeout } from "@/lib/email";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { getAppUrl } from "@/lib/app-url";
import { reportError } from "@/lib/observability";
import { usableEmail } from "@/lib/office-notice/submit-notice";
import { buildIcsEvent } from "@/lib/calendar/ics";
import { formatVisitWindow, resolveTimeZone } from "@/lib/calendar/zoned-time";
import type { Country } from "@/lib/locale/format";

export const APPOINTMENT_NOTICE_EMAIL_KIND = "JOB_APPOINTMENT_BOOKED_TECHNICIAN";

/** The in-app notice keeps the note readable without flooding the bell. */
const NOTE_IN_NOTICE_MAX = 500;

export type AppointmentNoticeOutcome =
  | "sent"
  | "replayed"
  | "missing"
  | "not_scheduled"
  | "no_assignee"
  | "no_recipient"
  | "failed";

export function appointmentNoticeEmailKey(appointmentId: string): string {
  return `job-appointment-booked:${appointmentId}`;
}

function logOutcome(
  appointmentId: string,
  outcome: AppointmentNoticeOutcome,
  detail: Record<string, unknown> = {},
): void {
  console.info("[appointment-notice]", { appointmentId, outcome, ...detail });
}

export interface AppointmentEmailContent {
  appointmentId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  country: Country;
  jobNumber: string;
  jobUrl: string;
}

/** Subject, HTML, text and calendar file. Only these facts, no note. */
export function buildAppointmentEmail(content: AppointmentEmailContent): {
  subject: string;
  html: string;
  text: string;
  ics: string;
} {
  const when = formatVisitWindow(
    content.startsAt,
    content.endsAt,
    content.timeZone,
    content.country,
  );
  const subject = `Site visit booked: job ${content.jobNumber}`;
  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Site visit booked</title></head>
  <body style="font-family: sans-serif; line-height: 1.6; color: #0b1f3a; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="font-size: 22px; margin: 0 0 16px;">${escapeHtml(content.title)}</h1>
    <p style="margin: 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
    <p style="margin: 0 0 16px;"><strong>Job number:</strong> ${escapeHtml(content.jobNumber)}</p>
    <p>The site address and the office's note are on the job in RestoreAssist.</p>
    <p><a href="${escapeHtml(content.jobUrl)}" style="color: #3b6d8c;">Open the job</a></p>
    <p style="color: #64748b; font-size: 13px;">The attached calendar file adds this visit to Outlook, Google or Apple Calendar.</p>
  </body>
</html>`;
  const text = `${content.title}

When: ${when}
Job number: ${content.jobNumber}

The site address and the office's note are on the job in RestoreAssist.
Open the job: ${content.jobUrl}

The attached calendar file adds this visit to Outlook, Google or Apple Calendar.`;
  const ics = buildIcsEvent({
    uid: `job-appointment-${content.appointmentId}@restoreassist`,
    start: content.startsAt,
    end: content.endsAt,
    timeZone: content.timeZone,
    summary: `${content.title} (job ${content.jobNumber})`,
    description: `The site address and the office's note are on the job in RestoreAssist: ${content.jobUrl}`,
    url: content.jobUrl,
    dtstamp: new Date(),
  });
  return { subject, html, text, ics };
}

export async function notifyTechnicianOfBooking(input: {
  appointmentId: string;
}): Promise<void> {
  const { appointmentId } = input;
  let ledgerKey: string | null = null;
  try {
    const appointment = await prisma.jobAppointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        notes: true,
        assignedUserId: true,
        inspection: { select: { id: true, inspectionNumber: true } },
        assignedUser: {
          select: { id: true, email: true, name: true, organizationId: true },
        },
      },
    });
    if (!appointment) {
      logOutcome(appointmentId, "missing");
      return;
    }
    if (appointment.status !== "SCHEDULED") {
      logOutcome(appointmentId, "not_scheduled", { status: appointment.status });
      return;
    }
    const assignee = appointment.assignedUser;
    if (!assignee) {
      logOutcome(appointmentId, "no_assignee");
      return;
    }

    const org = assignee.organizationId
      ? await prisma.organization.findUnique({
          where: { id: assignee.organizationId },
          select: { timezone: true, country: true },
        })
      : null;
    const timeZone = resolveTimeZone(org?.timezone);
    const country: Country = org?.country === "NZ" ? "NZ" : "AU";
    const jobPath = `/dashboard/inspections/${appointment.inspection.id}`;
    const content: AppointmentEmailContent = {
      appointmentId: appointment.id,
      title: appointment.title,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      timeZone,
      country,
      jobNumber: appointment.inspection.inspectionNumber,
      jobUrl: `${getAppUrl()}${jobPath}`,
    };
    const when = formatVisitWindow(
      content.startsAt,
      content.endsAt,
      timeZone,
      country,
    );

    // In-app, behind the login: the note goes here and nowhere else.
    const note = appointment.notes?.trim();
    const noteText = note
      ? ` Note from the office: ${
          note.length > NOTE_IN_NOTICE_MAX
            ? `${note.slice(0, NOTE_IN_NOTICE_MAX - 1)}…`
            : note
        }`
      : "";
    await createNotification({
      userId: assignee.id,
      title: "Site visit booked",
      message: `${appointment.title} for job ${content.jobNumber}: ${when}.${noteText}`,
      type: "INFO",
      link: jobPath,
    });

    const recipient = usableEmail(assignee.email);
    if (!recipient) {
      logOutcome(appointmentId, "no_recipient");
      return;
    }

    const email = buildAppointmentEmail(content);
    const key = appointmentNoticeEmailKey(appointment.id);
    ledgerKey = key;
    const delivery = await deliverEmailOnce({
      idempotencyKey: key,
      kind: APPOINTMENT_NOTICE_EMAIL_KIND,
      recipient,
      payloadIdentity: key,
      // SENT is recorded only on a provider receipt; anything else is left
      // unsent and never resent automatically.
      send: () =>
        withEmailTimeout(
          sendTransactionalEmail({
            to: recipient,
            subject: email.subject,
            html: email.html,
            text: email.text,
            attachments: [
              {
                filename: "site-visit.ics",
                content: Buffer.from(email.ics, "utf8").toString("base64"),
                // A plain media type: the file itself says METHOD:PUBLISH, and
                // RFC 5545 text defaults to UTF-8.
                contentType: "text/calendar",
              },
            ],
            organizationId: assignee.organizationId,
            idempotencyKey: key,
          }),
        ),
    });
    logOutcome(appointmentId, delivery.replayed ? "replayed" : "sent", {
      ledgerKey: key,
    });
  } catch (error) {
    const ledgerState =
      error instanceof EmailDeliveryPending ? error.state : undefined;
    logOutcome(appointmentId, "failed", { ledgerKey, ledgerState });
    // Never adds the recipient address; the ledger row holds it.
    reportError(error, {
      route: "/api/inspections/[id]/appointments",
      stage: "appointment-notice",
      appointmentId,
      ledgerKey,
      ledgerState,
    });
  }
}
