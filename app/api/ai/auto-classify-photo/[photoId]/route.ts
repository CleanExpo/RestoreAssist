/**
 * RA-1123 — Claude Vision auto-classifier for inspection photos.
 *
 * POST /api/ai/auto-classify-photo/[photoId]
 *   (optional body: { model?: "claude-sonnet-4.5" | "claude-opus-4-7" })
 *
 * Fetches the photo's Cloudinary URL, sends it to Claude Vision with a
 * prompt tuned for AU water-damage vernacular + IICRC S500 label
 * schema (RA-446), parses the JSON response, and writes to
 * InspectionPhoto.aiLabels + aiConfidence + aiModel + aiRunAt.
 *
 * The technician UI then shows the suggestion next to each field —
 * accepting copies values into the label columns and flips labelledBy
 * to "AI_ACCEPTED". This PR ships the backend + DB fields; the UI
 * accept/reject surface is a follow-up (needs coordination with the
 * existing photo-labels form).
 *
 * Auth: user must own the inspection. Rate-limited per user. When
 * ANTHROPIC_API_KEY is missing the endpoint returns 503 with a clear
 * message so the inspection-photo POST handler can no-op gracefully
 * on the fire-and-forget call.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { Prisma } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}

// Hard-coded per RA-1099 — vision work uses Sonnet; Opus is reserved
// for planner/orchestrator roles only.
const DEFAULT_MODEL = "claude-sonnet-4-5";

const CLASSIFY_PROMPT = `You are inspecting a water damage photo for an Australian restoration report.
Apply IICRC S500:2025 categorisation and return JSON ONLY.

Fields to populate (null when the photo doesn't support a confident answer):
- damageCategory: "CAT_1" | "CAT_2" | "CAT_3"
- damageClass:    "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4"
- roomType:       "KITCHEN" | "BATHROOM" | "LAUNDRY" | "LOUNGE" | "BEDROOM" | "ENSUITE" | "HALLWAY" | "GARAGE" | "OTHER"
- moistureSource: "FLEXI_HOSE" | "PIPE_BURST" | "ROOF_LEAK" | "APPLIANCE" | "FLOOD" | "SEWAGE" | "UNKNOWN"
- affectedMaterial: array of any of "CARPET" | "UNDERLAY" | "PLASTER" | "GYPROCK" | "TIMBER_FLOOR" | "TILE" | "VINYL" | "CONCRETE" | "INSULATION" | "CABINETRY"
- surfaceOrientation: "FLOOR" | "WALL_LOWER" | "WALL_UPPER" | "CEILING" | "DOOR" | "WINDOW"
- damageExtentEstimate: "SPOT" | "PARTIAL" | "MAJORITY" | "FULL" | "UNCERTAIN"
- equipmentVisible: true | false
- secondaryDamageIndicators: array of "MOULD_VISIBLE" | "EFFLORESCENCE" | "STAINING" | "SWELLING" | "ASBESTOS_SUSPECT"
- photoStage: "PRE_WORK" | "DURING_WORK" | "MONITORING" | "POST_WORK" | "REINSTATEMENT"
- captureAngle: "STRAIGHT_ON" | "OBLIQUE" | "OVERHEAD" | "MACRO" | "WIDE"

Use Australian English ("mould" not "mold", "lounge" not "living room", "laundry" not "utility").
If ASBESTOS_SUSPECT, include it — the UI triggers a stop-work modal.

Return ONLY the JSON object, no prose, no markdown fences.
Also include at the end: "confidence": 0-1 float expressing overall certainty.`;

interface ClassifyResponse {
  labels: Record<string, unknown>;
  confidence: number;
  model: string;
  runAt: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    prefix: "auto-classify-photo",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AI classification unavailable — ANTHROPIC_API_KEY not configured.",
      },
      { status: 503 },
    );
  }

  const { photoId } = await params;

  // Ownership check — photo must belong to an inspection the caller owns
  const photo = await prisma.inspectionPhoto.findFirst({
    where: { id: photoId, inspection: { userId } },
    select: { id: true, url: true, mimeType: true },
  });
  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const model = DEFAULT_MODEL;
  try {
    const msg = await getAnthropic().messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: photo.url,
              },
            },
            { type: "text", text: CLASSIFY_PROMPT },
          ],
        },
      ],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const trimmed = raw.trim().replace(/^```json\s*|\s*```$/g, "");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return NextResponse.json(
        {
          error: "Model returned non-JSON",
          rawPreview: trimmed.slice(0, 200),
        },
        { status: 502 },
      );
    }

    const confidenceRaw = parsed["confidence"];
    const confidence =
      typeof confidenceRaw === "number" && confidenceRaw >= 0 && confidenceRaw <= 1
        ? confidenceRaw
        : null;
    // Strip confidence from the labels payload — it lives in its own column
    const labels = { ...parsed };
    delete (labels as { confidence?: unknown }).confidence;

    const runAt = new Date();
    await prisma.inspectionPhoto.update({
      where: { id: photo.id },
      data: {
        // Prisma's JSON input type requires a cast from a generic object.
        aiLabels: labels as Prisma.InputJsonValue,
        aiConfidence: confidence,
        aiModel: model,
        aiRunAt: runAt,
      },
    });

    const response: ClassifyResponse = {
      labels,
      confidence: confidence ?? 0,
      model,
      runAt: runAt.toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error(
      "[auto-classify-photo]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Classification failed" },
      { status: 500 },
    );
  }
}
