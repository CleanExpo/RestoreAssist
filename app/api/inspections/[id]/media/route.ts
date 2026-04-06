/**
 * RA-416: Media Assets API — list MediaAsset records for an inspection.
 *
 * GET /api/inspections/[id]/media
 *   Returns all MediaAsset records for the inspection, including EXIF data,
 *   GPS coordinates, device metadata, and cataloging tags.
 *
 * Query params:
 *   mimeType  — filter by MIME type prefix (e.g. "image" or "video")
 *   hasGps    — "true" to return only GPS-tagged assets
 *   limit     — page size (default 50, max 200)
 *   cursor    — createdAt cursor for keyset pagination
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: inspectionId } = await params;
    const { searchParams } = request.nextUrl;

    const mimeTypeFilter = searchParams.get("mimeType"); // e.g. "image" or "video"
    const hasGpsOnly = searchParams.get("hasGps") === "true";
    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT));
    const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
    const cursor = searchParams.get("cursor"); // ISO datetime string

    // Verify the inspection belongs to this user's workspace
    const inspection = await prisma.inspection.findFirst({
      where: {
        id: inspectionId,
        OR: [
          { userId: session.user.id },
          {
            workspace: {
              members: { some: { userId: session.user.id, status: "ACTIVE" } },
            },
          },
        ],
      },
      select: { id: true, workspaceId: true },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    // Build where clause
    const where: Record<string, unknown> = { inspectionId };
    if (mimeTypeFilter) {
      where.mimeType = { startsWith: mimeTypeFilter };
    }
    if (hasGpsOnly) {
      where.latitude = { not: null };
      where.longitude = { not: null };
    }
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    // Fetch assets
    const assets = await prisma.mediaAsset.findMany({
      where,
      orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
      take: limit + 1, // fetch one extra to determine if there's a next page
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        fileSize: true,
        storagePath: true,
        // GPS
        latitude: true,
        longitude: true,
        altitude: true,
        accuracy: true,
        // Timestamps
        capturedAt: true,
        uploadedAt: true,
        timezone: true,
        // Device
        deviceMake: true,
        deviceModel: true,
        software: true,
        lensModel: true,
        // Image
        width: true,
        height: true,
        orientation: true,
        focalLength: true,
        aperture: true,
        exposureTime: true,
        iso: true,
        flash: true,
        // Video
        durationSeconds: true,
        videoWidth: true,
        videoHeight: true,
        frameRate: true,
        // SEO
        altText: true,
        // Tags (RA-417)
        tags: {
          select: { category: true, value: true },
          orderBy: { category: "asc" },
        },
        createdAt: true,
      },
    });

    // Determine pagination
    const hasNextPage = assets.length > limit;
    const page = hasNextPage ? assets.slice(0, limit) : assets;
    const nextCursor = hasNextPage
      ? page[page.length - 1]?.createdAt?.toISOString() ?? null
      : null;

    // Summary stats
    const totalCount = await prisma.mediaAsset.count({ where });
    const gpsCount = await prisma.mediaAsset.count({
      where: { ...where, latitude: { not: null } },
    });

    return NextResponse.json({
      assets: page,
      pagination: {
        limit,
        hasNextPage,
        nextCursor,
        totalCount,
      },
      summary: {
        totalAssets: totalCount,
        assetsWithGps: gpsCount,
        assetsWithoutGps: totalCount - gpsCount,
      },
    });
  } catch (error) {
    console.error("[GET /api/inspections/[id]/media]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
