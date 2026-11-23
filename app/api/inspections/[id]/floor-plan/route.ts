import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionAssignedWrite } from "@/lib/auth/assert-tenancy";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { apiError, fromException } from "@/lib/api-errors";
import { formDataFromBytes, readBoundedBody } from "@/lib/media/bounded-body";
import {
  STRICT_REJECTION_MESSAGES,
  strictRejectionStatus,
  validateImageUploadStrict,
} from "@/lib/media/validate-image-upload";

// RA-8603: the RA-8234 strict policy caps the file at 10 MB; the request
// carries multipart overhead on top, so the raw body cap sits just above it.
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;

// POST - Upload floor plan image
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

    const { id } = await params;

    // Validate inspection exists and belongs to user
    // D-028: the owner's reach, plus the technician assigned to the job.
    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }
    const inspection = await prisma.inspection.findFirst({
      where: tenancy.data.inspectionManyWhere,
      select: { id: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Count the bytes that really arrive; Content-Length is only a hint.
    const body = await readBoundedBody(request, MAX_REQUEST_BYTES);
    if (!body) {
      return apiError(request, {
        code: "PAYLOAD_TOO_LARGE",
        message: "Floor-plan upload request must not exceed 12 MB.",
        status: 413,
      });
    }
    const formData = await formDataFromBytes(request, body);
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "File is required",
        status: 400,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // RA-8234 strict policy, one owner: size, signature, declared-vs-sniffed
    // type and header dimensions. GIF is no longer accepted (RA-8603): the
    // strict policy reads no GIF dimensions, so a GIF pixel bomb could not be
    // refused before storage, and floor plans are PNG, JPEG or WebP.
    const check = validateImageUploadStrict({
      declaredType: file.type,
      buffer,
      allowedTypes: ["image/png", "image/jpeg", "image/webp"],
    });
    if (!check.ok) {
      const status = strictRejectionStatus(check.reason);
      return apiError(request, {
        code: status === 413 ? "PAYLOAD_TOO_LARGE" : "VALIDATION",
        message: STRICT_REJECTION_MESSAGES[check.reason],
        status,
      });
    }

    const uploadResult = await uploadToCloudinary(buffer, {
      folder: `inspections/${id}/floor-plans`,
      resource_type: "image",
    });

    if (!uploadResult.url) {
      return apiError(request, {
        code: "INTERNAL",
        message: "Failed to upload floor plan",
        status: 500,
      });
    }

    // Update inspection with floor plan URL
    await prisma.inspection.update({
      where: tenancy.data.inspectionWhere,
      data: {
        floorPlanImageUrl: uploadResult.url,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Floor plan uploaded",
        entityType: "Inspection",
        entityId: id,
        userId: session.user.id,
        changes: JSON.stringify({
          floorPlanImageUrl: uploadResult.url,
        }),
      },
    });

    return NextResponse.json({ imageUrl: uploadResult.url }, { status: 200 });
  } catch (error) {
    return fromException(request, error, { stage: "upload" });
  }
}

// PUT - Update floor plan URL (for when URL is already known)
export async function PUT(
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

    // Validate inspection exists and belongs to user
    // D-028: the owner's reach, plus the technician assigned to the job.
    const tenancy = await assertInspectionAssignedWrite(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }
    const inspection = await prisma.inspection.findFirst({
      where: tenancy.data.inspectionManyWhere,
      select: { id: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Image URL is required",
        status: 400,
      });
    }

    // RA-1339: reject non-https or non-Cloudinary URLs. Previously any
    // `javascript:` / `data:` / attacker-hosted URL landed in
    // floorPlanImageUrl and was rendered, giving stored XSS on view.
    try {
      const parsed = new URL(imageUrl);
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== "res.cloudinary.com"
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid image URL",
          status: 400,
        });
      }
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid image URL",
        status: 400,
      });
    }

    // Update inspection with floor plan URL
    await prisma.inspection.update({
      where: tenancy.data.inspectionWhere,
      data: {
        floorPlanImageUrl: imageUrl,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return fromException(request, error, { stage: "update" });
  }
}
