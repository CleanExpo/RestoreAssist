import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { sanitizeString } from "@/lib/sanitize";
import { isValidAbn } from "@/lib/abn/checksum";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * RA-1259: Capture the AU business details that the Google OAuth signup
 * path skipped. On success, flips `needsOnboarding` to false so the
 * middleware stops redirecting to /onboarding/account-type.
 *
 * Rules:
 * - Auth required (session.user.id).
 * - ABN must pass the ATO mod-89 checksum (strip whitespace before validating).
 * - ACN optional but, if supplied, must be 9 digits.
 * - state must be one of the 8 AU states/territories.
 * - Terms acceptance is mandatory (mirrors /api/auth/register).
 */

const AU_STATES = [
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
] as const;
type AuState = (typeof AU_STATES)[number];

function normaliseDigits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, "") : "";
}

export async function POST(request: NextRequest) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid request body",
      status: 400,
    });
  }

  const businessName = sanitizeString(body.businessName, 200);
  const abn = normaliseDigits(body.abn);
  const acnRaw = normaliseDigits(body.acn);
  const state = typeof body.state === "string" ? body.state.toUpperCase() : "";
  const acceptedTerms = body.acceptedTerms === true;

  if (!businessName) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Business name is required",
      status: 400,
    });
  }
  // RA-6793: enforce the ATO mod-89 checksum (not just digit count) so invalid
  // ABNs cannot pass onboarding. Matches /api/user/profile, which already gates
  // on the checksum — an invalid ABN on a tax invoice forces 47% PAYG withholding.
  if (!isValidAbn(abn)) {
    return apiError(request, {
      code: "VALIDATION",
      message:
        "Invalid ABN — please enter a valid 11-digit Australian Business Number",
      status: 400,
    });
  }
  if (acnRaw && !/^\d{9}$/.test(acnRaw)) {
    return apiError(request, {
      code: "VALIDATION",
      message: "ACN must be 9 digits if supplied",
      status: 400,
    });
  }
  if (!AU_STATES.includes(state as AuState)) {
    return apiError(request, {
      code: "VALIDATION",
      message: "State must be one of: " + AU_STATES.join(", "),
      status: 400,
    });
  }
  if (!acceptedTerms) {
    return apiError(request, {
      code: "VALIDATION",
      message:
        "You must accept the Terms of Service and Privacy Policy to continue",
      status: 400,
    });
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        businessName,
        businessABN: abn,
        businessACN: acnRaw || null,
        businessState: state,
        needsOnboarding: false,
        acceptedTermsAt: new Date(),
      } as any,
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return fromException(request, err, { stage: "account-type" });
  }
}
