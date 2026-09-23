import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { assertReportTenancy } from "@/lib/auth/assert-tenancy";
import { generateInsurerToken } from "@/lib/portal-token";
import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { sanitiseEmailField } from "@/lib/email/sanitise-header";
import { escapeHtml, getFromEmail, withEmailTimeout } from "@/lib/email";
import { recordReportSent } from "@/lib/lifecycle/report-delivery";

/** Same lifetime as the insurer link (`generateInsurerToken`). */
const LINK_VALID_DAYS = 30;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/reports/[id]/send  (RA-7632)
 *
 * Emails a COMPLETED report to the client on the report, with a signed
 * no-login link to read it. Only after the provider accepts the message does
 * it write EmailAudit plus an AuditLog REPORT_SENT row, in one transaction —
 * the record Close Job requires before a job can close.
 *
 * Refuses (sending nothing, writing nothing): another business's report (404),
 * a report that is not COMPLETED, has no client email, or is not linked to a
 * job (409). A repeated Idempotency-Key replays the first response.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // A client retry must not email the same report twice.
  return withIdempotency(request, userId, async () => {
    try {
      const { id } = await params;

      // 404 for "not yours" and "doesn't exist" alike.
      const tenancy = await assertReportTenancy(session, id);
      if (!tenancy.ok) {
        return apiError(request, {
          code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
          message: tenancy.status === 401 ? "Unauthorized" : "Report not found",
          status: tenancy.status === 401 ? 401 : 404,
        });
      }

      const report = await prisma.report.findUnique({
        where: { id: tenancy.data.id },
        select: {
          id: true,
          status: true,
          title: true,
          reportNumber: true,
          clientName: true,
          propertyAddress: true,
          client: { select: { name: true, email: true } },
          inspection: { select: { id: true } },
          user: {
            select: {
              name: true,
              email: true,
              businessName: true,
              businessEmail: true,
            },
          },
        },
      });
      if (!report) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      if (report.status !== "COMPLETED") {
        return apiError(request, {
          code: "CONFLICT",
          message: "Complete the report before emailing it to the client",
          status: 409,
        });
      }

      const recipient = report.client?.email?.trim() ?? "";
      if (!EMAIL_SHAPE.test(recipient)) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "This report has no client email address. Add one to the client record, then try again.",
          status: 409,
        });
      }

      // Close Job looks the delivery record up by job, and an AuditLog row
      // cannot exist without one — so refuse before sending, not after.
      if (!report.inspection) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Report is not linked to an inspection",
          status: 409,
        });
      }
      const inspectionId = report.inspection.id;

      if (!isEmailServiceConfigured()) {
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message: "Email is not set up yet, so the report was not sent.",
          status: 503,
        });
      }

      // The existing signed, no-login report link (the insurer-link namespace).
      const token = generateInsurerToken(report.id);
      const baseUrl =
        process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
        "https://restoreassist.app";
      const reportUrl = `${baseUrl}/portal/insurer/${token}`;

      const businessName =
        report.user.businessName || report.user.name || "RestoreAssist";
      const clientName = report.client?.name || report.clientName || "there";
      const reportLabel = report.reportNumber || report.title;
      const replyTo =
        report.user.businessEmail || report.user.email || undefined;

      const sendFailed = (err: unknown) =>
        apiError(request, {
          code: "UPSTREAM_FAILED",
          message:
            "The report email could not be sent, so nothing was recorded. Please try again shortly.",
          status: 503,
          err,
          stage: "send-email",
        });

      let providerMessageId: string | null;
      try {
        const sent = await withEmailTimeout(
          sendTransactionalEmail({
            from: getFromEmail(),
            to: recipient,
            subject: sanitiseEmailField(
              `Your report ${reportLabel} from ${businessName}`,
            ),
            html: buildReportEmailHtml({
              clientName,
              businessName,
              propertyAddress: report.propertyAddress,
              reportLabel,
              reportUrl,
            }),
            text: buildReportEmailText({
              clientName,
              businessName,
              propertyAddress: report.propertyAddress,
              reportLabel,
              reportUrl,
            }),
            ...(replyTo ? { replyTo } : {}),
          }),
        );
        if (sent.error) return sendFailed(sent.error);
        providerMessageId = sent.data?.id ?? null;
      } catch (err) {
        return sendFailed(err);
      }

      // The email has gone. Record it for Close Job.
      try {
        await prisma.$transaction((tx) =>
          recordReportSent(tx, {
            reportId: report.id,
            inspectionId,
            userId,
            recipient,
            providerMessageId,
          }),
        );
      } catch (err) {
        return apiError(request, {
          code: "INTERNAL",
          message:
            "The report was emailed to the client, but it could not be marked as sent. Please contact support rather than sending it again.",
          status: 500,
          err,
          stage: "record-report-sent",
        });
      }

      return NextResponse.json({
        success: true,
        message: `Report emailed to ${recipient}`,
        recipient,
        emailId: providerMessageId,
      });
    } catch (error: unknown) {
      return fromException(request, error, { stage: "send-report" });
    }
  });
}

interface ReportEmailContent {
  clientName: string;
  businessName: string;
  propertyAddress: string;
  reportLabel: string;
  reportUrl: string;
}

function buildReportEmailHtml(content: ReportEmailContent): string {
  const clientName = escapeHtml(content.clientName);
  const businessName = escapeHtml(content.businessName);
  const propertyAddress = escapeHtml(content.propertyAddress);
  const reportLabel = escapeHtml(content.reportLabel);
  const reportUrl = escapeHtml(content.reportUrl);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your report</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1C2E47; max-width: 600px; margin: 0 auto; padding: 20px;">
    <p>Hi ${clientName},</p>
    <p>${businessName} has finished your report for ${propertyAddress} (report ${reportLabel}).</p>
    <p style="margin: 28px 0;">
      <a href="${reportUrl}" style="display: inline-block; background: #1C2E47; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600;">View your report</a>
    </p>
    <p style="font-size: 14px; color: #475569;">This link opens the report without a password and works for ${LINK_VALID_DAYS} days. Please only share it with people you want to see the report.</p>
    <p style="font-size: 14px; color: #475569;">Questions? Reply to this email to reach ${businessName}.</p>
  </body>
</html>`;
}

function buildReportEmailText(content: ReportEmailContent): string {
  return `Hi ${content.clientName},

${content.businessName} has finished your report for ${content.propertyAddress} (report ${content.reportLabel}).

View your report: ${content.reportUrl}

This link opens the report without a password and works for ${LINK_VALID_DAYS} days. Please only share it with people you want to see the report.

Questions? Reply to this email to reach ${content.businessName}.`;
}
