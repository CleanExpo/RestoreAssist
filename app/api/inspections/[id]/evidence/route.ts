/**
 * Sprint G: Evidence API — CRUD for evidence items on an inspection
 * GET    /api/inspections/[id]/evidence — List all evidence
 * POST   /api/inspections/[id]/evidence — Create evidence item
 * DELETE /api/inspections/[id]/evidence — Delete evidence item (body: { evidenceId })
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { EvidenceClass, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { BUCKET_OPTIMISED, BUCKET_ORIGINALS } from "@/lib/storage/types";
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
import {
  checkManifestBinding,
  parseSignedManifest,
  verifyManifestSignature,
} from "@/lib/evidence/manifest-verify";
import type { SignedEvidenceManifest } from "@/lib/evidence/manifest-canonical";
import { buildEvidenceStructuredData } from "@/lib/evidence/structured-data";
import { evaluateUnsignedSubmission } from "@/lib/evidence/signing-policy";

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
          title,
          structuredData,
          notes,
          capturedLat,
          capturedLng,
          deviceId,
          deviceType,
        } = body;

        // RA-7090 review fix (Opus #6): validate the enum up front —
        // mirrors the multipart path instead of 500ing inside Prisma.
        if (
          typeof evidenceClass !== "string" ||
          !Object.values(EvidenceClass).includes(
            evidenceClass as EvidenceClass,
          )
        ) {
          return apiError(request, {
            code: "VALIDATION",
            message: "Valid evidenceClass is required",
            status: 400,
          });
        }

        // RA-7090 slice 2 (P0 terminal fix): there is NO unsigned-exempt path.
        // The earlier metadata-only exemption relied on inspecting the payload
        // for bytes, but an encoding-threshold check is a denylist and was
        // defeatable (1x1 PNG at 92 base64 chars, hex bytes, int-string arrays,
        // a data: URL split across two fields, a byte-bearing key, …). So the
        // exemption and its heuristic guard are REMOVED: this writer goes
        // through the SAME fail-closed gate as the byte-carrying writers. Under
        // policy ON an unsigned submission is REJECTED regardless of content,
        // which closes the whole encoding-smuggle class — there is no unsigned
        // path left to smuggle bytes into.
        //
        // INTERIM (founder-visible): the client cannot yet sign a metadata-only
        // JSON submission — the device signer produces a per-CAPTURE manifest
        // (bound to a byte SHA-256) for the multipart path only, and nothing
        // server-side verifies a signature over a canonical JSON body. So under
        // the production default (policy ON) metadata-only JSON — including the
        // capture page's text-note quick-add (handleAddEvidence in
        // app/dashboard/inspections/[id]/capture/page.tsx) — is DISABLED until a
        // signed-metadata contract is added (client signs the canonical JSON,
        // server canonicalise-then-verifies). Same class of interim as the
        // batch writer. Do NOT re-introduce byte-detection as a substitute.
        const policy = await evaluateUnsignedSubmission(userId);
        if (!policy.ok) {
          return apiError(request, {
            code: policy.code,
            message: policy.message,
            status: policy.status,
          });
        }

        // RA-7090 review fix (Opus #6): the old create was cast `as any`,
        // which hid two schema violations — `title` is REQUIRED and there is
        // NO `notes` column (field notes belong in `description`). In
        // production every create on this path 500'd. Removing the cast lets
        // the compiler catch MISSING required fields; note it does NOT catch
        // excess properties on Prisma's create-input union, so the runtime
        // test asserting `"notes" in created === false` is the real guard
        // against phantom columns.
        const evidenceItem = await prisma.evidenceItem.create({
          data: {
            inspectionId,
            workflowStepId: workflowStepId || null,
            evidenceClass: evidenceClass as EvidenceClass,
            title:
              typeof title === "string" && title.trim()
                ? title.trim()
                : evidenceClass,
            description:
              typeof notes === "string" && notes.length > 0 ? notes : null,
            capturedById: userId,
            capturedByName: session.user.name || "Unknown",
            capturedAt: new Date(),
            capturedLat: capturedLat || null,
            capturedLng: capturedLng || null,
            deviceId: deviceId || null,
            deviceType: deviceType || "WEB_BROWSER",
            // RA-7090 slice 2 (P0 re-review): NO file fields on this path.
            // The metadata-only boundary above rejects any file/binary field,
            // so a byte-bearing record can never be created here — it must go
            // through the signed multipart path.
            // Review round 1 (MUST-FIX 1): this path used to persist client
            // structuredData VERBATIM, so a plain JSON POST could return 201
            // carrying signedManifestVerified:true and a fabricated
            // signature. It is a LIVE path (the capture page's
            // handleAddEvidence uses it), so it goes through the same shared
            // sanitiser as multipart. There is no server-computed hash here,
            // so every integrity claim is stripped rather than re-stamped.
            structuredData:
              structuredData === undefined || structuredData === null
                ? policy.downgradeReason
                  ? buildEvidenceStructuredData({
                      fileSha256: null,
                      downgradeReason: policy.downgradeReason,
                    })
                  : null
                : buildEvidenceStructuredData({
                    clientStructuredData: structuredData,
                    fileSha256: null,
                    downgradeReason: policy.downgradeReason,
                  }),
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
 * RA-7090 round 3: compensation gate. TRUE only for error classes that
 * PROVE the INSERT did not commit (Prisma validation errors, and known
 * request errors raised at parse/constraint time: P2000 value too long,
 * P2002 unique violation, P2003 FK violation). Timeouts, connection drops
 * and unknown errors are AMBIGUOUS — Postgres may have committed the row
 * even though the client saw an error — so callers must NOT delete storage
 * for those.
 */
function createInsertProvablyDidNotCommit(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientValidationError) return true;
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  return code === "P2000" || code === "P2002" || code === "P2003";
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
    const capturedAtRaw = formData.get("capturedAt");
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

    // RA-7090 slice 2: optional signed manifest. When present, the photo's
    // manifest must verify against a registered, non-revoked Ed25519 device
    // key belonging to the authenticated user, and must bind to the exact
    // server-computed byte hash + submission context. Absence stays allowed
    // (backwards compatible) — but only a verified manifest can ever mark
    // the record signed.
    const workflowStepId =
      typeof workflowStepIdRaw === "string" && workflowStepIdRaw
        ? workflowStepIdRaw
        : null;
    const signedManifestRaw = formData.get("signedManifest");
    const manifestSignatureRaw = formData.get("manifestSignature");
    let verifiedManifest: SignedEvidenceManifest | null = null;
    let verifiedSignature: string | null = null;
    let verifiedPublicKeyPem: string | null = null;
    if (signedManifestRaw !== null || manifestSignatureRaw !== null) {
      if (
        typeof signedManifestRaw !== "string" ||
        signedManifestRaw.length === 0 ||
        typeof manifestSignatureRaw !== "string" ||
        manifestSignatureRaw.length === 0
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "signedManifest and manifestSignature must both be supplied",
          status: 400,
        });
      }

      const parsedManifest = parseSignedManifest(signedManifestRaw);
      if (!parsedManifest.ok) {
        return apiError(request, {
          code: "VALIDATION",
          message: parsedManifest.message,
          status: 400,
        });
      }

      const signingKey = await prisma.deviceSigningKey.findUnique({
        where: { publicKeyId: parsedManifest.manifest.deviceKeyId },
      });
      if (!signingKey || signingKey.userId !== session.user.id) {
        // Unknown key and someone else's key are indistinguishable to the
        // caller — do not leak which.
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Signing key is not registered for this user",
          status: 403,
        });
      }
      if (signingKey.revokedAt) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Signing key has been revoked",
          status: 403,
        });
      }

      if (
        !verifyManifestSignature(
          parsedManifest.manifest,
          manifestSignatureRaw,
          signingKey.publicKeyPem,
        )
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "Manifest signature verification failed — manifest may have been tampered with",
          status: 400,
        });
      }

      const binding = checkManifestBinding(parsedManifest.manifest, {
        inspectionId,
        evidenceClass,
        userId: session.user.id,
        workflowStepId,
        fileSha256,
        // MUST-FIX 2: bind the location/time that actually get persisted.
        // `undefined` = the client sent no such field, which is not a
        // conflict; a SUPPLIED value that disagrees with the signed manifest
        // is rejected rather than silently overwriting the signed one.
        capturedLat:
          typeof capturedLatRaw === "string" && capturedLatRaw.length > 0
            ? capturedLat
            : undefined,
        capturedLng:
          typeof capturedLngRaw === "string" && capturedLngRaw.length > 0
            ? capturedLng
            : undefined,
        capturedAt:
          typeof capturedAtRaw === "string" && capturedAtRaw
            ? capturedAtRaw
            : undefined,
      });
      if (!binding.ok) {
        return apiError(request, {
          code: "VALIDATION",
          message: binding.message,
          status: 400,
        });
      }

      verifiedManifest = parsedManifest.manifest;
      verifiedSignature = manifestSignatureRaw;
      verifiedPublicKeyPem = signingKey.publicKeyPem;
    }

    // Round 2 MUST-FIX 2: the unsigned-submission policy now lives in ONE
    // shared helper that EVERY evidence writer calls (this path, the JSON
    // path below, and the batch route). The round-1 version guarded only
    // this writer, leaving the other two policy-exempt.
    let downgradeReason: string | null = null;
    if (!verifiedManifest) {
      const policy = await evaluateUnsignedSubmission(session.user.id);
      if (!policy.ok) {
        return apiError(request, {
          code: policy.code,
          message: policy.message,
          status: policy.status,
        });
      }
      downgradeReason = policy.downgradeReason;
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

        // Review round 1 (MUST-FIX 1): every writer goes through the ONE
        // shared sanitiser. It strips client-supplied signedManifestVerified,
        // whitelists the fields copied out of a verified manifest, and
        // re-stamps the server-computed hash.
        const structuredData = buildEvidenceStructuredData({
          clientStructuredData,
          fileSha256,
          verified:
            verifiedManifest && verifiedSignature && verifiedPublicKeyPem
              ? {
                  manifest: verifiedManifest,
                  signature: verifiedSignature,
                  publicKeyPem: verifiedPublicKeyPem,
                }
              : null,
          downgradeReason,
          storagePaths: {
            originalStoragePath: uploadResult.storagePath,
            compressedStoragePath: uploadResult.compressedPath,
            thumbnailStoragePath: uploadResult.thumbnailPath,
          },
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
              // MUST-FIX 2: on a verified manifest the PERSISTED record is
              // the SIGNED record — the dispute pack prints these columns,
              // so they must come from the signed bytes, not the form.
              capturedAt: verifiedManifest
                ? new Date(verifiedManifest.capturedAt)
                : new Date(),
              capturedLat: verifiedManifest
                ? verifiedManifest.gps.lat
                : capturedLat !== null && !Number.isNaN(capturedLat)
                  ? capturedLat
                  : null,
              capturedLng: verifiedManifest
                ? verifiedManifest.gps.lng
                : capturedLng !== null && !Number.isNaN(capturedLng)
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
          // RA-7090 round 3: compensation must be COMMIT-AWARE. Prisma
          // throwing does not prove the INSERT failed — a pooler connection
          // can drop after Postgres commits but before the client reads the
          // result. Deleting storage then would leave a persisted custody
          // row pointing at deleted bytes: a record the system itself made
          // permanently unverifiable (and the technician's retry would add
          // a second, good row while the corrupt one flows into reports).
          // Final round: carry the EXACT real bucket names so GC/cleanup
          // logs are actionable — the original lives in BUCKET_ORIGINALS
          // (the provider's delete default, made explicit here).
          const cleanupTargets: Array<{ path: string; bucket: string }> = [
            { path: uploadResult.storagePath, bucket: BUCKET_ORIGINALS },
            { path: uploadResult.compressedPath, bucket: BUCKET_OPTIMISED },
            { path: uploadResult.thumbnailPath, bucket: BUCKET_OPTIMISED },
          ].filter(({ path }) => Boolean(path));

          if (createInsertProvablyDidNotCommit(createErr)) {
            // Safe to compensate — the row provably cannot exist.
            const results = await Promise.allSettled(
              cleanupTargets.map(({ path, bucket }) =>
                storageProvider.delete(path, bucket),
              ),
            );
            results.forEach((result, idx) => {
              if (result.status === "rejected") {
                console.error(
                  "[evidence compensation] cleanup delete failed — orphaned object needs GC",
                  {
                    inspectionId,
                    path: cleanupTargets[idx].path,
                    bucket: cleanupTargets[idx].bucket,
                    error: result.reason,
                  },
                );
              }
            });
          } else {
            // Ambiguous failure (timeout, connection drop, unknown): the
            // INSERT may have committed. Retain the bytes and log the paths
            // in structured form for an async GC sweep to reconcile against
            // the EvidenceItem table.
            console.error(
              "[evidence compensation] ambiguous create failure — storage RETAINED for GC reconciliation",
              {
                inspectionId,
                fileSha256,
                paths: cleanupTargets,
                error: createErr,
              },
            );
          }
          throw createErr;
        }

        // Slice 2: key-usage bookkeeping. Best-effort — a failed timestamp
        // write must never fail a capture that already persisted.
        if (verifiedManifest) {
          try {
            await prisma.deviceSigningKey.update({
              where: { publicKeyId: verifiedManifest.deviceKeyId },
              data: { lastUsedAt: new Date() },
            });
          } catch {
            // non-fatal
          }
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
