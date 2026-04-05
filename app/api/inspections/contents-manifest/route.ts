import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateContentsManifest,
  manifestToCsv,
  estimateManifestCost,
} from "@/lib/ai/contents-manifest";
import type {
  AllowedModel,
  VisionInput,
  VisionMediaType,
} from "@/lib/ai/byok-client";
import type { RouterConfig } from "@/lib/ai/model-router";
import { BYOK_ALLOWED_MODELS } from "@/lib/ai/byok-client";

/**
 * [RA-405] Contents Manifest API
 * POST — Generate AI contents manifest from inspection photos
 * GET  — Retrieve existing manifest for an inspection
 */

// ━━━ POST: Generate contents manifest ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    inspectionId: string;
    photos: Array<{ data: string; mediaType: string; label?: string }>;
    model: string;
    apiKey: string;
    context?: {
      jobType?: string;
      rooms?: string[];
      knownDamageType?: string;
    };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  if (!body.inspectionId?.trim()) {
    return NextResponse.json(
      { error: "inspectionId is required" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.photos) || body.photos.length === 0) {
    return NextResponse.json(
      { error: "At least one photo is required" },
      { status: 400 },
    );
  }

  if (body.photos.length > 20) {
    return NextResponse.json(
      { error: "Maximum 20 photos per manifest" },
      { status: 400 },
    );
  }

  if (!body.model || !body.apiKey?.trim()) {
    return NextResponse.json(
      { error: "model and apiKey are required (BYOK)" },
      { status: 400 },
    );
  }

  // Validate model against allowlist
  if (!(BYOK_ALLOWED_MODELS as readonly string[]).includes(body.model)) {
    return NextResponse.json(
      {
        error: `Model "${body.model}" not in allowlist. Allowed: ${BYOK_ALLOWED_MODELS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Verify the inspection exists and belongs to user's org
  const inspection = await prisma.inspection.findFirst({
    where: {
      id: body.inspectionId,
      userId: session.user.id,
    },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      inspectionWorkflow: {
        select: { jobType: true },
      },
    },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
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
    return NextResponse.json(
      { error: "No valid photos provided. Supported: JPEG, PNG, WebP, GIF" },
      { status: 400 },
    );
  }

  // Build router config
  const routerConfig: RouterConfig = {
    byokModel: body.model as AllowedModel,
    byokApiKey: body.apiKey,
  };

  // Build context — merge request context with inspection data
  const context = {
    jobType:
      body.context?.jobType ??
      inspection.inspectionWorkflow?.jobType ??
      undefined,
    rooms: body.context?.rooms,
    knownDamageType: body.context?.knownDamageType,
  };

  try {
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
    const message =
      err instanceof Error
        ? err.message
        : "Contents manifest generation failed";
    console.error("[RA-405] Contents manifest error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ━━━ GET: Cost estimate for manifest generation ━━━━━━━━━━━━━━━━━━━━━

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const photoCount = parseInt(searchParams.get("photoCount") ?? "1", 10);
  const model = searchParams.get("model") ?? "claude-sonnet-4-6";

  if (!(BYOK_ALLOWED_MODELS as readonly string[]).includes(model)) {
    return NextResponse.json(
      { error: `Model "${model}" not in allowlist` },
      { status: 400 },
    );
  }

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
}
