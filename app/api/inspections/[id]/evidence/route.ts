/**
 * Sprint G: Evidence API — CRUD for evidence items on an inspection
 * GET    /api/inspections/[id]/evidence — List all evidence
 * POST   /api/inspections/[id]/evidence — Create evidence item
 * DELETE /api/inspections/[id]/evidence — Delete evidence item (body: { evidenceId })
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { EvidenceClass } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { BUCKET_OPTIMISED } from "@/lib/storage/types";
import { apiError, fromException } from "@/lib/api-errors";
import { signStoredMediaUrl } from "@/lib/storage/sign-stored-url";
import {
  getIdempotencyKey,
  withIdempotency,
  withIdempotencyFingerprint,
} from "@/lib/idempotency";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";

export async function GET(
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

    const evidenceItems = await prisma.evidenceItem.findMany({
      where: { inspectionId },
      orderBy: { capturedAt: "desc" },
      take: 500,
    });

    // P0-1: re-sign private-bucket media URLs at read time (legacy hosts pass through).
    const signedItems = await Promise.all(
      evidenceItems.map(async (e) => ({
        ...e,
        fileUrl: await signStoredMediaUrl(e.fileUrl),
        thumbnailUrl: await signStoredMediaUrl(e.thumbnailUrl),
      })),
    );

    return NextResponse.json({ evidenceItems: signedItems });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-get" });
  }
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
  const userId = session.user.id;
  const { id: inspectionId } = await params;

  // RA-1711 batch 4 — adopt shared tenancy helper.
  const tenancy = await assertInspectionTenancy(session, inspectionId);
  if (!tenancy.ok) {
    return NextResponse.json(
      { error: tenancy.reason },
      { status: tenancy.status },
    );
  }

  // RA-7090 slice 1: guided capture posts the ORIGINAL asset as
  // multipart/form-data. Byte-carrying uploads go through the hash-verify
  // path (server recomputes SHA-256 over the exact stored bytes); the JSON
  // path below stays metadata-only and cannot set hashSha256.
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    return handleMultipartEvidencePost(request, session, inspectionId);
  }

  // RA-1266: evidence items are append-only with chain-of-custody —
  // retry creates duplicate C2PA-manifest records, which breaks the
  // one-reading-per-capture invariant (Board M-10).
  return withIdempotency(
    request,
    userId,
    async (rawBody) => {
      try {
        let body: any;
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return apiError(request, {
            code: "VALIDATION",
            message: "Invalid JSON body",
            status: 400,
          });
        }

        const {
          workflowStepId,
          evidenceClass,
          fileUrl,
          fileMimeType,
          fileSizeBytes,
          thumbnailUrl,
          structuredData,
          notes,
          capturedLat,
          capturedLng,
          deviceId,
          deviceType,
        } = body;

        const evidenceItem = await prisma.evidenceItem.create({
          data: {
            inspectionId,
            workflowStepId: workflowStepId || null,
            evidenceClass,
            capturedById: userId,
            capturedByName: session.user.name || "Unknown",
            capturedAt: new Date(),
            capturedLat: capturedLat || null,
            capturedLng: capturedLng || null,
            deviceId: deviceId || null,
            deviceType: deviceType || "WEB_BROWSER",
            fileUrl: fileUrl || null,
            fileMimeType: fileMimeType || null,
            fileSizeBytes: fileSizeBytes || null,
            thumbnailUrl: thumbnailUrl || null,
            structuredData: structuredData
              ? JSON.stringify(structuredData)
              : null,
            ...(notes !== undefined &&
              notes !== null &&
              ({ notes: notes || null } as any)),
          },
        });

        return NextResponse.json({ evidenceItem }, { status: 201 });
      } catch (error) {
        return fromException(request, error, { stage: "evidence-post" });
      }
    },
    tenancy.data.workspaceId
      ? {
          clientMutation: {
            workspaceId: tenancy.data.workspaceId,
            userId,
            inspectionId,
            mutationType: "evidence-item",
          },
        }
      : undefined,
  );
}

/**
 * RA-7090 slice 1: multipart evidence upload with server-side hash
 * verification. Mirrors the working /photos route (rule 21 chain-of-custody):
 *   1. The server computes SHA-256 over the EXACT bytes it stores.
 *   2. If the client supplied its own hash ("sha256" form field), a mismatch
 *      is rejected with 400 — tamper in transit.
 *   3. hashSha256 persisted on the EvidenceItem is ALWAYS the server-computed
 *      value, never a client claim.
 */
async function handleMultipartEvidencePost(
  request: NextRequest,
  session: { user: { id: string; name?: string | null } },
  inspectionId: string,
) {
  try {
    const idempotencyKey = getIdempotencyKey(request);
    if (!idempotencyKey.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: idempotencyKey.reason ?? "Invalid idempotency key",
        status: 400,
      });
    }

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

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "File is required",
        status: 400,
      });
    }

    // Guard before arrayBuffer() — multipart bypasses Next.js body size limits.
    const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024; // 20 MB — matches /photos
    if (file.size > MAX_EVIDENCE_BYTES) {
      return apiError(request, {
        code: "VALIDATION",
        message: "File too large — maximum 20 MB per evidence photo",
        status: 413,
      });
    }

    const evidenceClassRaw = formData.get("evidenceClass");
    if (
      typeof evidenceClassRaw !== "string" ||
      !Object.values(EvidenceClass).includes(evidenceClassRaw as EvidenceClass)
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Valid evidenceClass is required",
        status: 400,
      });
    }
    const evidenceClass = evidenceClassRaw as EvidenceClass;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic-byte validation — prevents Content-Type spoofing (mirrors /photos)
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

    // Server-side hash over the exact bytes that will be stored.
    const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    // Verify optional client hash — reject tamper in transit.
    const clientSha256 = formData.get("sha256");
    if (
      typeof clientSha256 === "string" &&
      clientSha256.length > 0 &&
      clientSha256.toLowerCase() !== fileSha256
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Hash mismatch — file may have been tampered with in transit",
        status: 400,
      });
    }

    const workflowStepIdRaw = formData.get("workflowStepId");
    const deviceTypeRaw = formData.get("deviceType");
    const deviceIdRaw = formData.get("deviceId");
    const capturedLatRaw = formData.get("capturedLat");
    const capturedLngRaw = formData.get("capturedLng");
    const capturedLat =
      typeof capturedLatRaw === "string" && capturedLatRaw.length > 0
        ? parseFloat(capturedLatRaw)
        : null;
    const capturedLng =
      typeof capturedLngRaw === "string" && capturedLngRaw.length > 0
        ? parseFloat(capturedLngRaw)
        : null;

    const structuredDataRaw = formData.get("structuredData");
    let clientStructuredData: Record<string, unknown> = {};
    if (typeof structuredDataRaw === "string" && structuredDataRaw.length > 0) {
      try {
        const parsed = JSON.parse(structuredDataRaw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          clientStructuredData = parsed;
        }
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "structuredData must be valid JSON",
          status: 400,
        });
      }
    }

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
          inspectionId,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          fileSha256,
          fields: fingerprintFields,
        }),
      )
      .digest("hex");

    // `await` is load-bearing: without it a handler throw (e.g. DB failure
    // after compensation) escapes the try/catch below and never becomes a
    // formatted 500.
    return await withIdempotencyFingerprint({
      scope: session.user.id,
      key: idempotencyKey.key,
      method: request.method,
      path: request.nextUrl.pathname,
      fingerprint: multipartFingerprint,
      handler: async () => {
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { organizationId: true },
        });

        const storageProvider = await getStorageProvider(user?.organizationId);
        const uploadResult = await storageProvider.upload({
          buffer,
          filename: file.name,
          mimeType: file.type || "image/jpeg",
          folder: "evidence",
          orgId: user?.organizationId ?? "no-org",
          inspectionId,
        });

        // RA-7090 review fix: the client manifest travels inside a legal
        // record — its sha256 must be the SERVER-verified hash. A client
        // could otherwise plant a diverging c2paManifest.sha256 alongside
        // verified bytes.
        const c2paRaw = clientStructuredData.c2paManifest;
        const structuredData = JSON.stringify({
          ...clientStructuredData,
          ...(c2paRaw && typeof c2paRaw === "object" && !Array.isArray(c2paRaw)
            ? {
                c2paManifest: {
                  ...(c2paRaw as Record<string, unknown>),
                  sha256: fileSha256,
                },
              }
            : {}),
          originalStoragePath: uploadResult.storagePath,
          compressedStoragePath: uploadResult.compressedPath,
          thumbnailStoragePath: uploadResult.thumbnailPath,
        });

        let evidenceItem;
        try {
          evidenceItem = await prisma.evidenceItem.create({
            data: {
              inspectionId,
              workflowStepId:
                typeof workflowStepIdRaw === "string" && workflowStepIdRaw
                  ? workflowStepIdRaw
                  : null,
              evidenceClass,
              title: file.name,
              capturedById: session.user.id,
              capturedByName: session.user.name || "Unknown",
              capturedAt: new Date(),
              capturedLat:
                capturedLat !== null && !Number.isNaN(capturedLat)
                  ? capturedLat
                  : null,
              capturedLng:
                capturedLng !== null && !Number.isNaN(capturedLng)
                  ? capturedLng
                  : null,
              deviceId:
                typeof deviceIdRaw === "string" && deviceIdRaw
                  ? deviceIdRaw
                  : null,
              deviceType:
                typeof deviceTypeRaw === "string" && deviceTypeRaw
                  ? deviceTypeRaw
                  : "WEB_BROWSER",
              fileUrl: uploadResult.compressedUrl,
              fileName: file.name,
              fileMimeType: file.type || "image/jpeg",
              fileSizeBytes: file.size,
              thumbnailUrl: uploadResult.thumbnailUrl ?? null,
              // Integrity: ALWAYS the server-computed hash over stored bytes.
              hashSha256: fileSha256,
              structuredData,
            },
          });
        } catch (createErr) {
          // RA-7090 review fix: a failed DB write must not orphan the
          // just-uploaded storage objects (client retries would multiply
          // orphans). Best-effort compensation — original lives in the
          // originals bucket, compressed/thumbnail in the optimised bucket.
          const cleanupTargets: Array<{ path: string; bucket?: string }> = [
            { path: uploadResult.storagePath },
            { path: uploadResult.compressedPath, bucket: BUCKET_OPTIMISED },
            { path: uploadResult.thumbnailPath, bucket: BUCKET_OPTIMISED },
          ];
          await Promise.allSettled(
            cleanupTargets
              .filter(({ path }) => Boolean(path))
              .map(({ path, bucket }) => storageProvider.delete(path, bucket)),
          );
          throw createErr;
        }

        return NextResponse.json({ evidenceItem }, { status: 201 });
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-post-multipart" });
  }
}

export async function DELETE(
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
  const body = await request.json();
  const { evidenceId } = body;

  try {
    // RA-1711 batch 4 — adopt shared tenancy helper.
    // RA-6800 — scope the child write so ownership is re-asserted atomically.
    const tenancy = await resolveInspectionWrite(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const evidence = await prisma.evidenceItem.findFirst({
      where: { id: evidenceId, inspectionId },
    });

    if (!evidence) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Evidence not found",
        status: 404,
      });
    }

    await prisma.evidenceItem.delete({
      where: {
        id: evidenceId,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "evidence-delete" });
  }
}
