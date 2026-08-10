/**
 * Single inspection photo — DELETE and PATCH (caption/location).
 * DELETE /api/inspections/[id]/photos/[photoId]
 * PATCH  /api/inspections/[id]/photos/[photoId]
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { apiError, fromException } from "@/lib/api-errors";
import { z } from "zod";

const patchSchema = z.object({
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
});

/** Best-effort Cloudinary public_id from a delivery URL. */
function publicIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const marker = "/upload/";
    const idx = url.indexOf(marker);
    if (idx < 0) return null;
    let rest = url.slice(idx + marker.length);
    // Strip version segment (v123456/) and transform segments before public_id
    rest = rest.replace(/^v\d+\//, "");
    // Drop file extension
    rest = rest.replace(/\.[a-zA-Z0-9]+$/, "");
    // If transforms remain (w_200,q_auto/...), take the last path after transforms
    // Cloudinary transforms are comma-separated and before the public_id path.
    const parts = rest.split("/");
    // Heuristic: skip segments that look like transforms (contain , or _)
    while (
      parts.length > 1 &&
      (parts[0].includes(",") || /^[a-z]_/.test(parts[0]))
    ) {
      parts.shift();
    }
    return parts.join("/") || null;
  } catch {
    return null;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
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

    const { id, photoId } = await params;
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

    const photo = await prisma.inspectionPhoto.findFirst({
      where: { id: photoId, inspectionId: id },
      select: { id: true },
    });
    if (!photo) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Photo not found",
        status: 404,
      });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Invalid patch",
        status: 400,
      });
    }

    const data: { location?: string | null; description?: string | null } = {};
    if (parsed.data.location !== undefined) data.location = parsed.data.location;
    if (parsed.data.description !== undefined) {
      data.description = parsed.data.description;
    }

    const updated = await prisma.inspectionPhoto.update({
      where: { id: photoId },
      data,
    });

    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Photo metadata updated",
        entityType: "InspectionPhoto",
        entityId: photoId,
        userId: session.user.id,
        changes: JSON.stringify(data),
      },
    });

    return NextResponse.json({ photo: updated });
  } catch (error) {
    return fromException(request, error, { stage: "photo-patch" });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
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

    const { id, photoId } = await params;
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

    const photo = await prisma.inspectionPhoto.findFirst({
      where: { id: photoId, inspectionId: id },
    });
    if (!photo) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Photo not found",
        status: 404,
      });
    }

    await prisma.inspectionPhoto.delete({ where: { id: photoId } });

    // Best-effort storage cleanup — never fail the user-facing delete.
    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true },
      });
      const storage = await getStorageProvider(user?.organizationId);
      const publicId = publicIdFromUrl(photo.url);
      if (publicId) {
        await storage.delete(publicId);
      }
    } catch (err) {
      console.warn(
        `[photos] storage delete failed for ${photoId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Photo deleted",
        entityType: "InspectionPhoto",
        entityId: photoId,
        userId: session.user.id,
        changes: JSON.stringify({ url: photo.url }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "photo-delete" });
  }
}
