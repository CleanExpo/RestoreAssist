import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError, fromException } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { verifyPulseUnsubscribeToken } from "@/lib/pulse/pulse-unsubscribe-token";
import { applyRateLimit } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 15 * 60 * 1000;

function verifyToken(token: string | null): string | null {
  if (!token) return null;
  try {
    return verifyPulseUnsubscribeToken(token);
  } catch (error) {
    // A missing secret cannot verify anything, so it is refused, not accepted.
    console.error("[pulse:unsubscribe] token check unavailable:", error);
    return null;
  }
}

/**
 * RFC 8058 one-click target, and the page's confirm button (RA-7979).
 *
 * Public by design: a mail client posts this with no session, so the signed
 * token is the authority. It never reveals whether a token matched a record
 * beyond valid or not, and the token value is never logged.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  const byAddress = await applyRateLimit(request, {
    maxRequests: 30,
    windowMs: RATE_WINDOW_MS,
    prefix: "pulse-unsubscribe-ip",
  });
  if (byAddress) return byAddress;
  const byToken = await applyRateLimit(request, {
    maxRequests: 10,
    windowMs: RATE_WINDOW_MS,
    prefix: "pulse-unsubscribe-token",
    key: createHash("sha256")
      .update(token ?? "")
      .digest("hex"),
  });
  if (byToken) return byToken;

  const clientId = verifyToken(token);
  if (!clientId) {
    console.info("[pulse:opt-out]", { outcome: "refused" });
    return apiError(request, {
      code: "VALIDATION",
      message: "This unsubscribe link is invalid or incomplete.",
      status: 400,
    });
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, userId: true, email: true },
    });
    // Never confirm a withdrawal that was not recorded.
    if (!client) {
      console.info("[pulse:opt-out]", { outcome: "no_record", clientId });
      return apiError(request, {
        code: "NOT_FOUND",
        message: "This unsubscribe link no longer matches a record.",
        status: 404,
      });
    }
    // The withdrawal is the person's: it covers every record this business
    // holds for the address, and no other business's records.
    const email = client.email?.trim();
    const updated = await prisma.client.updateMany({
      where: email
        ? {
            userId: client.userId,
            email: { equals: email, mode: "insensitive" },
          }
        : { id: client.id },
      data: { pulseOptOut: true },
    });
    console.info("[pulse:opt-out]", {
      outcome: "recorded",
      source: "client",
      clientId,
      records: updated.count,
    });
  } catch (error) {
    return fromException(request, error, { stage: "pulse-unsubscribe" });
  }

  const form = await request.formData().catch(() => null);
  if (form?.get("source") === "page") {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/pulse/unsubscribe?done=1" },
    });
  }
  return NextResponse.json({ data: { unsubscribed: true } });
}
