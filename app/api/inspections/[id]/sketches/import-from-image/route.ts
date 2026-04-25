/**
 * POST /api/inspections/[id]/sketches/import-from-image
 *
 * Sends a hand-drawn floor plan photo to Claude Vision and returns
 * normalised polygon vertices per room so the frontend can drop them
 * onto the SketchEditorV2 canvas as editable Fabric.js objects.
 *
 * Body: multipart/form-data
 *   image: File (JPEG | PNG | HEIC | WEBP, max 10 MB)
 *
 * Response:
 * {
 *   rooms: Array<{
 *     label: string           // "Kitchen", "Living Room", etc.
 *     vertices: [number, number][]  // normalised [x, y] in [0, 1] range
 *   }>
 *   rawDescription: string    // Claude's natural-language description
 * }
 *
 * Rate limit: 5 imports per 15 min per user (Vision is expensive).
 *
 * RA-1607
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { applyRateLimit } from "@/lib/rate-limiter";

const MODEL = "claude-opus-4-7";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface RoomPolygon {
  label: string;
  vertices: [number, number][];
}

interface VisionResponse {
  rooms: RoomPolygon[];
  rawDescription: string;
}

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

function toAnthropicMediaType(
  mime: string,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mime.includes("png")) return "image/png";
  if (mime.includes("gif")) return "image/gif";
  if (mime.includes("webp")) return "image/webp";
  return "image/jpeg";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 imports per 15 min per user
  const rl = await applyRateLimit(request, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    prefix: "sketch-import",
    key: session.user.id,
    failClosedOnUpstashError: true,
  });
  if (rl) return rl;

  const { id: inspectionId } = params;

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { userId: true },
  });
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse multipart form
  let imageFile: File;
  try {
    const form = await request.formData();
    const raw = form.get("image");
    if (!raw || !(raw instanceof File)) {
      return NextResponse.json({ error: "image field required (File)" }, { status: 400 });
    }
    imageFile = raw;
  } catch {
    return NextResponse.json({ error: "Invalid multipart form" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(imageFile.type)) {
    return NextResponse.json(
      { error: "Unsupported image type — use JPEG, PNG, HEIC, or WEBP" },
      { status: 415 },
    );
  }

  if (imageFile.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Image exceeds 10 MB limit (${(imageFile.size / 1024 / 1024).toFixed(1)} MB)` },
      { status: 413 },
    );
  }

  // Convert File → base64
  const arrayBuffer = await imageFile.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = toAnthropicMediaType(imageFile.type);

  const prompt = `You are analysing a hand-drawn floor plan sketch. Extract each room as a polygon.

Rules:
1. For each distinct room or zone you can identify, return a polygon in normalised [0, 1] coordinates where (0,0) is top-left and (1,1) is bottom-right of the image bounding box.
2. Vertices should be ordered clockwise and form a closed polygon (first and last point are different — do not repeat the first point).
3. Minimum 3 vertices per room; maximum 12 (simplify complex shapes).
4. Use common AU restoration labels: "Living Room", "Kitchen", "Bathroom", "Bedroom", "Hallway", "Laundry", "Garage", "Entry", "Study", "Dining Room", "Ensuite", "WC", "Storeroom". If a room has a handwritten label, use that instead.
5. If no rooms can be reliably identified, return an empty rooms array.

Respond ONLY with valid JSON matching this exact schema:
{
  "rawDescription": "<one sentence describing the sketch>",
  "rooms": [
    {
      "label": "Kitchen",
      "vertices": [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.1, 0.4]]
    }
  ]
}`;

  let parsed: VisionResponse;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";
    const json = text.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(json) as VisionResponse;
  } catch {
    return NextResponse.json(
      { error: "Vision analysis failed — check image quality and try again" },
      { status: 502 },
    );
  }

  // Validate and clamp vertices to [0, 1]
  const rooms: RoomPolygon[] = (parsed.rooms ?? [])
    .filter((r) => r.label && Array.isArray(r.vertices) && r.vertices.length >= 3)
    .map((r) => ({
      label: String(r.label).slice(0, 64),
      vertices: r.vertices.slice(0, 12).map(([x, y]) => [
        Math.min(1, Math.max(0, Number(x))),
        Math.min(1, Math.max(0, Number(y))),
      ] as [number, number]),
    }));

  return NextResponse.json({
    rooms,
    rawDescription: parsed.rawDescription ?? "",
    inspectionId,
  });
}
