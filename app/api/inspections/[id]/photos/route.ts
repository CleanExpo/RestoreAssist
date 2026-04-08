/**
 * RA-408: Photo upload migrated to pluggable storage provider (Supabase Storage)
 * POST /api/inspections/[id]/photos
 *
 * Existing Cloudinary URLs stored in InspectionPhoto.url continue to resolve
 * (read-only fallback — no database migration needed).
 * New uploads go to Supabase Storage with compression pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { extractAndSaveMediaAsset } from "@/lib/media/exif-extract";
import { scheduleCatalog } from "@/lib/media/catalog";
import { applyRateLimit } from "@/lib/rate-limiter";

// GET - List photos for inspection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }

    const photos = await prisma.inspectionPhoto.findMany({
      where: { inspectionId: id },
      orderBy: { timestamp: "desc" },
      select: {
        id: true,
        url: true,
        thumbnailUrl: true,
        location: true,
        description: true,
        timestamp: true,
        fileSize: true,
        mimeType: true,
      },
    });

    return NextResponse.json({ photos });
  } catch (error) {
    console.error("Error fetching photos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Upload photo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 20 photo uploads per minute per user
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 20,
      prefix: "photo-upload",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: { id: true, workspaceId: true },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const location = formData.get("location") as string | null;

    // RA-447: Optional label fields at upload time (multipart form fields)
    const labelFields = {
      damageCategory:            formData.get("damageCategory") as string | null,
      damageClass:               formData.get("damageClass") as string | null,
      s500SectionRef:            formData.get("s500SectionRef") as string | null,
      roomType:                  formData.get("roomType") as string | null,
      moistureSource:            formData.get("moistureSource") as string | null,
      affectedMaterial:          formData.get("affectedMaterial")
                                   ? (formData.get("affectedMaterial") as string).split(",").filter(Boolean)
                                   : undefined,
      surfaceOrientation:        formData.get("surfaceOrientation") as string | null,
      damageExtentEstimate:      formData.get("damageExtentEstimate") as string | null,
      equipmentVisible:          formData.get("equipmentVisible") === "true" ? true
                                   : formData.get("equipmentVisible") === "false" ? false
                                   : undefined,
      secondaryDamageIndicators: formData.get("secondaryDamageIndicators")
                                   ? (formData.get("secondaryDamageIndicators") as string).split(",").filter(Boolean)
                                   : undefined,
      photoStage:                formData.get("photoStage") as string | null,
      captureAngle:              formData.get("captureAngle") as string | null,
      labelledBy:                formData.get("labelledBy") as string | null,
      technicianNotes:           formData.get("technicianNotes") as string | null,
      moistureReadingLink:       formData.get("moistureReadingLink") as string | null,
    };
    // Strip undefined/null so Prisma only sets provided fields
    const labelData = Object.fromEntries(
      Object.entries(labelFields).filter(([, v]) => v !== null && v !== undefined)
    );

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Guard before arrayBuffer() — multipart/form-data bypasses Next.js body size
    // limits, so an attacker can send a 2GB TIFF that loads into the function heap.
    const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 20 MB
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: "File too large — maximum 20 MB per photo" },
        { status: 413 },
      );
    }

    // Get user's org for storage provider resolution
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storageProvider = await getStorageProvider(user?.organizationId);

    const uploadResult = await storageProvider.upload({
      buffer,
      filename: file.name,
      mimeType: file.type || "image/jpeg",
      folder: `inspections/${id}`,
      orgId: user?.organizationId ?? "no-org",
      inspectionId: id,
    });

    // Create photo record — store compressed URL for dashboard viewing
    // originalUrl (signed) is stored in structuredData for download-original flows
    // RA-447: label fields are spread in if provided at upload time
    const photo = await prisma.inspectionPhoto.create({
      data: {
        inspectionId: id,
        url: uploadResult.compressedUrl,
        thumbnailUrl: uploadResult.thumbnailUrl ?? null,
        location: location || null,
        fileSize: file.size,
        mimeType: file.type,
        timestamp: new Date(),
        ...labelData,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Photo uploaded",
        entityType: "InspectionPhoto",
        entityId: photo.id,
        userId: session.user.id,
        changes: JSON.stringify({
          location: photo.location,
          url: photo.url,
          storagePath: uploadResult.storagePath,
          sha256: uploadResult.sha256,
        }),
      },
    });

    // RA-416: Extract EXIF metadata — fire-and-forget, never blocks upload response
    if (inspection.workspaceId) {
      extractAndSaveMediaAsset({
        buffer,
        originalFilename: file.name,
        mimeType: file.type || "image/jpeg",
        fileSize: file.size,
        storagePath: uploadResult.storagePath,
        inspectionId: id,
        workspaceId: inspection.workspaceId,
      });
    }

    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    console.error("Error uploading photo:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
