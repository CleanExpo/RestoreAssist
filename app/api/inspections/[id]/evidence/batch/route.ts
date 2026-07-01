/**
 * RA-408: Batch evidence upload endpoint
 * POST /api/inspections/[id]/evidence/batch
 *
 * Accepts multipart/form-data with up to 20 files.
 * Runs parallel uploads (3 concurrent) via the storage provider.
 * Creates an EvidenceItem for each successful upload with chain-of-custody metadata.
 * Returns { data: { succeeded: EvidenceItem[], failed: [{filename, error}] } }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EvidenceClass } from "@prisma/client";
import { getStorageProvider } from "@/lib/storage";
import { classifyByMimeType } from "@/lib/storage/compression";
import type { UploadInput, UploadOutput } from "@/lib/storage";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

const MAX_FILES = 20;
const CONCURRENCY = 3;

interface PendingEvidenceUpload {
  file: File;
  evidenceClassOverride: string | null;
  input: UploadInput;
}

interface SuccessfulEvidenceUpload {
  item: PendingEvidenceUpload;
  uploaded: UploadOutput;
}

/**
 * Auto-classify evidence from MIME type and filename heuristics.
 * Caller can override by passing evidenceClass per file in the form data.
 */
function classifyEvidence(
  filename: string,
  mimeType: string,
  override?: string | null,
): EvidenceClass {
  if (
    override &&
    Object.values(EvidenceClass).includes(override as EvidenceClass)
  ) {
    return override as EvidenceClass;
  }

  const name = filename.toLowerCase();
  const type = classifyByMimeType(mimeType);

  if (type === "video") return "VIDEO_WALKTHROUGH";
  if (type === "document") return "SCOPE_DOCUMENT";

  // Filename keyword heuristics
  if (name.includes("thermal") || name.includes("flir") || name.includes("ir_"))
    return "THERMAL_IMAGE";
  if (name.includes("equipment") || name.includes("equip"))
    return "PHOTO_EQUIPMENT";
  if (
    name.includes("completion") ||
    name.includes("after") ||
    name.includes("final")
  )
    return "PHOTO_COMPLETION";
  if (name.includes("floor") || name.includes("plan")) return "FLOOR_PLAN";
  if (name.includes("moisture") || name.includes("reading"))
    return "MOISTURE_READING";

  return "PHOTO_DAMAGE";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id: inspectionId } = await params;

  try {
    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    // Get user's org for storage provider resolution
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid multipart form data",
        status: 400,
      });
    }

    const files = formData.getAll("files") as File[];
    const evidenceClassOverrides = formData.getAll("evidenceClass") as string[];
    const workflowStepId = formData.get("workflowStepId") as string | null;
    const capturedLat = formData.get("capturedLat");
    const capturedLng = formData.get("capturedLng");

    if (!files.length) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No files provided",
        status: 400,
      });
    }

    if (files.length > MAX_FILES) {
      return apiError(request, {
        code: "VALIDATION",
        message: `Maximum ${MAX_FILES} files per batch`,
        status: 400,
      });
    }

    // Per-file size guard before any arrayBuffer() call. Without this, a batch of
    // 20 × 500MB files = 10GB buffered into the serverless function heap.
    const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024; // 50 MB per file
    const oversized = files.find((f) => f.size > MAX_EVIDENCE_BYTES);
    if (oversized) {
      return apiError(request, {
        code: "VALIDATION",
        message: `File "${oversized.name}" exceeds the 50 MB per-file limit`,
        status: 413,
      });
    }

    const storageProvider = await getStorageProvider(user?.organizationId);

    // Build upload inputs — includes magic-byte validation per file.
    // Reading each file into a Buffer once so the same buffer is reused for
    // validation and upload (avoids a second arrayBuffer() call).
    const pendingUploads: PendingEvidenceUpload[] = [];
    for (const [idx, file] of files.entries()) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Magic-byte validation — prevents spoofed Content-Type header bypass.
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
      // Allow PDF documents in addition to images.
      const isPdf =
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46;

      if (!isJpeg && !isPng && !isGif && !isWebp && !isPdf) {
        return apiError(request, {
          code: "VALIDATION",
          message: `File "${file.name}" has an unsupported type. Only images and PDFs are allowed.`,
          status: 400,
        });
      }

      pendingUploads.push({
        file,
        evidenceClassOverride: evidenceClassOverrides[idx] || null,
        input: {
          buffer,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          folder: "evidence",
          orgId: user?.organizationId ?? "no-org",
          inspectionId,
        },
      });
    }

    // Batch upload with concurrency limit while preserving each source file's
    // metadata association. StorageProvider.uploadBatch returns only filenames,
    // so partial failures can otherwise shift MIME/class data onto the wrong
    // EvidenceItem.
    const uploadedItems: SuccessfulEvidenceUpload[] = [];
    const uploadFailures: Array<{ filename: string; error: string }> = [];
    for (let i = 0; i < pendingUploads.length; i += CONCURRENCY) {
      const chunk = pendingUploads.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (item) => ({
          item,
          uploaded: await storageProvider.upload(item.input),
        })),
      );

      results.forEach((result, idx) => {
        const item = chunk[idx];
        if (result.status === "fulfilled") {
          uploadedItems.push(result.value);
        } else {
          console.error("[evidence batch upload]", {
            filename: item.input.filename,
            error: result.reason,
          });
          uploadFailures.push({
            filename: item.input.filename,
            error: "Upload failed",
          });
        }
      });
    }

    // Create EvidenceItem records for each successful upload
    const createdItems = await Promise.allSettled(
      uploadedItems.map(async ({ item, uploaded }) => {
        const file = item.file;
        const evidenceClass = classifyEvidence(
          item.input.filename,
          file.type,
          item.evidenceClassOverride,
        );

        return prisma.evidenceItem.create({
          data: {
            inspectionId,
            workflowStepId: workflowStepId || null,
            evidenceClass,
            title: item.input.filename,
            capturedById: session.user.id,
            capturedByName: session.user.name || "Unknown",
            capturedAt: new Date(),
            capturedLat: capturedLat ? parseFloat(String(capturedLat)) : null,
            capturedLng: capturedLng ? parseFloat(String(capturedLng)) : null,
            deviceType: "WEB_BROWSER",
            fileUrl: uploaded.compressedUrl,
            fileMimeType: file.type,
            fileSizeBytes: uploaded.sizeBytes,
            thumbnailUrl: uploaded.thumbnailUrl,
            hashSha256: uploaded.sha256,
            structuredData: JSON.stringify({
              originalStoragePath: uploaded.storagePath,
              compressedStoragePath: uploaded.compressedPath,
              thumbnailStoragePath: uploaded.thumbnailPath,
            }),
          },
        });
      }),
    );

    const succeededItems = createdItems
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<any>).value);

    const dbFailures = createdItems
      .filter((r) => r.status === "rejected")
      .map((_, idx) => ({
        filename: uploadedItems[idx]?.item.input.filename ?? "unknown",
        error: "DB record creation failed",
      }));

    return NextResponse.json(
      {
        data: {
          succeeded: succeededItems,
          failed: [...uploadFailures, ...dbFailures],
        },
      },
      { status: 207 }, // 207 Multi-Status: partial success
    );
  } catch (error) {
    return fromException(request, error, { stage: "evidence-batch" });
  }
}
