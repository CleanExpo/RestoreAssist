/**
 * Text the Job In (S1) — one-time codes that link a chat account to a user.
 *
 * Stored in the existing VerificationToken table (no new table):
 *   identifier  "messaging-link:<userId>"
 *   token       sha256(code) — the plain code is never stored
 *   expires     now + 10 minutes
 *
 * Redeeming deletes the token row first and only proceeds when that delete
 * claimed it, so a code works exactly once even under concurrent texts.
 */

import { createHash, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

const IDENTIFIER_PREFIX = "messaging-link:";
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
// No 0/O/1/I/L so a code read off a screen is typed correctly.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

function hashCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function normaliseLinkCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Issue a fresh code for a user, replacing any earlier unused one. */
export async function issueLinkCode(
  userId: string,
): Promise<{ code: string; expiresAt: Date }> {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  const identifier = `${IDENTIFIER_PREFIX}${userId}`;
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: { identifier, token: hashCode(code), expires: expiresAt },
    }),
  ]);
  return { code, expiresAt };
}

/**
 * Consume a code and mark (channel, address) as verified for its user.
 * Returns the linked userId, or null when the code is unknown, expired or used.
 */
export async function redeemLinkCode(
  rawCode: string,
  channel: string,
  address: string,
): Promise<string | null> {
  const token = hashCode(normaliseLinkCode(rawCode));
  const row = await prisma.verificationToken.findUnique({
    where: { token },
    select: { identifier: true },
  });
  if (!row || !row.identifier.startsWith(IDENTIFIER_PREFIX)) return null;

  const claimed = await prisma.verificationToken.deleteMany({
    where: { token, identifier: row.identifier, expires: { gt: new Date() } },
  });
  if (claimed.count !== 1) return null;

  const userId = row.identifier.slice(IDENTIFIER_PREFIX.length);
  const now = new Date();
  await prisma.messagingIdentity.upsert({
    where: { channel_address: { channel, address } },
    create: { userId, channel, address, verifiedAt: now },
    update: { userId, verifiedAt: now },
    select: { id: true },
  });
  return userId;
}
