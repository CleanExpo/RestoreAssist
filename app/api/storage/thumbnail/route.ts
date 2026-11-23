/**
 * GET /api/storage/thumbnail?path=...
 * Redirects to a Cloudinary-transformed delivery URL for Media Library thumbs.
 * Auth required — paths are workspace media public_ids / CDN URLs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-errors";
import {
  isAbsoluteMediaUrl,
  isAllowedMediaUrl,
  resolveMediaDeliveryUrl,
} from "@/lib/media/cloudinary-asset-url";

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

  // RA-8350: an absolute path is a redirect target. Refuse any host the
  // media allow-list does not name, so this link cannot send a signed-in
  // user to an outside site.
  if (isAbsoluteMediaUrl(path) && !isAllowedMediaUrl(path)) {
    return apiError(request, {
      code: "VALIDATION",
      message: "path is not on an allowed media host",
      status: 422,
    });
  }

  const url = resolveMediaDeliveryUrl(path, {
    width: 480,
    height: 480,
    quality: "auto",
  });

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
