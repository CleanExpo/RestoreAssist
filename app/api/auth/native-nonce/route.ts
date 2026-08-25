import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { apiError, fromException } from "@/lib/api-errors";

const NONCE_TTL_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, {
    maxRequests: 20,
    windowMs: 15 * 60 * 1000,
    prefix: "native-auth-nonce",
  });
  if (limited) return limited;
  let provider: unknown;
  try {
    provider = (await request.json())?.provider;
  } catch {
    provider = null;
  }
  if (provider !== "apple" && provider !== "google") {
    return apiError(request, {
      code: "VALIDATION",
      message: "provider must be apple or google",
      status: 400,
    });
  }
  try {
    const nonce = crypto.randomBytes(32).toString("base64url");
    const nonceHash = crypto.createHash("sha256").update(nonce).digest("hex");
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
    await (prisma as any).nativeAuthNonce.create({
      data: { nonceHash, provider, expiresAt },
    });
    return NextResponse.json(
      { nonce, expiresAt: expiresAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fromException(request, error, { stage: "native-auth-nonce:create" });
  }
}
