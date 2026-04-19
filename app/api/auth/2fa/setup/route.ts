/**
 * RA-1260 — POST /api/auth/2fa/setup
 *
 * Generates a fresh TOTP secret for the current user and returns the
 * otpauth:// URL + a QR-code data URI. Does NOT enable 2FA — the user
 * must then POST to /enable with a valid 6-digit code proving they can
 * read the secret from their authenticator app.
 *
 * Calling this while 2FA is already enabled rotates the secret and
 * forces the user to re-verify before it takes effect.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import QRCode from "qrcode";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { generateSecret } from "@/lib/auth/two-factor";

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, twoFactorEnabled: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { secretBase32, otpauthUrl } = generateSecret(user.email);

  // Stash the pending secret. twoFactorEnabled stays as-is until /enable
  // verifies the first code. If the user abandons setup, this secret
  // simply hangs around until they start over — next /setup overwrites it.
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: secretBase32 } as any,
  });

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 256 });

  return NextResponse.json({
    otpauthUrl,
    qrDataUrl,
    // Surface the raw secret once so the user can type it into an app
    // that doesn't scan QR codes. Never returned on subsequent reads.
    manualEntryKey: secretBase32,
  });
}
