// app/api/vision/extract-reading/route.ts
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
import Anthropic from "@anthropic-ai/sdk";
import {
  buildMeterExtractionMessages,
  parseMeterResponse,
  METER_EXTRACTION_SYSTEM_PROMPT,
  type MeterReadingResult,
} from "@/lib/vision/meter-prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { image, mediaType = "image/jpeg" } = body as {
      image?: string;
      mediaType?: "image/jpeg" | "image/png" | "image/webp";
    };

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "image (base64 string) is required" },
        { status: 400 },
      );
    }

    // Validate image size — Claude Vision accepts up to ~5MB base64
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
