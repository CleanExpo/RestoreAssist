import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-send";
import {
  inspectionSubmittedEmail,
  scopeReadyEmail,
  invoiceGeneratedEmail,
  dryingGoalAchievedEmail,
  reportReadyEmail,
  reengagementEmail,
} from "@/lib/email-templates";
import { BRAND } from "@/lib/brand";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export const EVENTS = [
  "inspection_submitted",
  "scope_ready",
  "invoice_generated",
  "drying_goal_achieved",
  "report_ready",
  "customer_reengagement",
] as const;

type EventType = (typeof EVENTS)[number];

// ── GET /api/notifications/email ──────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ events: EVENTS });
}

// ── POST /api/notifications/email ─────────────────────────────────────────

interface PostBody {
  event: EventType;
  inspectionId?: string;
  invoiceId?: string;
  recipientEmail: string;
  /** customer_reengagement only — the addressee's name for the greeting. */
  recipientName?: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: a notification email that fires twice lands twice in the
  // customer's inbox — idempotency catches the retry case cheaply.
  return withIdempotency(req, userId, async (rawBody) => {
    let body: PostBody;
    try {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      body = (
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {}
      ) as PostBody;
    } catch {
      return apiError(req, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const { event, inspectionId, invoiceId, recipientEmail } = body;

    if (!event || !EVENTS.includes(event)) {
      return apiError(req, {
        code: "VALIDATION",
        message: `Invalid event. Must be one of: ${EVENTS.join(", ")}`,
        status: 400,
      });
    }

    if (!recipientEmail) {
      return apiError(req, {
        code: "VALIDATION",
        message: "recipientEmail is required",
        status: 400,
      });
    }

    // Guard: RESEND_API_KEY check (no throw — return informative response)
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        sent: false,
        reason: "RESEND_API_KEY not set",
        event,
        to: recipientEmail,
      });
    }

    try {
      // ── customer_reengagement: no inspection/invoice; admin-only because it
      //    can target an arbitrary address. Reply-to points at the monitored
      //    RestoreAssist mailbox (RESEND_REPLY_TO env, else the support inbox)
      //    so replies land somewhere a human reads. Sends from the verified
      //    restoreassist.app domain — a @gmail.com From cannot be
      //    SPF/DKIM-authenticated through Resend and would bounce/spam.
      if (event === "customer_reengagement") {
        const auth = await verifyAdminFromDb(session);
        if (auth.response) return auth.response;

        const baseUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
        const replyTo =
          process.env.RESEND_REPLY_TO || BRAND.company.supportEmail;
        await sendEmail({
          to: recipientEmail,
          subject: "Pick up where you left off — RestoreAssist",
          html: reengagementEmail({
            recipientName: body.recipientName?.trim() || "there",
            ctaUrl: `${baseUrl}/dashboard/pricing?utm_source=reengagement`,
            senderName: session.user.name ?? undefined,
          }),
          replyTo,
        });
        return NextResponse.json({ sent: true, event, to: recipientEmail });
      }

      let subject: string;
      let html: string;

      // ── invoice_generated uses Invoice record ──
      if (event === "invoice_generated") {
        if (!invoiceId) {
          return apiError(req, {
            code: "VALIDATION",
            message: "invoiceId is required for invoice_generated",
            status: 400,
          });
        }
        const invoice = await prisma.invoice.findFirst({
          where: { id: invoiceId, userId },
          select: {
            invoiceNumber: true,
            dueDate: true,
            totalIncGST: true,
            customerAddress: true,
          },
        });
        if (!invoice) {
          return apiError(req, {
            code: "NOT_FOUND",
            message: "Invoice not found",
            status: 404,
          });
        }
        subject = `Invoice ${invoice.invoiceNumber} — RestoreAssist`;
        html = invoiceGeneratedEmail({
          invoiceNumber: invoice.invoiceNumber,
          address: invoice.customerAddress ?? "N/A",
          totalIncGST: invoice.totalIncGST ?? 0,
          dueDate: invoice.dueDate
            ? new Date(invoice.dueDate).toLocaleDateString("en-AU")
            : "N/A",
        });
      } else {
        // All other events need an inspection
        if (!inspectionId) {
          return apiError(req, {
            code: "VALIDATION",
            message: "inspectionId is required for this event",
            status: 400,
          });
        }
        const inspection = await prisma.inspection.findFirst({
          where: { id: inspectionId, userId },
          select: {
            inspectionNumber: true,
            propertyAddress: true,
            technicianName: true,
            submittedAt: true,
            scopeItems: { select: { id: true } },
          },
        });
        if (!inspection) {
          return apiError(req, {
            code: "NOT_FOUND",
            message: "Inspection not found",
            status: 404,
          });
        }

        const baseUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";

        switch (event) {
          case "inspection_submitted":
            subject = `Inspection ${inspection.inspectionNumber} submitted`;
            html = inspectionSubmittedEmail({
              inspectionNumber: inspection.inspectionNumber,
              address: inspection.propertyAddress,
              technicianName: inspection.technicianName ?? "N/A",
            });
            break;

          case "scope_ready":
            subject = `Scope ready — ${inspection.inspectionNumber}`;
            html = scopeReadyEmail({
              inspectionNumber: inspection.inspectionNumber,
              address: inspection.propertyAddress,
              scopeItemCount: inspection.scopeItems.length,
              portalUrl: `${baseUrl}/dashboard/inspections/${inspectionId}`,
            });
            break;

          case "drying_goal_achieved":
            subject = `Drying goal achieved — ${inspection.inspectionNumber}`;
            html = dryingGoalAchievedEmail({
              inspectionNumber: inspection.inspectionNumber,
              address: inspection.propertyAddress,
              completionDate: new Date().toLocaleDateString("en-AU"),
            });
            break;

          case "report_ready":
            subject = `Report ready — ${inspection.inspectionNumber}`;
            html = reportReadyEmail({
              inspectionNumber: inspection.inspectionNumber,
              address: inspection.propertyAddress,
              reportUrl: `${baseUrl}/dashboard/inspections/${inspectionId}/report`,
            });
            break;

          default:
            return apiError(req, {
              code: "VALIDATION",
              message: "Unhandled event",
              status: 400,
            });
        }
      }

      await sendEmail({ to: recipientEmail, subject, html });

      return NextResponse.json({ sent: true, event, to: recipientEmail });
    } catch (err) {
      return fromException(req, err, { stage: "send-email" });
    }
  });
}
