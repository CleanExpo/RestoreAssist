/**
 * RA-1260 — POST /api/auth/2fa/disable
 *
 * Turns 2FA off. Requires the current password so a momentarily-unattended
 * logged-in session can't be used to remove the second factor silently.
 *
 * Body: { currentPassword: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const rateLimited = await applyRateLimit(req, {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    prefix: "2fa-disable",
  });
  if (rateLimited) return rateLimited;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { currentPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword) {
    return NextResponse.json(
      { error: "Current password is required to disable 2FA" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });
  if (!user || !user.password) {
    return NextResponse.json(
      { error: "Password not set on this account" },
      { status: 400 },
    );
  }

  const passwordOk = await bcrypt.compare(currentPassword, user.password);
  if (!passwordOk) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorEnabledAt: null,
    } as any,
  });

  return NextResponse.json({
    success: true,
    message: "Two-factor authentication disabled.",
  });
}
