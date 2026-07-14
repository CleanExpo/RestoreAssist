/**
 * RA-408: Photo upload migrated to pluggable storage provider (Supabase Storage)
 * POST /api/inspections/[id]/photos
 *
 * Existing Cloudinary URLs stored in InspectionPhoto.url continue to resolve
 * (read-only fallback — no database migration needed).
 * New uploads go to Supabase Storage with compression pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { enqueueMirror } from "@/lib/storage/dual-write";
import { MirrorJobKind } from "@prisma/client";
import { extractAndSaveMediaAsset } from "@/lib/media/exif-extract";
import { scheduleCatalog } from "@/lib/media/catalog";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  getIdempotencyKey,
  withIdempotencyFingerprint,
} from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// GET - List photos for inspection
export async function GET(
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

    const { id } = await params;

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
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
        // RA-7054: the photos page dereferences the RA-446 label fields
        // unconditionally (e.g. secondaryDamageIndicators.includes) — omitting
        // them here crashes /dashboard/inspections/[id]/photos.
        damageCategory: true,
        damageClass: true,
        s500SectionRef: true,
        roomType: true,
        moistureSource: true,
        affectedMaterial: true,
        surfaceOrientation: true,
        damageExtentEstimate: true,
        equipmentVisible: true,
        secondaryDamageIndicators: true,
        photoStage: true,
        captureAngle: true,
        labelledBy: true,
        technicianNotes: true,
        moistureReadingLink: true,
      },
      take: 500,
    });

    return NextResponse.json({ photos });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
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
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const idempotencyKey = getIdempotencyKey(request);
    if (!idempotencyKey.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: idempotencyKey.reason ?? "Invalid idempotency key",
        status: 400,
      });
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
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const location = formData.get("location") as string | null;

    // RA-447: Optional label fields at upload time (multipart form fields)
    const labelFields = {
      damageCategory: formData.get("damageCategory") as string | null,
      damageClass: formData.get("damageClass") as string | null,
      s500SectionRef: formData.get("s500SectionRef") as string | null,
      roomType: formData.get("roomType") as string | null,
      moistureSource: formData.get("moistureSource") as string | null,
      affectedMaterial: formData.get("affectedMaterial")
        ? (formData.get("affectedMaterial") as string)
            .split(",")
            .filter(Boolean)
        : undefined,
      surfaceOrientation: formData.get("surfaceOrientation") as string | null,
      damageExtentEstimate: formData.get("damageExtentEstimate") as
        | string
        | null,
      equipmentVisible:
        formData.get("equipmentVisible") === "true"
          ? true
          : formData.get("equipmentVisible") === "false"
            ? false
            : undefined,
      secondaryDamageIndicators: formData.get("secondaryDamageIndicators")
        ? (formData.get("secondaryDamageIndicators") as string)
            .split(",")
            .filter(Boolean)
        : undefined,
      photoStage: formData.get("photoStage") as string | null,
      captureAngle: formData.get("captureAngle") as string | null,
      labelledBy: formData.get("labelledBy") as string | null,
      technicianNotes: formData.get("technicianNotes") as string | null,
      moistureReadingLink: formData.get("moistureReadingLink") as string | null,
    };
    // Strip undefined/null so Prisma only sets provided fields
    const labelData = Object.fromEntries(
      Object.entries(labelFields).filter(
        ([, v]) => v !== null && v !== undefined,
      ),
    );

    if (!file) {
      return apiError(request, {
        code: "VALIDATION",
        message: "File is required",
        status: 400,
      });
    }

    // Guard before arrayBuffer() — multipart/form-data bypasses Next.js body size
    // limits, so an attacker can send a 2GB TIFF that loads into the function heap.
    const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 20 MB
    if (file.size > MAX_PHOTO_BYTES) {
      return apiError(request, {
        code: "VALIDATION",
        message: "File too large — maximum 20 MB per photo",
        status: 413,
      });
    }

    // Get user's org for storage provider resolution
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    // Magic-byte validation — prevents Content-Type spoofing
    const isJpeg =
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isGif =
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38;
    const isWebp =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;
    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid file type. Only images are allowed.",
        status: 400,
      });
    }

    // Chain-of-custody (rule 21) — only enforced when client supplies cocoaSha256
    const clientSha256 = formData.get("cocoaSha256");
    let cocoaSha256: string | null = null;
    let cocoaCapturedAtUtc: Date | null = null;
    let cocoaUserHash: string | null = null;
    let cocoaDeviceHint: string | null = null;

    if (typeof clientSha256 === "string" && clientSha256.length > 0) {
      if (fileSha256.toLowerCase() !== clientSha256.toLowerCase()) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "Hash mismatch — file may have been tampered with in transit",
          status: 400,
        });
      }
      cocoaSha256 = clientSha256;

      const capturedAtRaw = formData.get("capturedAtUtc");
      cocoaCapturedAtUtc =
        typeof capturedAtRaw === "string" && capturedAtRaw.length > 0
          ? new Date(capturedAtRaw)
          : null;

      // Authoritative — server computes from session, never trusts client
      const userHashInput = `${session.user.id}:${session.user.image ?? ""}`;
      cocoaUserHash = crypto
        .createHash("sha256")
        .update(userHashInput)
        .digest("hex");

      const userAgent = request.headers.get("user-agent");
      cocoaDeviceHint = userAgent ? userAgent.slice(0, 200) : null;
    }

    // Optional GPS from FAB
    const gpsLatRaw = formData.get("gpsLat");
    const gpsLngRaw = formData.get("gpsLng");
    const gpsLatitude =
      typeof gpsLatRaw === "string" ? parseFloat(gpsLatRaw) : null;
    const gpsLongitude =
      typeof gpsLngRaw === "string" ? parseFloat(gpsLngRaw) : null;

    // Optional caption from FAB → maps to description (existing column)
    const caption = formData.get("caption");
    const captionDescription =
      typeof caption === "string" && caption.length > 0 ? caption : null;

    const fingerprintFields = Array.from(formData.entries())
      .filter(([name]) => name !== "file")
      .map(([name, value]) => [
        name,
        typeof value === "string" ? value : "[file]",
      ])
      .sort(([left], [right]) => left.localeCompare(right));

    const multipartFingerprint = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          inspectionId: id,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          fileSha256,
          fields: fingerprintFields,
        }),
      )
      .digest("hex");

    return withIdempotencyFingerprint({
      scope: session.user.id,
      key: idempotencyKey.key,
      method: request.method,
      path: request.nextUrl.pathname,
      fingerprint: multipartFingerprint,
      handler: async () => {
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
            // Cocoa chain-of-custody
            cocoaSha256,
            cocoaCapturedAtUtc,
            cocoaUserHash,
            cocoaDeviceHint,
            // FAB-supplied geo (only when present and valid)
            ...(gpsLatitude !== null && !Number.isNaN(gpsLatitude)
              ? { gpsLatitude }
              : {}),
            ...(gpsLongitude !== null && !Number.isNaN(gpsLongitude)
              ? { gpsLongitude }
              : {}),
            // FAB-supplied caption → description (only when present & no labelData.description)
            ...(captionDescription && !("description" in labelData)
              ? { description: captionDescription }
              : {}),
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

        // SP-E: dual-write hook — enqueue a background mirror to the org's
        // BYOK storage (Google Drive) if connected. Wrapped in try/catch so a
        // mirror failure never breaks the user-facing 201 response.
        try {
          await enqueueMirror({
            kind: MirrorJobKind.PHOTO,
            orgId: user?.organizationId,
            storagePath: uploadResult.storagePath,
            filename: file.name,
            mimeType: file.type || "image/jpeg",
            photoId: photo.id,
          });
        } catch (mirrorErr) {
          console.error(
            `[Storage Mirror] enqueue failed for photo ${photo.id}:`,
            mirrorErr,
          );
        }

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
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "upload" });
  }
}
