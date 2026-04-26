/**
 * POST /api/inspections/[id]/sketches/import-from-image
 * RA-1607 — Claude Vision: convert a hand-drawn sketch photo to polygon data.
 *
 * Request: multipart/form-data with a single `file` field (JPEG/PNG/HEIC, max 10 MB).
 * Response: { rooms: [{ label: string, vertices: [{ x: number, y: number }, ...] }] }
 *   Vertices are in normalized coordinates [0, 1] relative to the image dimensions.
 *
 * Rate limit: 5 calls per 15 minutes per user to cap Vision API spend.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { checkWorkspaceBudget } from "@/lib/ai/budget-guard";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { logAiUsage, estimateCostUsd } from "@/lib/usage/log-usage";

// RA-1707 / P0-2 — Vision call costs roughly $0.005-0.012 per image at
// claude-sonnet-4-x pricing (depends on image dimensions). We assume the
// upper bound for the pre-call budget check; actual cost is logged
// post-call from the API response's token counts.
const VISION_COST_ESTIMATE_USD = 0.012;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

// In-memory rate limiter: userId -> timestamps of recent calls
const _rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const calls = (_rateLimitMap.get(userId) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (calls.length >= RATE_LIMIT_MAX) return false;
  calls.push(now);
  _rateLimitMap.set(userId, calls);
  return true;
}

const VISION_PROMPT = `You are analyzing a hand-drawn floor-plan sketch photo.

Extract each distinct room or zone from the sketch and return their approximate outlines as polygon vertices.

Rules:
- Return ONLY valid JSON — no prose, no markdown fences, no explanation.
- Vertices must be in NORMALIZED coordinates: x and y each in [0.0, 1.0] relative to the image width and height.
- Include at least 3 vertices per room (rectangles need 4).
- If the sketch is unclear, return your best estimate — do not refuse.
- Label each room with the text written inside it, or a generic label like "Room 1" if unlabelled.

Output schema (JSON only):
{
  "rooms": [
    {
      "label": "Living Room",
      "vertices": [
        { "x": 0.05, "y": 0.05 },
        { "x": 0.45, "y": 0.05 },
        { "x": 0.45, "y": 0.50 },
        { "x": 0.05, "y": 0.50 }
      ]
    }
  ]
}`;

interface Room {
  label: string;
  vertices: { x: number; y: number }[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id: inspectionId } = await params;

  // Verify ownership
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, userId },
    select: { id: true },
  });
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  // Rate limit
  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: "Rate limit exceeded — 5 imports per 15 minutes" },
      { status: 429 },
    );
  }

  // RA-1707 / P0-2 — workspace AI daily budget check. Resolves the user's
  // active workspace and rejects when this Vision call would tip the org
  // over its daily ceiling. Defensive: when getWorkspaceForUser returns
  // null (user has no workspace bound) we still allow — pilots in legacy
  // user-scoped accounts continue to work.
  const workspace = await getWorkspaceForUser(userId);
  if (workspace) {
    const budget = await checkWorkspaceBudget({
      workspaceId: workspace.id,
      estimatedCostUsd: VISION_COST_ESTIMATE_USD,
    });
    if (!budget.ok) {
      return NextResponse.json(
        {
          error: budget.error,
          remainingUsd: budget.remainingUsd,
          budgetUsd: budget.budgetUsd,
        },
        { status: 429 },
      );
    }
  }

  // Parse multipart
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type — use JPEG or PNG" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File too large — maximum 10 MB" },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Vision not configured — ANTHROPIC_API_KEY missing" },
      { status: 503 },
    );
  }

  // Convert to base64
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = file.type as "image/jpeg" | "image/png";

  const client = new Anthropic({ apiKey });

  let raw: string;
  const callStart = Date.now();
  const visionModel = "claude-sonnet-4-6";
  try {
    const message = await client.messages.create({
      model: visionModel,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    });
    raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // RA-1707 / P0-2 — log post-call cost so the workspace daily budget
    // accumulates. Fire-and-forget; never blocks the response.
    if (workspace) {
      const inputTokens = message.usage?.input_tokens ?? 0;
      const outputTokens = message.usage?.output_tokens ?? 0;
      logAiUsage({
        workspaceId: workspace.id,
        provider: "ANTHROPIC",
        model: visionModel,
        taskType: "vision_sketch_import",
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCostUsd(
          "ANTHROPIC",
          visionModel,
          inputTokens,
          outputTokens,
        ),
        latencyMs: Date.now() - callStart,
        success: true,
        metadata: { inspectionId, mediaType },
      });
    }
  } catch (err) {
    console.error("Claude Vision API error:", err);
    if (workspace) {
      logAiUsage({
        workspaceId: workspace.id,
        provider: "ANTHROPIC",
        model: visionModel,
        taskType: "vision_sketch_import",
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - callStart,
        success: false,
        errorType: err instanceof Error ? err.name : "unknown",
        metadata: { inspectionId },
      });
    }
    return NextResponse.json(
      { error: "Vision API call failed" },
      { status: 502 },
    );
  }

  // Parse JSON response — strip any accidental markdown fences
  const jsonStr = raw.replace(/^```[a-z]*\n?/m, "").replace(/\n?```$/m, "").trim();
  let parsed: { rooms: Room[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("Claude Vision returned non-JSON:", raw.slice(0, 200));
    return NextResponse.json(
      { error: "Vision model returned unstructured output — try again" },
      { status: 502 },
    );
  }

  const rooms = (parsed.rooms ?? []).filter(
    (r): r is Room =>
      typeof r.label === "string" &&
      Array.isArray(r.vertices) &&
      r.vertices.length >= 3 &&
      r.vertices.every(
        (v) =>
          typeof v.x === "number" &&
          typeof v.y === "number" &&
          v.x >= 0 &&
          v.x <= 1 &&
          v.y >= 0 &&
          v.y <= 1,
      ),
  );

  return NextResponse.json({ rooms });
}
