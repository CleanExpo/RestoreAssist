/**
 * API Route: Get Original Document for Gap Analysis
 *
 * Serves the original PDF document from Google Drive
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { downloadDriveFile } from "@/lib/google-drive";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { fileId } = await params;

    if (!fileId) {
      return apiError(request, {
        code: "VALIDATION",
        message: "fileId is required",
        status: 400,
      });
    }

    // Authorize: the Drive fileId must belong to a claim analysis the caller owns.
    // Without this, any authenticated user could fetch any tenant's claim PDF by id.
    const doc = await prisma.claimAnalysis.findUnique({
      where: { googleDriveFileId: fileId },
      select: { batch: { select: { userId: true } } },
    });
    if (!doc || doc.batch.userId !== session.user.id) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Document not found",
        status: 404,
      });
    }

    // Download the file from Google Drive
    const { buffer, mimeType } = await downloadDriveFile(fileId);

    // Return the PDF file. private + no-store: this is access-controlled PII and
    // must never be retained by shared/CDN caches.
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": mimeType || "application/pdf",
        "Content-Disposition": `inline; filename="document.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "serve-document" });
  }
}
