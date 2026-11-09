/**
 * POST /api/inspections/[id]/sketches/import-from-image
 * RA-1607 — Claude Vision: convert a hand-drawn sketch photo to polygon data.
 *
 * Request: multipart/form-data with a `file` field (JPEG/PNG, max 10 MB)
 *   and optional `floorNumber` (defaults to 0).
 * Response: { rooms: [{ id, label, vertices: [{ x, y }, ...] }] }
 *   Vertices are in normalized coordinates [0, 1] relative to the image dimensions.
 *   `id` is server-issued so a first sketch save cannot claim operator_measured.
 *
 * Rate limit: 5 calls per 15 minutes per user to cap Vision API spend.
 *
 * RA-8232: when SKETCH_IMPORT_ABLITERATION_FALLBACK and ABLITERATION_API_KEY
 * are both set, an availability or output failure of the workspace Anthropic
 * read is retried once on abliteration.ai (platform-paid). Off by default.
 * Backup rooms get the same ai-suggested ids, so they still carry zero
 * billable quantity until independently measured.
 *
 * RA-8236: a JSON body `{ referenceId, contentSha256, floorNumber }` reads one
 * stored, attested floor-plan reference instead of an uploaded photo. The
 * bytes come from private storage and must match the recorded hash. No URL is
 * fetched, the backup vendor never receives reference artwork, and a completed
 * read replays from the audit trail without a second model call. A paid read
 * is recorded as started before the call, so a read that may have been billed
 * is never run again automatically. Access stays with the job owner: spending the workspace key at a technician's request is
 * a cost decision D-028 has not made.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { checkWorkspaceBudget } from "@/lib/ai/budget-guard";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { logAiUsage, estimateCostUsd } from "@/lib/usage/log-usage";
import {
  importSketchFromImage,
  SKETCH_READER_PROMPT_VERSION,
} from "@/lib/services/ai/import-sketch-from-image";
import { withIdempotencyFingerprint } from "@/lib/idempotency";
import { READ_POSSIBLY_CHARGED } from "@/lib/sketch/reference-room-import";
import {
  claimPaidRead,
  extractionEntityId,
  findBoundReference,
  findRecordedExtraction,
  parseReferenceBinding,
  providerRefusedWithoutReading,
  readBoundReferenceBytes,
  releasePaidRead,
  REFERENCE_EXTRACTION_ACTION,
  REFERENCE_EXTRACTION_ENTITY,
  REFERENCE_READ_DEADLINE_MS,
  REFERENCE_READ_LEASE_MS,
  REFERENCE_READ_MIN_WINDOW_MS,
  type BoundReference,
  type RecordedRead,
  type ReferenceBinding,
} from "@/lib/sketch/server-reference-extraction";
import {
  estimateAbliterationCostUsd,
  resolveSketchReaderFallback,
} from "@/lib/services/ai/sketch-reader-fallback";
import { applyRateLimit } from "@/lib/rate-limiter";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import { validateImageUploadDecoded } from "@/lib/media/decode-check";
import { formDataFromBytes, readBoundedBody } from "@/lib/media/bounded-body";
import { apiError, fromException } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";
import { withAiSuggestedRoomIds } from "@/lib/sketch/sketch-field-status";

// RA-1707 / P0-2 — Vision call costs roughly $0.005-0.012 per image at
// claude-sonnet-4-x pricing (depends on image dimensions). We assume the
// upper bound for the pre-call budget check; actual cost is logged
// post-call from the API response's token counts.
const VISION_COST_ESTIMATE_USD = 0.012;

const MAX_REQUEST_BYTES = 12 * 1024 * 1024; // 10 MB file plus multipart overhead
const ALLOWED_TYPES = ["image/jpeg", "image/png"] as const;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const MAX_BINDING_BYTES = 4096;

/** Carries a failed reference read out of the retry lock, which frees the key. */
class ReferenceReadRefused extends Error {
  constructor(readonly response: NextResponse) {
    super("reference read refused");
  }
}

/** One at a time for a floor and hash, until this transaction ends. */
function lockReferenceWriters(
  tx: Prisma.TransactionClient,
  writerLock: string,
) {
  return tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${writerLock}, 0))`,
  );
}

function replayRecordedRead(
  recorded: RecordedRead,
  reference: BoundReference,
  binding: ReferenceBinding,
): NextResponse {
  return NextResponse.json({
    ...recorded,
    reference: {
      id: reference.id,
      contentSha256: binding.contentSha256,
      floorNumber: binding.floorNumber,
    },
    replayed: true,
  });
}

interface ImportedRoom {
  label: string;
  vertices: { x: number; y: number }[];
}

interface Room extends ImportedRoom {
  id: string;
}

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

    const userId = session.user.id;
    const { id: inspectionId } = await params;

    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // RA-8236: JSON names a stored reference; multipart stays the photo path.
    let binding: ReferenceBinding | null = null;
    let reference: BoundReference | null = null;
    if (request.headers.get("content-type")?.startsWith("application/json")) {
      const raw = await readBoundedBody(request, MAX_BINDING_BYTES);
      let parsed: unknown = null;
      try {
        parsed = raw ? JSON.parse(Buffer.from(raw).toString("utf8")) : null;
      } catch {
        parsed = null;
      }
      binding = parseReferenceBinding(parsed);
      if (!binding) {
        return apiError(request, {
          code: "VALIDATION",
          message: "A floor-plan reference, hash and floor are required.",
          status: 400,
        });
      }
      reference = await findBoundReference(inspectionId, binding);
      if (!reference) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "That floor plan is no longer the active reference.",
          status: 404,
        });
      }
      const recorded = await findRecordedExtraction(inspectionId, binding);
      if (recorded) return replayRecordedRead(recorded, reference, binding);
    }

    // Rule 5 — subscription gate before the Claude Vision call below.
    const gate = await requireActiveSubscription(userId);
    if (gate) return gate;

    const rateLimited = await applyRateLimit(request, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX,
      prefix: "sketch-import",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    // RA-1707 / P0-2 — workspace AI daily budget check. Resolves the user's
    // active workspace and rejects when this Vision call would tip the org
    // over its daily ceiling. Defensive: when getWorkspaceForUser returns
    // null (user has no workspace bound) we still allow — pilots in legacy
    // user-scoped accounts continue to work.
    const workspace = await getWorkspaceForUser(userId);
    if (workspace) {
      const budget = await checkWorkspaceBudget({
        workspaceId: workspace.id,
        estimatedCostUsd: VISION_COST_ESTIMATE_USD,
      });
      if (!budget.ok) {
        return NextResponse.json(
          {
            error: budget.error,
            remainingUsd: budget.remainingUsd,
            budgetUsd: budget.budgetUsd,
          },
          { status: 429 },
        );
      }
    }

    let photoBytes: Buffer | null = null;
    let photoType: (typeof ALLOWED_TYPES)[number] = "image/png";
    let photoFloor = 0;
    if (!binding) {
      // Parse multipart
      let formData: FormData;
      try {
        // Count the bytes that really arrive; Content-Length is only a hint.
        const body = await readBoundedBody(request, MAX_REQUEST_BYTES);
        if (!body) {
          return apiError(request, {
            code: "VALIDATION",
            message: "File too large — maximum 10 MB",
            status: 400,
          });
        }
        formData = await formDataFromBytes(request, body);
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid multipart body",
          status: 400,
        });
      }

      const file = formData.get("file");
      if (!(file instanceof File)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Missing file field",
          status: 400,
        });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const imageCheck = await validateImageUploadDecoded({
        declaredType: file.type,
        buffer,
        allowedTypes: ALLOWED_TYPES,
      });
      if (!imageCheck.ok && imageCheck.reason === "too-large") {
        return apiError(request, {
          code: "VALIDATION",
          message: "File too large — maximum 10 MB",
          status: 400,
        });
      }
      if (!imageCheck.ok) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            imageCheck.reason === "unsupported-type"
              ? "Unsupported file type — use JPEG or PNG"
              : "Image is damaged, mismatched or too large to process",
          status: 400,
        });
      }
      photoBytes = buffer;
      photoType = imageCheck.mediaType as (typeof ALLOWED_TYPES)[number];
      const floorRaw = formData.get("floorNumber");
      photoFloor =
        typeof floorRaw === "string" && Number.isFinite(Number(floorRaw))
          ? Math.max(0, Math.floor(Number(floorRaw)))
          : 0;
    }

    // RA-6921 (P0) — resolve the workspace's own BYOK key; never spend the
    // platform's ANTHROPIC_API_KEY on a client's sketch-import workload.
    let apiKey: string;
    try {
      apiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
    } catch (err) {
      if (!(err instanceof NoWorkspaceKeyError)) throw err;
      console.error("[InspectionsSketchImport]", {
        userId,
        inspectionId,
        reason: "KEY_MISSING",
        detail: "No workspace Anthropic key configured",
      });
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: "AI service unavailable",
        status: 402,
      });
    }

    let providerFailureReason: string | null = null;
    const runRead = async (
      imageBytes: Buffer,
      mediaType: (typeof ALLOWED_TYPES)[number],
      floorNumber: number,
      timeoutMs?: number,
    ): Promise<NextResponse> => {
      // Convert to base64
      const base64 = imageBytes.toString("base64");

      const callStart = Date.now();
      const visionModel = "claude-sonnet-4-6";

      const result = await importSketchFromImage({
        apiKey,
        base64Image: base64,
        mediaType,
        // RA-8236: reference artwork stays with the workspace's own reader.
        fallback: binding ? null : resolveSketchReaderFallback(),
        ...(binding ? { sourceContext: "reference_plan" as const } : {}),
        ...(timeoutMs ? { timeoutMs } : {}),
      });

      if (!result.ok) {
        providerFailureReason = result.reason;
        console.error("[InspectionsSketchImport]", {
          userId,
          inspectionId,
          reason: result.reason,
          detail: result.detail,
        });
        // RA-1707 / P0-2 — log failure for workspace daily budget visibility.
        if (workspace) {
          logAiUsage({
            workspaceId: workspace.id,
            provider: "ANTHROPIC",
            model: visionModel,
            taskType: "vision_sketch_import",
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
            latencyMs: Date.now() - callStart,
            success: false,
            errorType: result.reason,
            metadata: { inspectionId },
          });
        }
        const status =
          result.reason === "KEY_MISSING"
            ? 402
            : result.reason === "RATE_LIMITED"
              ? 429
              : result.reason === "MODEL_OVERLOADED"
                ? 503
                : result.reason === "PARSE_FAILED"
                  ? 502
                  : 500;
        const headers: Record<string, string> =
          result.retryAfterMs != null
            ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
            : {};
        return NextResponse.json({ error: result.reason }, { status, headers });
      }

      const { primaryFailure, reader } = result.data;
      if (primaryFailure) {
        // RA-8232 — the backup reader produced these rooms. The workspace
        // Anthropic read failed, so log that failure as a primary failure would
        // be logged. The backup spend cannot go in AiUsageLog: its provider
        // column is a Prisma enum with no ABLITERATION value, and filing it
        // under ANTHROPIC would misstate Anthropic spend. It goes to the server
        // log, with a cost estimate, until that enum value exists.
        const { inputTokens, outputTokens } = result.data.usage;
        console.warn("[InspectionsSketchImport]", {
          userId,
          inspectionId,
          workspaceId: workspace?.id ?? null,
          reader: reader.vendor,
          model: reader.model,
          primaryReason: primaryFailure.reason,
          primaryDetail: primaryFailure.detail,
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateAbliterationCostUsd(
            inputTokens,
            outputTokens,
          ),
        });
        if (workspace) {
          logAiUsage({
            workspaceId: workspace.id,
            provider: "ANTHROPIC",
            model: visionModel,
            taskType: "vision_sketch_import",
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
            latencyMs: Date.now() - callStart,
            success: false,
            errorType: primaryFailure.reason,
            metadata: { inspectionId, backupReader: reader.model },
          });
        }
      } else if (workspace) {
        // RA-1707 / P0-2 — log post-call cost so the workspace daily budget
        // accumulates. Fire-and-forget; never blocks the response.
        const { inputTokens, outputTokens } = result.data.usage;
        logAiUsage({
          workspaceId: workspace.id,
          provider: "ANTHROPIC",
          model: visionModel,
          taskType: "vision_sketch_import",
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateCostUsd(
            "ANTHROPIC",
            visionModel,
            inputTokens,
            outputTokens,
          ),
          latencyMs: Date.now() - callStart,
          success: true,
          metadata: { inspectionId, mediaType },
        });
      }

      const rooms = result.data.rooms.filter(
        (r): r is ImportedRoom =>
          typeof r.label === "string" &&
          Array.isArray(r.vertices) &&
          r.vertices.length >= 3 &&
          r.vertices.every(
            (v) =>
              typeof v.x === "number" &&
              typeof v.y === "number" &&
              v.x >= 0 &&
              v.x <= 1 &&
              v.y >= 0 &&
              v.y <= 1,
          ),
      );

      const roomsWithIds: Room[] = rooms.map((room) => ({
        id: `ai-suggested-${randomUUID()}`,
        label: room.label,
        vertices: room.vertices,
      }));

      // RA-7617: remember these ids on the floor's sketch blob so a first
      // save cannot claim operator_measured. Looked up inspection-wide on
      // save (no schema change).
      const rememberedIds = roomsWithIds.map((r) => r.id);
      const persistRooms = async (db: Prisma.TransactionClient) => {
        if (rememberedIds.length === 0) return;
        const sketch = await db.claimSketch.findFirst({
          where: { inspectionId, floorNumber },
          select: { id: true, sketchData: true },
        });
        if (sketch) {
          await db.claimSketch.update({
            where: { id: sketch.id },
            data: {
              sketchData: withAiSuggestedRoomIds(
                (sketch.sketchData as Record<string, unknown> | null) ?? {},
                rememberedIds,
              ) as Prisma.InputJsonValue,
            },
          });
        } else {
          await db.claimSketch.create({
            data: {
              inspectionId,
              floorNumber,
              floorLabel:
                floorNumber === 0 ? "Ground Floor" : `Floor ${floorNumber}`,
              sketchData: withAiSuggestedRoomIds(
                {},
                rememberedIds,
              ) as Prisma.InputJsonValue,
              captureAdapter: "cloud_ai",
            },
          });
        }
      };

      if (binding && reference) {
        const bound = binding;
        const boundReference = reference;
        const boundReferenceId = reference.id;
        const writerLock = `${inspectionId}:${extractionEntityId(bound)}`;
        // The rooms and the replay record commit together, so a retry can
        // never see one without the other. Writers for one floor and hash go
        // through one at a time, and only the first keeps its rooms.
        const alreadyRecorded = await prisma.$transaction(async (tx) => {
          await lockReferenceWriters(tx, writerLock);
          const earlier = await findRecordedExtraction(inspectionId, bound, tx);
          if (earlier) return earlier;
          await persistRooms(tx);
          await tx.auditLog.create({
            data: {
              inspectionId,
              action: REFERENCE_EXTRACTION_ACTION,
              entityType: REFERENCE_EXTRACTION_ENTITY,
              entityId: extractionEntityId(bound),
              userId,
              changes: JSON.stringify({
                referenceId: boundReferenceId,
                contentSha256: bound.contentSha256,
                floorNumber: bound.floorNumber,
                promptVersion: SKETCH_READER_PROMPT_VERSION,
                reader: result.data.reader,
                rooms: roomsWithIds,
                exportPolicy: "reference_only_never_export",
              }),
            },
          });
          return null;
        });
        if (alreadyRecorded) {
          return replayRecordedRead(alreadyRecorded, boundReference, bound);
        }
        return NextResponse.json({
          rooms: roomsWithIds,
          reader: result.data.reader,
          promptVersion: SKETCH_READER_PROMPT_VERSION,
          reference: {
            id: boundReferenceId,
            contentSha256: bound.contentSha256,
            floorNumber: bound.floorNumber,
          },
        });
      }

      await persistRooms(prisma);
      return NextResponse.json({
        rooms: roomsWithIds,
        reader: result.data.reader,
        ...(primaryFailure ? { primaryFailure } : {}),
      });
    };

    if (binding && reference) {
      const boundReference = reference;
      const boundBinding = binding;
      const lockKey = `${inspectionId}:${extractionEntityId(binding)}`;
      const floorNumber = binding.floorNumber;
      try {
        return await withIdempotencyFingerprint({
          scope: "sketch-reference-read",
          key: lockKey,
          method: "POST",
          path: request.nextUrl.pathname,
          fingerprint: lockKey,
          pendingLeaseMs: REFERENCE_READ_LEASE_MS,
          handler: async () => {
            const startedAt = Date.now();
            // Another request may have finished while this one waited.
            const finished = await findRecordedExtraction(
              inspectionId,
              boundBinding,
            );
            if (finished) {
              return replayRecordedRead(finished, boundReference, boundBinding);
            }
            const stored = await readBoundReferenceBytes(boundReference);
            if (!stored.ok) {
              throw new ReferenceReadRefused(
                stored.reason === "hash_mismatch"
                  ? apiError(request, {
                      code: "CONFLICT",
                      message:
                        "The stored floor plan does not match its recorded hash. Upload it again.",
                      status: 409,
                    })
                  : apiError(request, {
                      code: "UPSTREAM_FAILED",
                      message: "The stored floor plan could not be read.",
                      status: 503,
                    }),
              );
            }
            // Written before the paid call, so no failure after it can pay twice.
            const claim = await prisma.$transaction(async (tx) => {
              await lockReferenceWriters(tx, lockKey);
              return claimPaidRead(inspectionId, boundBinding, userId, tx);
            });
            if (claim.kind === "recorded") {
              return replayRecordedRead(
                claim.recorded,
                boundReference,
                boundBinding,
              );
            }
            if (claim.kind === "possibly_charged") {
              throw new ReferenceReadRefused(
                NextResponse.json(
                  {
                    error:
                      "An earlier read of this floor plan may already have been charged, so it was not run again.",
                    code: READ_POSSIBLY_CHARGED,
                  },
                  { status: 409 },
                ),
              );
            }
            const readWindowMs =
              REFERENCE_READ_DEADLINE_MS - (Date.now() - startedAt);
            if (readWindowMs < REFERENCE_READ_MIN_WINDOW_MS) {
              await releasePaidRead(inspectionId, boundBinding, userId);
              throw new ReferenceReadRefused(
                apiError(request, {
                  code: "UPSTREAM_FAILED",
                  message: "The stored floor plan took too long to read.",
                  status: 503,
                }),
              );
            }
            const response = await runRead(
              stored.bytes,
              "image/png",
              floorNumber,
              readWindowMs,
            );
            // Only a completed read may be kept. Only a refusal that returned
            // no output frees the read for a retry; anything else may be billed.
            if (response.status !== 200) {
              if (
                providerFailureReason &&
                providerRefusedWithoutReading(providerFailureReason)
              ) {
                await releasePaidRead(inspectionId, boundBinding, userId);
              }
              throw new ReferenceReadRefused(response);
            }
            return response;
          },
        });
      } catch (err) {
        if (err instanceof ReferenceReadRefused) return err.response;
        throw err;
      }
    }

    return await runRead(photoBytes as Buffer, photoType, photoFloor);
  } catch (err) {
    return fromException(request, err, { stage: "sketch:import-from-image" });
  }
}
