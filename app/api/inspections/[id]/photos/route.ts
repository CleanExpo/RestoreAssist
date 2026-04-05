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

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
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
    const photo = await prisma.inspectionPhoto.create({
      data: {
        inspectionId: id,
        url: uploadResult.compressedUrl,
        thumbnailUrl: uploadResult.thumbnailUrl ?? null,
        location: location || null,
        fileSize: file.size,
        mimeType: file.type,
        timestamp: new Date(),
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
