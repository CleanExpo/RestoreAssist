/**
 * API Route: Browse Google Drive Folders
 *
 * Lists folders and PDF count for a given parent folder.
 * Used by the GoogleDriveFolderPicker component.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listDriveItems } from "@/lib/google-drive";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const body = await request.json();
    const { parentFolderId } = body;

    const folderId = parentFolderId || "root";

    const items = await listDriveItems(folderId);

    const folders = items.folders.map((f) => ({
      id: f.id,
      name: f.name,
    }));

    const pdfCount = items.files.filter(
      (f) =>
        f.mimeType === "application/pdf" ||
        f.name.toLowerCase().endsWith(".pdf"),
    ).length;

    return NextResponse.json({ folders, pdfCount });
  } catch (err) {
    const error = err as { message?: string; code?: number };
    if (error.message?.includes("not found") || error.code === 404) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Folder not found",
        status: 404,
        err,
        stage: "list-folders",
      });
    }
    if (error.message?.includes("permission") || error.code === 403) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Permission denied to access this folder",
        status: 403,
        err,
        stage: "list-folders",
      });
    }
    return fromException(request, err, { stage: "list-folders" });
  }
}
