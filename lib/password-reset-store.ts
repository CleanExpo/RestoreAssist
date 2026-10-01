import { RESET_CODE_TTL_MINUTES } from "@/lib/auth/recovery-policy";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export function generateResetCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function storeResetCode(
  email: string,
  code: string,
): Promise<{ id: string; expiresAt: Date }> {
  const normalizedEmail = email.toLowerCase();

  // Delete any existing unused codes for this email
  await prisma.passwordResetToken.deleteMany({
    where: {
      email: normalizedEmail,
      usedAt: null,
    },
  });

  // Create new reset code
  const created = await prisma.passwordResetToken.create({
    data: {
      token: code,
      email: normalizedEmail,
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000),
      attempts: 0,
    },
    select: { id: true, expiresAt: true },
  });
  return created;
}

export async function verifyResetCode(
  email: string,
  code: string,
): Promise<{ valid: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase();

  const entry = await prisma.passwordResetToken.findFirst({
    where: {
      email: normalizedEmail,
      usedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!entry) {
    return {
      valid: false,
      error: "No reset code found. Please request a new one.",
    };
  }

  if (new Date() > entry.expiresAt) {
    await prisma.passwordResetToken.delete({ where: { id: entry.id } });
    return {
      valid: false,
      error: "Reset code has expired. Please request a new one.",
    };
  }

  // Max 5 attempts to prevent brute force
  if (entry.attempts >= 5) {
    await prisma.passwordResetToken.delete({ where: { id: entry.id } });
    return {
      valid: false,
      error: "Too many attempts. Please request a new code.",
    };
  }

  const matches = entry.token === code;
  // Claim the attempt (and, for a match, consume the code) in one conditional
  // write. Concurrent resets cannot both accept the same one-time code or
  // lose attempt increments. Recheck expiry at the write boundary.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: {
      id: entry.id,
      token: entry.token,
      usedAt: null,
      attempts: { lt: 5 },
      expiresAt: { gt: new Date() },
    },
    data: {
      attempts: { increment: 1 },
      ...(matches ? { usedAt: new Date() } : {}),
    },
  });
  if (claimed.count !== 1) {
    return { valid: false, error: "Invalid or expired verification code. Please request a new one." };
  }
  if (!matches) return { valid: false, error: "Invalid verification code." };

  return { valid: true };
}
