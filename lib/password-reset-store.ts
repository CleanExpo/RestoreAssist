import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export function generateResetCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function storeResetCode(
  email: string,
  code: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  // Delete any existing unused codes for this email
  await prisma.passwordResetToken.deleteMany({
    where: {
      email: normalizedEmail,
      usedAt: null,
    },
  });

  // Create new reset code
  await prisma.passwordResetToken.create({
    data: {
      token: code,
      email: normalizedEmail,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
    },
  });
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

  // Increment attempts
  await prisma.passwordResetToken.update({
    where: { id: entry.id },
    data: { attempts: entry.attempts + 1 },
  });

  if (entry.token !== code) {
    return { valid: false, error: "Invalid verification code." };
  }

  // Code is valid - mark as used
  await prisma.passwordResetToken.update({
    where: { id: entry.id },
    data: { usedAt: new Date() },
  });

  return { valid: true };
}

export async function storeClientResetCode(
  clientUserId: string,
  email: string,
  code: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  await prisma.clientPasswordResetToken.deleteMany({
    where: { clientUserId, usedAt: null },
  });

  await prisma.clientPasswordResetToken.create({
    data: {
      token: code,
      email: normalizedEmail,
      clientUserId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  });
}

export async function verifyClientResetCode(
  clientUserId: string,
  email: string,
  code: string,
): Promise<{ valid: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase();
  const entry = await prisma.clientPasswordResetToken.findFirst({
    where: { clientUserId, email: normalizedEmail, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!entry || new Date() > entry.expiresAt || entry.attempts >= 5) {
    if (entry) {
      await prisma.clientPasswordResetToken.delete({
        where: { id: entry.id },
      });
    }
    return { valid: false, error: "Invalid or expired verification code." };
  }

  if (entry.token !== code) {
    await prisma.clientPasswordResetToken.update({
      where: { id: entry.id },
      data: { attempts: { increment: 1 } },
    });
    return { valid: false, error: "Invalid or expired verification code." };
  }

  const consumed = await prisma.clientPasswordResetToken.updateMany({
    where: {
      id: entry.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: 5 },
    },
    data: { usedAt: new Date() },
  });

  return consumed.count === 1
    ? { valid: true }
    : { valid: false, error: "Invalid or expired verification code." };
}
