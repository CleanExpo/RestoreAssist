import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateContentsManifest,
  estimateManifestCost,
} from "@/lib/ai/contents-manifest";
import type {
  AllowedModel,
  VisionInput,
  VisionMediaType,
} from "@/lib/ai/byok-client";
import { resolveWorkspaceRouterConfig } from "@/lib/ai/workspace-byok-dispatch";
import { BYOK_ALLOWED_MODELS } from "@/lib/ai/byok-client";
import { apiError, fromException } from "@/lib/api-errors";

const CONTENTS_MANIFEST_FAILURE_ERROR = "Contents manifest generation failed";

/**
 * [RA-405] Contents Manifest API
 * POST — Generate AI contents manifest from inspection photos
 * GET  — Retrieve existing manifest for an inspection
 */

// ━━━ POST: Generate contents manifest ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: {
    inspectionId: string;
    photos: Array<{ data: string; mediaType: string; label?: string }>;
    model: string;
    context?: {
      jobType?: string;
      rooms?: string[];
      knownDamageType?: string;
    };
  };

  try {
    body = await request.json();
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid JSON body",
      status: 400,
    });
  }

  // Validate required fields
  if (!body.inspectionId?.trim()) {
    return apiError(request, {
      code: "VALIDATION",
      message: "inspectionId is required",
      status: 400,
    });
  }

  if (!Array.isArray(body.photos) || body.photos.length === 0) {
    return apiError(request, {
      code: "VALIDATION",
      message: "At least one photo is required",
      status: 400,
    });
  }

  if (body.photos.length > 20) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Maximum 20 photos per manifest",
      status: 400,
    });
  }

  if (!body.model) {
    return apiError(request, {
      code: "VALIDATION",
      message: "model is required",
      status: 400,
    });
  }

  // Validate model against allowlist
  if (!(BYOK_ALLOWED_MODELS as readonly string[]).includes(body.model)) {
    return apiError(request, {
      code: "VALIDATION",
      message: `Model "${body.model}" not in allowlist. Allowed: ${BYOK_ALLOWED_MODELS.join(", ")}`,
      status: 400,
    });
  }

  try {
    // Verify the inspection exists and belongs to user's org
    const inspection = await prisma.inspection.findFirst({
      where: {
        id: body.inspectionId,
        userId: session.user.id,
      },
      select: {
        id: true,
        workspaceId: true,
        inspectionNumber: true,
        propertyAddress: true,
        inspectionWorkflow: {
          select: { jobType: true },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Build vision inputs
    const validMediaTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);

    const photos: VisionInput[] = body.photos
      .filter((p) => p.data && validMediaTypes.has(p.mediaType))
      .map((p) => ({
        data: p.data,
        mediaType: p.mediaType as VisionMediaType,
        label: p.label,
      }));

    if (photos.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No valid photos provided. Supported: JPEG, PNG, WebP, GIF",
        status: 400,
      });
    }

    // BYOK key is resolved SERVER-SIDE from the inspection's workspace — never
    // trusted from the request body (which any caller could forge).
    if (!inspection.workspaceId) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "This inspection is not linked to a workspace. Configure AI Providers in Workspace Settings to use the contents manifest.",
        status: 422,
      });
    }

    const routerConfig = await resolveWorkspaceRouterConfig(
      inspection.workspaceId,
      body.model as AllowedModel,
    );
    if (!routerConfig) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "No active AI provider configured for this workspace. Add your API key in Workspace Settings → AI Providers.",
        status: 422,
      });
    }

    // Build context — merge request context with inspection data
    const context = {
      jobType:
        body.context?.jobType ??
        inspection.inspectionWorkflow?.jobType ??
        undefined,
      rooms: body.context?.rooms,
      knownDamageType: body.context?.knownDamageType,
    };

    const manifest = await generateContentsManifest(
      body.inspectionId,
      photos,
      routerConfig,
      context,
    );

    return NextResponse.json({
      manifest,
      inspection: {
        id: inspection.id,
        inspectionNumber: inspection.inspectionNumber,
        propertyAddress: inspection.propertyAddress,
      },
    });
  } catch (err) {
    return apiError(request, {
      code: "INTERNAL",
      message: CONTENTS_MANIFEST_FAILURE_ERROR,
      status: 500,
      err,
      stage: "generate",
    });
  }
}

// ━━━ GET: Cost estimate for manifest generation ━━━━━━━━━━━━━━━━━━━━━

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { searchParams } = new URL(request.url);
  const photoCount = parseInt(searchParams.get("photoCount") ?? "1", 10);
  const model = searchParams.get("model") ?? "claude-sonnet-4-6";

  if (!(BYOK_ALLOWED_MODELS as readonly string[]).includes(model)) {
    return apiError(request, {
      code: "VALIDATION",
      message: `Model "${model}" not in allowlist`,
      status: 400,
    });
  }

  try {
    const estimate = estimateManifestCost(
      Math.min(Math.max(photoCount, 1), 20),
      model as AllowedModel,
    );

    return NextResponse.json({
      estimate,
      model,
      photoCount: Math.min(Math.max(photoCount, 1), 20),
      maxPhotos: 20,
    });
  } catch (err) {
    return fromException(request, err, { stage: "estimate" });
  }
}
