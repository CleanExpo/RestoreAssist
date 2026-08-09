import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Resend } from "resend";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { escapeHtml, withEmailTimeout } from "@/lib/email";
import { resolveResendConfig } from "@/lib/email/resolve-resend-config";
import { withIdempotency } from "@/lib/idempotency";
import { generateInsurerToken } from "@/lib/portal-token";
import { REPORT_SENT_ACTION } from "@/lib/lifecycle/report-delivery";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitiseSubject(value: string): string {
  return value.replace(/[\r\n]/g, " ").slice(0, 255);
}

/** POST /api/reports/[id]/send — send a completed report to its linked client. */
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

  if (!request.headers.get("Idempotency-Key")) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Idempotency-Key is required for report delivery",
      status: 400,
    });
  }

  const userId = session.user.id;
  return withIdempotency(request, userId, async () => {
    try {
      const { id } = await params;
      const report = await prisma.report.findFirst({
        where: { id, userId },
        select: {
          id: true,
          title: true,
          reportNumber: true,
          propertyAddress: true,
          status: true,
          inspection: { select: { id: true } },
          client: { select: { name: true, email: true, userId: true } },
          user: {
            select: {
              name: true,
              email: true,
              businessName: true,
              businessEmail: true,
              organizationId: true,
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
          message: "Complete the report before sending it",
          status: 409,
        });
      }
      if (!report.inspection) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Report is not linked to an inspection",
          status: 409,
        });
      }

      if (!report.client || report.client.userId !== userId) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Link a client owned by this workspace before sending",
          status: 409,
        });
      }

      const recipientEmail = report.client.email.trim();
      if (!EMAIL_PATTERN.test(recipientEmail)) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "Add a valid email address to the linked client before sending",
          status: 409,
        });
      }

      const resendConfig = await resolveResendConfig(
        report.user.organizationId,
      );
      if (!resendConfig?.apiKey.trim()) {
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message:
            "Email service is not configured. Connect Resend in Integrations before sending reports.",
          status: 503,
        });
      }

      const token = generateInsurerToken(report.id);
      const baseUrl =
        process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
        "https://restoreassist.app";
      const reportUrl = `${baseUrl}/reports/${report.id}/view?token=${token}`;
      const senderName =
        report.user.businessName || report.user.name || "RestoreAssist";
      const recipientName = report.client?.name || "there";
      const reportLabel = report.reportNumber || report.title;
      const subject = sanitiseSubject(`${reportLabel} from ${senderName}`);
      const html = `
        <p>Hello ${escapeHtml(recipientName)},</p>
        <p>${escapeHtml(senderName)} has sent you the completed report for ${escapeHtml(report.propertyAddress)}.</p>
        <p><a href="${escapeHtml(reportUrl)}">View report</a></p>
        <p>This secure link expires after 30 days.</p>
      `;

      const resend = new Resend(resendConfig.apiKey.trim());
      let providerMessageId: string;
      try {
        const { data, error } = await withEmailTimeout(
          resend.emails.send({
            from: resendConfig.from,
            to: recipientEmail,
            subject,
            html,
            ...(report.user.businessEmail || report.user.email
              ? {
                  replyTo:
                    report.user.businessEmail || report.user.email || undefined,
                }
              : {}),
          }),
        );

        if (error || !data?.id) {
          await prisma.emailAudit.create({
            data: {
              userId,
              reportId: report.id,
              recipient: recipientEmail,
              success: false,
              error: "provider_rejected",
              deliveryType: "immediate",
            },
            select: { id: true },
          });
          return apiError(request, {
            code: "UPSTREAM_FAILED",
            message:
              "The email provider did not accept the report. Check the email integration and try again.",
            status: 503,
          });
        }
        providerMessageId = data.id;
      } catch (error) {
        await prisma.emailAudit.create({
          data: {
            userId,
            reportId: report.id,
            recipient: recipientEmail,
            success: false,
            error: "provider_unavailable",
            deliveryType: "immediate",
          },
          select: { id: true },
        });
        console.error("[report-send] provider request failed", error);
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message:
            "The email provider is unavailable. The report was not marked as sent.",
          status: 503,
        });
      }

      const acceptedAt = new Date();
      try {
        await prisma.$transaction([
          prisma.emailAudit.create({
            data: {
              userId,
              reportId: report.id,
              recipient: recipientEmail,
              success: true,
              deliveryType: "immediate",
            },
            select: { id: true },
          }),
          prisma.auditLog.create({
            data: {
              inspectionId: report.inspection.id,
              userId,
              action: REPORT_SENT_ACTION,
              entityType: "Report",
              entityId: report.id,
              changes: JSON.stringify({
                channel: "email",
                provider: "resend",
                providerMessageId,
                recipientEmail,
                recipientType: "client",
                deliveryStatus: "provider_accepted",
                acceptedAt: acceptedAt.toISOString(),
              }),
            },
            select: { id: true, timestamp: true },
          }),
        ]);
      } catch (error) {
        // The provider already accepted this message. Return a cacheable
        // conflict so replaying the same Idempotency-Key cannot send it again
        // while closure remains blocked pending audit reconciliation.
        return apiError(request, {
          code: "CONFLICT",
          message:
            "The email provider accepted the report, but delivery evidence could not be saved. Do not resend; contact support.",
          status: 409,
          err: error,
          stage: "persist-report-send",
          context: { reportId: report.id, providerMessageId },
        });
      }

      return NextResponse.json({
        sent: true,
        deliveryStatus: "provider_accepted",
        providerMessageId,
        recipientEmail,
      });
    } catch (error) {
      return fromException(request, error, { stage: "report-send" });
    }
  });
}
