import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateImageUpload } from "@/lib/media/validate-image-upload";
import { apiError, fromException } from "@/lib/api-errors";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // RA-1316: upload endpoint was uncapped. A compromised session could
    // drive arbitrary Cloudinary spend. 60 uploads / 15 min / user is
    // generous for real field-tech photo batching (dozens per inspection)
    // while bounding blast radius on abuse.
    const rateLimited = await applyRateLimit(request, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 60,
      prefix: "upload",
      key: session.user.id,
    });
    if (rateLimited) return rateLimited;

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No file provided",
        status: 400,
      });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const imageCheck = validateImageUpload({
      declaredType: file.type,
      sizeBytes: file.size,
      buffer,
      maxBytes: MAX_FILE_BYTES,
      allowedTypes: ALLOWED_IMAGE_TYPES,
    });
    if (!imageCheck.ok && imageCheck.reason === "too-large") {
      return apiError(request, {
        code: "VALIDATION",
        message: "File size exceeds 10MB limit.",
        status: 400,
      });
    }
    if (!imageCheck.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid file type. Only images are allowed.",
        status: 400,
      });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(buffer, {
      folder: `uploads/${session.user.id}`,
      resource_type: "image",
      transformation: [{ quality: "auto" }, { format: "auto" }],
    });

    return NextResponse.json({
      success: true,
      url: result.url,
      thumbnailUrl: result.thumbnailUrl,
      publicId: result.publicId,
      filename: file.name,
      size: file.size,
      type: imageCheck.mediaType,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (error) {
    // Never surface SDK internals (Cloudinary endpoint, credentials) to client
    // — fromException emits a generic message; detail goes to reportError.
    return fromException(request, error, { stage: "upload" });
  }
}
