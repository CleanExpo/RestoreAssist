/**
 * GET /api/storage/file?path=...
 * Redirects to the Cloudinary (or absolute) delivery URL for a media asset.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-errors";
import { resolveMediaDeliveryUrl } from "@/lib/media/cloudinary-asset-url";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path?.trim()) {
    return apiError(request, {
      code: "VALIDATION",
      message: "path query parameter is required",
      status: 422,
    });
  }

  const url = resolveMediaDeliveryUrl(path);
  if (!url) {
    return apiError(request, {
      code: "VALIDATION",
      message:
        "Cloudinary is not configured (set CLOUDINARY_CLOUD_NAME / CLOUDINARY_URL) and path is not an absolute URL",
      status: 422,
    });
  }

  return NextResponse.redirect(url, { status: 302 });
}
