/**
 * POST /api/inspections/[id]/sketches/import-from-image
 * RA-1607 — Claude Vision: convert a hand-drawn sketch photo to polygon data.
 *
 * Request: multipart/form-data with a single `file` field (JPEG/PNG, max 10 MB).
 * Response: { rooms: [{ label: string, vertices: [{ x: number, y: number }, ...] }] }
 *   Vertices are in normalized coordinates [0, 1] relative to the image dimensions.
 *
 * Rate limit: 5 calls per 15 minutes per user to cap Vision API spend.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWorkspaceBudget } from "@/lib/ai/budget-guard";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { logAiUsage, estimateCostUsd } from "@/lib/usage/log-usage";
import { importSketchFromImage } from "@/lib/services/ai/import-sketch-from-image";
import { applyRateLimit } from "@/lib/rate-limiter";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import { validateImageUpload } from "@/lib/media/validate-image-upload";
import { apiError, fromException } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

// RA-1707 / P0-2 — Vision call costs roughly $0.005-0.012 per image at
// claude-sonnet-4-x pricing (depends on image dimensions). We assume the
// upper bound for the pre-call budget check; actual cost is logged
// post-call from the API response's token counts.
const VISION_COST_ESTIMATE_USD = 0.012;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png"] as const;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface Room {
  label: string;
  vertices: { x: number; y: number }[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const userId = session.user.id;
    const { id: inspectionId } = await params;

    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Rule 5 — subscription gate before the Claude Vision call below.
    const gate = await requireActiveSubscription(userId);
    if (gate) return gate;

    const rateLimited = await applyRateLimit(request, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX,
      prefix: "sketch-import",
      key: userId,
    });
    if (rateLimited) return rateLimited;

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
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid multipart body",
        status: 400,
      });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Missing file field",
        status: 400,
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const imageCheck = validateImageUpload({
      declaredType: file.type,
      sizeBytes: file.size,
      buffer,
      maxBytes: MAX_FILE_BYTES,
      allowedTypes: ALLOWED_TYPES,
    });
    if (!imageCheck.ok && imageCheck.reason === "too-large") {
      return apiError(request, {
        code: "VALIDATION",
        message: "File too large — maximum 10 MB",
        status: 400,
      });
    }
    if (!imageCheck.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Unsupported file type — use JPEG or PNG",
        status: 400,
      });
    }
    const mediaType = imageCheck.mediaType as (typeof ALLOWED_TYPES)[number];

    // RA-6921 (P0) — resolve the workspace's own BYOK key; never spend the
    // platform's ANTHROPIC_API_KEY on a client's sketch-import workload.
    let apiKey: string;
    try {
      apiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
    } catch (err) {
      if (!(err instanceof NoWorkspaceKeyError)) throw err;
      console.error("[InspectionsSketchImport]", {
        userId,
        inspectionId,
        reason: "KEY_MISSING",
        detail: "No workspace Anthropic key configured",
      });
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: "AI service unavailable",
        status: 402,
      });
    }

    // Convert to base64
    const base64 = buffer.toString("base64");

    const callStart = Date.now();
    const visionModel = "claude-sonnet-4-6";

    const result = await importSketchFromImage({
      apiKey,
      base64Image: base64,
      mediaType,
    });

    if (!result.ok) {
      console.error("[InspectionsSketchImport]", {
        userId,
        inspectionId,
        reason: result.reason,
        detail: result.detail,
      });
      // RA-1707 / P0-2 — log failure for workspace daily budget visibility.
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
          errorType: result.reason,
          metadata: { inspectionId },
        });
      }
      const status =
        result.reason === "KEY_MISSING"
          ? 402
          : result.reason === "RATE_LIMITED"
            ? 429
            : result.reason === "MODEL_OVERLOADED"
              ? 503
              : result.reason === "PARSE_FAILED"
                ? 502
                : 500;
      const headers: Record<string, string> =
        result.retryAfterMs != null
          ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
          : {};
      return NextResponse.json({ error: result.reason }, { status, headers });
    }

    // RA-1707 / P0-2 — log post-call cost so the workspace daily budget
    // accumulates. Fire-and-forget; never blocks the response.
    if (workspace) {
      const { inputTokens, outputTokens } = result.data.usage;
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

    const rooms = result.data.rooms.filter(
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
  } catch (err) {
    return fromException(request, err, { stage: "sketch:import-from-image" });
  }
}
