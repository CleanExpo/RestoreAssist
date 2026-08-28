import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, fromException } from "@/lib/api-errors";
import { rejectIfIOSCapacitor } from "@/lib/ios-billing-guard";
import { applyRateLimit } from "@/lib/rate-limiter";
import { stripe } from "@/lib/stripe";

const checkoutSchema = z.object({
  package: z.enum(["single", "three"]),
});

const AUDIT_PACKAGES = {
  single: {
    amount: 14900,
    audits: 1,
    name: "RestoreAssist Restoration Job File Audit",
    description:
      "One professional review of an existing restoration job file for evidence, chronology and documentation gaps.",
  },
  three: {
    amount: 39900,
    audits: 3,
    name: "RestoreAssist 3-Job File Audit Pack",
    description:
      "Three professional restoration job-file reviews for evidence, chronology and documentation gaps.",
  },
} as const;

function baseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://restoreassist.app"
      : "http://localhost:3000")
  );
}

export async function POST(request: NextRequest) {
  const iosBlocked = rejectIfIOSCapacitor(request);
  if (iosBlocked) return iosBlocked;

  const rateLimited = await applyRateLimit(request, {
    prefix: "revenue-job-file-audit-checkout",
    maxRequests: 10,
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

    const parsed = checkoutSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Choose a valid audit package",
        status: 400,
      });
    }

    const selected = AUDIT_PACKAGES[parsed.data.package];
    const origin = baseUrl();

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_creation: "always",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "aud",
            unit_amount: selected.amount,
            tax_behavior: "exclusive",
            product_data: {
              name: selected.name,
              description: selected.description,
            },
          },
        },
      ],
      success_url: `${origin}/job-file-audit/intake?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/job-file-audit?canceled=true`,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      metadata: {
        offer: "job-file-audit",
        package: parsed.data.package,
        includedAudits: String(selected.audits),
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    return fromException(request, error, {
      stage: "job-file-audit-checkout",
    });
  }
}
