/**
 * RA-437: POST /api/vision/extract-reading
 * Accepts a base64 image of a moisture meter and returns the extracted reading
 * using Claude Vision (claude-sonnet-4-6).
 *
 * Body: { image: string (base64), mediaType?: "image/jpeg"|"image/png"|"image/webp" }
 * Response: { reading: MeterReadingResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { extractMeterReading } from "@/lib/services/ai/extract-reading";
import { apiError, fromException } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimitResponse = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    prefix: "vision",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimitResponse) return rateLimitResponse;

  // RA-1266: vision extraction hits Claude — retry doubles AI spend
  // on identical image input.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, subscriptionStatus: true },
      });

      if (!user) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "User not found",
          status: 404,
        });
      }

      if (
        !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
      ) {
        return apiError(request, {
          code: "PAYMENT_REQUIRED",
          message: "Active subscription required",
          status: 402,
        });
      }

      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { image, mediaType: rawMediaType = "image/jpeg" } = body as {
        image?: string;
        mediaType?: unknown;
      };

      if (!image || typeof image !== "string") {
        return apiError(request, {
          code: "VALIDATION",
          message: "image (base64 string) is required",
          status: 400,
        });
      }

      // Validate base64 characters before hitting Anthropic — avoids a costly
      // external API call on obviously malformed input.
      if (!/^[A-Za-z0-9+/]+=*$/.test(image)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "image must be a valid base64-encoded string",
          status: 400,
        });
      }

      // Runtime mediaType allowlist — TypeScript cast alone doesn't validate at runtime;
      // an attacker can send arbitrary strings that get forwarded to Anthropic's API.
      const ALLOWED_MEDIA_TYPES = [
        "image/jpeg",
        "image/png",
        "image/webp",
      ] as const;
      type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];
      const mediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(
        rawMediaType as AllowedMediaType,
      )
        ? (rawMediaType as AllowedMediaType)
        : "image/jpeg";

      // Guard: Claude Vision accepts up to ~5MB base64
      const byteSize = Math.ceil((image.length * 3) / 4);
      if (byteSize > 5 * 1024 * 1024) {
        return apiError(request, {
          code: "PAYLOAD_TOO_LARGE",
          message: "Image too large — maximum 5MB",
          status: 413,
        });
      }

      // RA-6921 (P0) — resolve the workspace's own BYOK key; never spend the
      // platform's ANTHROPIC_API_KEY on a client's vision-extraction workload.
      let apiKey: string;
      try {
        apiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
      } catch (err) {
        if (!(err instanceof NoWorkspaceKeyError)) throw err;
        console.error("[VisionExtractReading]", {
          userId,
          reason: "KEY_MISSING",
          detail: "No workspace Anthropic key configured",
        });
        return NextResponse.json({ error: "KEY_MISSING" }, { status: 402 });
      }

      const result = await extractMeterReading({
        apiKey,
        image,
        mediaType,
      });

      if (!result.ok) {
        console.error("[VisionExtractReading]", {
          userId,
          reason: result.reason,
          detail: result.detail,
        });
        const status =
          result.reason === "KEY_MISSING"
            ? 402
            : result.reason === "RATE_LIMITED"
              ? 429
              : result.reason === "MODEL_OVERLOADED"
                ? 503
                : result.reason === "PARSE_FAILED"
                  ? 502
                  : result.reason === "NO_READING_DETECTED"
                    ? 422
                    : 500;
        const headers: Record<string, string> =
          result.retryAfterMs != null
            ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
            : {};
        return NextResponse.json({ error: result.reason }, { status, headers });
      }

      return NextResponse.json({ reading: result.data });
    } catch (error) {
      return fromException(request, error, {
        stage: "vision/extract-reading:post",
      });
    }
  });
}
