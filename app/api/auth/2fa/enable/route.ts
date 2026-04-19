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
import { verifyToken } from "@/lib/auth/two-factor";

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  // RA-1260 — rate-limit code-verify attempts to blunt online brute force.
  // At 5 tries per 5 min and 6-digit codes, expected-guess count to crack
  // stays in the hundreds-of-years range.
  const rateLimited = await applyRateLimit(req, {
    maxRequests: 5,
    windowMs: 5 * 60 * 1000,
    prefix: "2fa-enable",
  });
  if (rateLimited) return rateLimited;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Enter the 6-digit code from your authenticator app" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true } as any,
  });
  if (!user || !(user as any).twoFactorSecret) {
    return NextResponse.json(
      { error: "Run setup first to generate a secret" },
      { status: 400 },
    );
  }

  const ok = verifyToken((user as any).twoFactorSecret, code);
  if (!ok) {
    return NextResponse.json(
      {
        error:
          "Code didn't match. Make sure your device clock is accurate and try the next code.",
      },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date(),
    } as any,
  });

  return NextResponse.json({
    success: true,
    message: "Two-factor authentication enabled.",
  });
}
