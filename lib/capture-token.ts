import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Homeowner capture token (spec §2; design: docs/mapping-v2/homeowner-capture-security-design.md).
 *
 * A capture token grants WRITE access to exactly ONE inspection's sketch,
 * time-boxed and revocable. It is:
 *   - opaque — no inspection id embedded (resolved from the token binding only);
 *   - high-entropy — 256-bit;
 *   - stored only as a SHA-256 hash at rest (never plaintext);
 *   - looked up by hash (the raw token is never compared in plaintext).
 *
 * Distinct from the HMAC view-portal token (lib/portal-token.ts), which is
 * stateless + non-revocable and must NOT be used for writes (design §0).
 */

export interface GeneratedCaptureToken {
  /** Plaintext — shown once to the issuer (emailed link); never persisted. */
  token: string;
  /** SHA-256 hex of the token — the only form stored at rest. */
  tokenHash: string;
}

/** 32 bytes = 256-bit entropy, base64url (~43 chars), opaque. */
export function generateCaptureToken(): GeneratedCaptureToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashCaptureToken(token) };
}

/** One-way SHA-256 hash (hex). Deterministic; the at-rest representation. */
export function hashCaptureToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CaptureTokenResolution {
  inspectionId: string;
  captureTokenId: string;
}

/**
 * Resolve a plaintext capture token to its bound inspection, or null when the
 * token is unknown / expired / revoked. Resolution is by hash lookup — the raw
 * token is never trusted for an inspection id. `now` is injectable for tests.
 */
export async function verifyCaptureToken(
  token: string,
  now: Date = new Date(),
): Promise<CaptureTokenResolution | null> {
  if (!token) return null;
  const tokenHash = hashCaptureToken(token);
  const row = await prisma.captureToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  return { inspectionId: row.inspectionId, captureTokenId: row.id };
}
