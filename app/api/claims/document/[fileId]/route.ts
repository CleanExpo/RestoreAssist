/**
 * API Route: Get Original Document for Gap Analysis
 *
 * Serves the original PDF document from Google Drive
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { downloadDriveFile } from "@/lib/google-drive";
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

    // Download the file from Google Drive
    const { buffer, mimeType } = await downloadDriveFile(fileId);

    // Return the PDF file
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": mimeType || "application/pdf",
        "Content-Disposition": `inline; filename="document.pdf"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "serve-document" });
  }
}
