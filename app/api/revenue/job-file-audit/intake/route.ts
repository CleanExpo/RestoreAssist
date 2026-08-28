import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, fromException } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { stripe } from "@/lib/stripe";

const intakeSchema = z.object({
  sessionId: z.string().min(10).max(255),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  businessName: z.string().min(1).max(200),
  phone: z.string().max(80).optional().default(""),
  jobReference: z.string().max(200).optional().default(""),
  jobSummary: z.string().min(20).max(5000),
  website: z.string().max(200).optional().default(""),
});

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, {
    prefix: "revenue-job-file-audit-intake",
    maxRequests: 8,
    windowMs: 15 * 60 * 1000,
    failClosedOnUpstashError: true,
  });
  if (rateLimited) return rateLimited;

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const parsed = intakeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 },
      );
    }

    const data = parsed.data;
    if (data.website) {
      return NextResponse.json({ ok: true, id: "queued" }, { status: 201 });
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(
      data.sessionId,
    );

    if (
      checkoutSession.payment_status !== "paid" ||
      checkoutSession.metadata?.offer !== "job-file-audit"
    ) {
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: "A completed Job File Audit payment is required",
        status: 402,
      });
    }

    const payerEmail = checkoutSession.customer_details?.email ?? "not supplied";
    if (
      payerEmail === "not supplied" ||
      payerEmail.trim().toLowerCase() !== data.email.trim().toLowerCase()
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Use the email address supplied during payment",
        status: 403,
      });
    }

    const packageName = checkoutSession.metadata?.package ?? "unknown";
    const includedAudits = checkoutSession.metadata?.includedAudits ?? "1";

    const body = [
      `Paid RestoreAssist Job File Audit intake`,
      `Stripe checkout session: ${checkoutSession.id}`,
      `Package: ${packageName} (${includedAudits} audit${includedAudits === "1" ? "" : "s"})`,
      `Payment email: ${payerEmail}`,
      `Business: ${data.businessName}`,
      `Contact: ${data.name}`,
      `Contact email: ${data.email}`,
      `Phone: ${data.phone || "not supplied"}`,
      `Job reference: ${data.jobReference || "not supplied"}`,
      "",
      "Customer summary:",
      data.jobSummary,
      "",
      "Fulfilment note: request the job report, photographs, moisture/drying records and relevant scope/communications through the approved secure file-sharing channel before review.",
    ].join("\n");

    let ticket: { id: string };
    try {
      ticket = await prisma.supportTicket.create({
        data: {
          externalReference: `stripe:job-file-audit:${checkoutSession.id}`,
          email: data.email,
          name: data.name,
          subject: `PAID Job File Audit — ${data.businessName}`,
          body,
          category: "general",
          priority: "high",
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        return apiError(request, {
          code: "CONFLICT",
          message: "This payment has already been submitted",
          status: 409,
        });
      }
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        id: ticket.id,
        message:
          "Payment verified and intake received. We will send the secure file-request instructions next.",
      },
      { status: 201 },
    );
  } catch (error) {
    return fromException(request, error, {
      stage: "job-file-audit-intake",
    });
  }
}
