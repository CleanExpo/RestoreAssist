/**
 * RA-437: POST /api/vision/extract-reading
 * Accepts a base64 image of a moisture meter and returns the extracted reading
 * using Claude Vision (claude-sonnet-4-20250514).
 *
 * Body: { image: string (base64), mediaType?: "image/jpeg"|"image/png"|"image/webp" }
 * Response: { reading: MeterReadingResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildMeterExtractionMessages,
  parseMeterResponse,
  METER_EXTRACTION_SYSTEM_PROMPT,
} from "@/lib/vision/meter-prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2, // Retry on 429/500 with exponential backoff (SDK default)
  timeout: 30_000, // 30s hard timeout — prevent hanging field requests
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 20 requests per minute per authenticated user
    const rateLimitResponse = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 20,
      prefix: "vision",
      key: session.user.id,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { image, mediaType: rawMediaType = "image/jpeg" } = body as {
      image?: string;
      mediaType?: unknown;
    };

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "image (base64 string) is required" },
        { status: 400 },
      );
    }

    // Validate base64 characters before hitting Anthropic — avoids a costly
    // external API call on obviously malformed input.
    if (!/^[A-Za-z0-9+/]+=*$/.test(image)) {
      return NextResponse.json(
        { error: "image must be a valid base64-encoded string" },
        { status: 400 },
      );
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
      return NextResponse.json(
        { error: "Image too large — maximum 5MB" },
        { status: 413 },
      );
    }

    const messages = buildMeterExtractionMessages(image, mediaType);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: METER_EXTRACTION_SYSTEM_PROMPT,
      messages,
    });

    const responseText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const reading = parseMeterResponse(responseText);

    if (!reading) {
      return NextResponse.json(
        {
          error: "Failed to parse meter reading from image",
          raw: responseText,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ reading });
  } catch (error) {
    console.error("[POST /api/vision/extract-reading] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
