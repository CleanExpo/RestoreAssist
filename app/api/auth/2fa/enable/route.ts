/**
 * RA-1260 — POST /api/auth/2fa/enable
 *
 * Verifies a 6-digit TOTP code against the secret stored by /setup.
 * If it matches, flips `twoFactorEnabled` to true and stamps
 * `twoFactorEnabledAt`. The user's next login will prompt for a code.
 *
 * Body: { code: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  verifyToken,
  generateRecoveryCodes,
  serializeRecoveryCodes,
} from "@/lib/auth/two-factor";
import { apiError } from "@/lib/api-errors";

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  // RA-1260 — rate-limit code-verify attempts to blunt online brute force.
  // At 5 tries per 5 min and 6-digit codes, expected-guess count to crack
  // stays in the hundreds-of-years range. Keyed on session.user.id (CLAUDE.md
  // rule 8) so rotating source IPs can't multiply the per-user attempt budget.
  const rateLimited = await applyRateLimit(req, {
    maxRequests: 5,
    windowMs: 5 * 60 * 1000,
    prefix: "2fa-enable",
    key: session.user.id,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid JSON body",
      status: 400,
    });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Enter the 6-digit code from your authenticator app",
      status: 400,
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true } as any,
  });
  if (!user || !(user as any).twoFactorSecret) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Run setup first to generate a secret",
      status: 400,
    });
  }

  const ok = verifyToken((user as any).twoFactorSecret, code);
  if (!ok) {
    return apiError(req, {
      code: "VALIDATION",
      message:
        "Code didn't match. Make sure your device clock is accurate and try the next code.",
      status: 400,
    });
  }

  // RA-1588 — mint recovery codes at enrolment so losing the authenticator
  // device is not a permanent lockout. Plain codes are returned ONCE in
  // this response; the DB stores only bcrypt hashes. Each code is
  // single-use and spliced out on consumption.
  const { plain: recoveryCodes, hashed } = await generateRecoveryCodes();

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date(),
      twoFactorRecoveryCodes: serializeRecoveryCodes(hashed),
    } as any,
  });

  return NextResponse.json({
    success: true,
    message: "Two-factor authentication enabled.",
    recoveryCodes,
    recoveryCodesWarning:
      "Save these recovery codes somewhere safe. Each is single-use and can log you in if you lose your authenticator device. They will not be shown again.",
  });
}
