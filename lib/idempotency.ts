import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Idempotency-Key middleware — Stripe-style request replay protection.
 *
 * Closes RA-1266. Clients on unreliable networks (mobile app, background
 * sync) retry POSTs when they don't see a response, which on a payment
 * or invoice-create endpoint can double-charge / double-insert.
 *
 * Opt-in per route. Wrap handler with {@link withIdempotency} and clients
 * supply an `Idempotency-Key` header (UUID v4 recommended). The same key
 * returns the cached response — a different body under the same key
 * returns 409.
 *
 * Storage: durable Prisma-backed cache. This is intentionally database-backed
 * because mobile/offline replay and serverless multi-instance retries cannot
 * depend on process-local memory.
 *
 * Scope is intentionally user-level — two users using "the same" key
 * don't collide. Key format: 8–255 chars, printable ASCII.
 */

const KEY_HEADER = "idempotency-key";
const MUTATION_ID_HEADER = "x-restoreassist-mutation-id";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches Stripe
const MAX_KEY_LEN = 255;
const MIN_KEY_LEN = 8;
const MAX_BODY_CACHE_BYTES = 1_000_000; // 1MB — skip caching larger responses

type IdempotencyStatus = "PENDING" | "COMPLETE";

interface CachedResponse {
  status: number;
  body: string;
  contentType: string;
  fingerprint: string;
  expiresAt: number;
}

interface ClientMutationLedgerInput {
  workspaceId: string;
  userId?: string | null;
  inspectionId?: string | null;
  mutationId?: string | null;
  mutationType: string;
  clientCreatedAt?: Date | null;
}

/**
 * Extract and validate Idempotency-Key from request headers.
 * Returns null if absent, or error if malformed.
 */
export function getIdempotencyKey(
  req: NextRequest,
): { ok: true; key: string | null } | { ok: false; reason: string } {
  const raw = req.headers.get(KEY_HEADER);
  if (raw === null) return { ok: true, key: null };
  const key = raw.trim();
  if (key.length < MIN_KEY_LEN || key.length > MAX_KEY_LEN) {
    return {
      ok: false,
      reason: `Idempotency-Key must be ${MIN_KEY_LEN}–${MAX_KEY_LEN} chars`,
    };
  }
  // Printable ASCII only — reject control chars and non-ASCII to prevent
  // cache-key poisoning via Unicode normalisation collisions.
  if (!/^[\x21-\x7E]+$/.test(key)) {
    return {
      ok: false,
      reason: "Idempotency-Key must be printable ASCII with no spaces",
    };
  }
  return { ok: true, key };
}

export function getClientMutationId(
  req: NextRequest,
): { ok: true; mutationId: string | null } | { ok: false; reason: string } {
  const raw = req.headers.get(MUTATION_ID_HEADER);
  if (raw === null) return { ok: true, mutationId: null };
  const mutationId = raw.trim();
  if (mutationId.length < MIN_KEY_LEN || mutationId.length > MAX_KEY_LEN) {
    return {
      ok: false,
      reason: `X-RestoreAssist-Mutation-Id must be ${MIN_KEY_LEN}–${MAX_KEY_LEN} chars`,
    };
  }
  if (!/^[\x21-\x7E]+$/.test(mutationId)) {
    return {
      ok: false,
      reason:
        "X-RestoreAssist-Mutation-Id must be printable ASCII with no spaces",
    };
  }
  return { ok: true, mutationId };
}

function fingerprintBody(method: string, path: string, body: string): string {
  return createHash("sha256")
    .update(`${method}\n${path}\n${body}`)
    .digest("hex");
}

function buildCacheKey(scope: string, key: string): string {
  return `idem:${scope}:${key}`;
}

function responseFromCache(cached: CachedResponse): NextResponse {
  return new NextResponse(cached.body, {
    status: cached.status,
    headers: {
      "Content-Type": cached.contentType,
      "Idempotent-Replayed": "true",
    },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    (typeof err === "object" && err !== null && "code" in err)
  ) && (err as { code?: string }).code === "P2002";
}

function isCompleteRecord(record: {
  responseStatus: number | null;
  responseBody: string | null;
  responseContentType: string | null;
}): record is {
  responseStatus: number;
  responseBody: string;
  responseContentType: string | null;
} {
  return record.responseStatus !== null && record.responseBody !== null;
}

async function cleanupExpiredIdempotencyRecords(now: Date): Promise<void> {
  await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: now } },
  });
}

async function createClientMutationLedger({
  clientMutation,
  method,
  path,
  requestHash,
}: {
  clientMutation?: ClientMutationLedgerInput;
  method: string;
  path: string;
  requestHash: string;
}): Promise<void> {
  if (!clientMutation?.mutationId) return;

  try {
    await prisma.clientMutation.create({
      data: {
        workspaceId: clientMutation.workspaceId,
        userId: clientMutation.userId ?? null,
        inspectionId: clientMutation.inspectionId ?? null,
        mutationId: clientMutation.mutationId,
        mutationType: clientMutation.mutationType,
        method,
        path,
        requestHash,
        status: "PENDING",
        clientCreatedAt: clientMutation.clientCreatedAt ?? null,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

async function completeClientMutationLedger({
  clientMutation,
  responseStatus,
  responseBody,
}: {
  clientMutation?: ClientMutationLedgerInput;
  responseStatus: number;
  responseBody?: string | null;
}): Promise<void> {
  if (!clientMutation?.mutationId) return;

  await prisma.clientMutation.updateMany({
    where: {
      workspaceId: clientMutation.workspaceId,
      mutationId: clientMutation.mutationId,
    },
    data: {
      status: responseStatus >= 400 ? "REJECTED" : "COMPLETE",
      responseStatus,
      responseBody: responseBody ?? null,
      completedAt: new Date(),
    },
  });
}

async function failClientMutationLedger({
  clientMutation,
  errorCode,
}: {
  clientMutation?: ClientMutationLedgerInput;
  errorCode: string;
}): Promise<void> {
  if (!clientMutation?.mutationId) return;

  await prisma.clientMutation.updateMany({
    where: {
      workspaceId: clientMutation.workspaceId,
      mutationId: clientMutation.mutationId,
    },
    data: {
      status: "FAILED",
      errorCode,
      completedAt: new Date(),
    },
  });
}

async function reserveIdempotencySlot({
  cacheKey,
  scope,
  key,
  fingerprint,
  now,
}: {
  cacheKey: string;
  scope: string;
  key: string;
  fingerprint: string;
  now: Date;
}): Promise<
  | { kind: "reserved" }
  | { kind: "replay"; response: CachedResponse }
  | { kind: "conflict" }
  | { kind: "pending" }
> {
  try {
    await prisma.idempotencyRecord.create({
      data: {
        cacheKey,
        scope,
        key,
        fingerprint,
        status: "PENDING" satisfies IdempotencyStatus,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });
    return { kind: "reserved" };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { cacheKey },
    select: {
      fingerprint: true,
      status: true,
      responseStatus: true,
      responseBody: true,
      responseContentType: true,
      expiresAt: true,
    },
  });

  if (!existing) {
    return reserveIdempotencySlot({ cacheKey, scope, key, fingerprint, now });
  }

  if (existing.expiresAt < now) {
    await prisma.idempotencyRecord.deleteMany({ where: { cacheKey } });
    return reserveIdempotencySlot({ cacheKey, scope, key, fingerprint, now });
  }

  if (existing.fingerprint !== fingerprint) {
    return { kind: "conflict" };
  }

  if (existing.status === ("COMPLETE" satisfies IdempotencyStatus)) {
    if (!isCompleteRecord(existing)) {
      return { kind: "pending" };
    }

    return {
      kind: "replay",
      response: {
        status: existing.responseStatus,
        body: existing.responseBody,
        contentType: existing.responseContentType || "application/json",
        fingerprint,
        expiresAt: existing.expiresAt.getTime(),
      },
    };
  }

  return { kind: "pending" };
}

export async function withIdempotencyFingerprint({
  scope,
  key,
  method,
  path,
  fingerprint,
  clientMutation,
  handler,
}: {
  scope: string;
  key: string | null;
  method: string;
  path: string;
  fingerprint: string;
  clientMutation?: ClientMutationLedgerInput;
  handler: () => Promise<NextResponse>;
}): Promise<NextResponse> {
  if (!key) return handler();

  const cacheKey = buildCacheKey(scope, key);
  const requestFingerprint = fingerprintBody(method, path, fingerprint);
  const now = new Date();

  await cleanupExpiredIdempotencyRecords(now);

  const reservation = await reserveIdempotencySlot({
    cacheKey,
    scope,
    key,
    fingerprint: requestFingerprint,
    now,
  });

  if (reservation.kind === "conflict") {
    return NextResponse.json(
      {
        error:
          "Idempotency-Key reused with a different request body. Use a new key for new requests.",
      },
      { status: 409 },
    );
  }

  if (reservation.kind === "pending") {
    return NextResponse.json(
      {
        error:
          "A request with this Idempotency-Key is already in progress. Retry shortly.",
      },
      { status: 409 },
    );
  }

  if (reservation.kind === "replay") {
    return responseFromCache(reservation.response);
  }

  await createClientMutationLedger({
    clientMutation,
    method,
    path,
    requestHash: requestFingerprint,
  });

  let response: NextResponse;
  try {
    response = await handler();
  } catch (err) {
    await prisma.idempotencyRecord.deleteMany({ where: { cacheKey } });
    await failClientMutationLedger({
      clientMutation,
      errorCode: "HANDLER_THROW",
    });
    throw err;
  }

  if (response.status >= 500) {
    await prisma.idempotencyRecord.deleteMany({ where: { cacheKey } });
    await failClientMutationLedger({
      clientMutation,
      errorCode: `HTTP_${response.status}`,
    });
    return response;
  }

  const clonedBody = await response.clone().text();
  if (clonedBody.length > MAX_BODY_CACHE_BYTES) {
    await prisma.idempotencyRecord.deleteMany({ where: { cacheKey } });
    await completeClientMutationLedger({
      clientMutation,
      responseStatus: response.status,
    });
    return response;
  }

  await prisma.idempotencyRecord.update({
    where: { cacheKey },
    data: {
      status: "COMPLETE" satisfies IdempotencyStatus,
      responseStatus: response.status,
      responseBody: clonedBody,
      responseContentType:
        response.headers.get("content-type") || "application/json",
      expiresAt: new Date(now.getTime() + TTL_MS),
    },
  });

  await completeClientMutationLedger({
    clientMutation,
    responseStatus: response.status,
    responseBody: clonedBody,
  });

  return response;
}

/**
 * Wrap a POST/PATCH handler with idempotency.
 *
 * When the client sends `Idempotency-Key`:
 *   - First request: executes handler, caches the response body + status
 *     for TTL_MS, returns it
 *   - Same key + identical body: returns the cached response with
 *     `Idempotent-Replayed: true` header
 *   - Same key + different body: returns 409 Conflict
 *   - Same key arriving while first is still in-flight: returns 409
 *
 * When absent: handler runs unchanged.
 *
 * @param req        The inbound request (consumed for body/path)
 * @param scope      Caller-provided scope (usually `session.user.id`) so
 *                   two users can't collide on each other's keys
 * @param handler    Your handler. Receives the already-parsed body to
 *                   avoid the double-consume problem on req.json().
 */
export async function withIdempotency(
  req: NextRequest,
  scope: string,
  handler: (parsedBody: string) => Promise<NextResponse>,
  options: { clientMutation?: Omit<ClientMutationLedgerInput, "mutationId"> } = {},
): Promise<NextResponse> {
  const keyResult = getIdempotencyKey(req);
  if (!keyResult.ok) {
    return NextResponse.json({ error: keyResult.reason }, { status: 400 });
  }
  const mutationIdResult = getClientMutationId(req);
  if (!mutationIdResult.ok) {
    return NextResponse.json(
      { error: mutationIdResult.reason },
      { status: 400 },
    );
  }

  const bodyText = await req.text();

  if (!keyResult.key) {
    // No key supplied — pass through untouched.
    return handler(bodyText);
  }

  const fingerprint = fingerprintBody(
    req.method,
    req.nextUrl.pathname,
    bodyText,
  );
  return withIdempotencyFingerprint({
    scope,
    key: keyResult.key,
    method: req.method,
    path: req.nextUrl.pathname,
    fingerprint,
    clientMutation: options.clientMutation
      ? {
          ...options.clientMutation,
          mutationId: mutationIdResult.mutationId,
        }
      : undefined,
    handler: () => handler(bodyText),
  });
}

/** Test-only: clear the durable idempotency store between tests. */
export async function __resetIdempotencyStore(): Promise<void> {
  await prisma.idempotencyRecord.deleteMany();
}
