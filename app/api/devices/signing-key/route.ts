/**
 * RA-7090 slice 2: device signing-key registration.
 * POST /api/devices/signing-key — register this device's Ed25519 public key
 * for the authenticated user (DeviceSigningKey). Signed capture manifests
 * only verify against a key registered here and not revoked.
 *
 * Idempotent: re-posting the SAME key (same publicKeyId + same PEM) for the
 * same user returns 200 with the existing record. A publicKeyId collision
 * with a different key or another user's key is 409.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";

const MAX_PEM_LENGTH = 4096;

// Per-user registration cap and rate limit (fold-in): a device registers
// once and re-registers only on rotation, so a generous window still stops
// key-stuffing.
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_REGISTRATIONS_PER_WINDOW = 10;
const MAX_LIVE_KEYS_PER_USER = 20;

function normalisePem(pem: string): string {
  return pem.replace(/\r\n/g, "\n").trim();
}

/**
 * Review round 1 (MUST-FIX 3): the key id is DERIVED from the key material,
 * server-side. It used to be client-supplied, which broke revocation: a
 * revoked key could be re-registered under a fresh alias and go straight
 * back to signing accepted manifests, and two accounts could register the
 * same public key under different aliases. Deriving the id makes a revoked
 * key collide with its own revoked record, so revocation is permanent.
 */
export function deriveDeviceKeyId(publicKey: crypto.KeyObject): string {
  const spkiDer = publicKey.export({ format: "der", type: "spki" });
  return crypto.createHash("sha256").update(spkiDer).digest("hex").slice(0, 16);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  try {
    // Fold-in: per-user rate limit on registration.
    const limited = await applyRateLimit(request, {
      prefix: "device-signing-key",
      key: userId,
      windowMs: REGISTRATION_WINDOW_MS,
      maxRequests: MAX_REGISTRATIONS_PER_WINDOW,
    });
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    // NOTE: any client-supplied `publicKeyId` is deliberately IGNORED — the
    // id is derived from the key material below (MUST-FIX 3).
    const { publicKeyPem, deviceUuid, devicePlatform } = (body ?? {}) as Record<
      string,
      unknown
    >;

    if (
      typeof publicKeyPem !== "string" ||
      publicKeyPem.length === 0 ||
      publicKeyPem.length > MAX_PEM_LENGTH
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message: "publicKeyPem is required",
        status: 400,
      });
    }

    // The PEM must parse as an Ed25519 PUBLIC key — anything else (RSA,
    // EC, a private key, free text) can never verify a capture manifest
    // and must not enter the trust store.
    const pem = normalisePem(publicKeyPem);
    // crypto.createPublicKey() would silently DERIVE a public key from a
    // private PEM — an SPKI-only gate stops private key material from ever
    // being persisted verbatim into publicKeyPem.
    if (
      !pem.startsWith("-----BEGIN PUBLIC KEY-----") ||
      !pem.endsWith("-----END PUBLIC KEY-----")
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message: "publicKeyPem must be an SPKI public key PEM",
        status: 400,
      });
    }
    let keyObject: crypto.KeyObject;
    try {
      keyObject = crypto.createPublicKey(pem);
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "publicKeyPem is not a valid public key",
        status: 400,
      });
    }
    if (keyObject.asymmetricKeyType !== "ed25519") {
      return apiError(request, {
        code: "VALIDATION",
        message: "publicKeyPem must be an Ed25519 public key",
        status: 400,
      });
    }

    // MUST-FIX 3: derive the id from the SPKI bytes. Because the id is a
    // function of the key, a REVOKED key re-registering collides with its
    // own revoked row below and is refused — revocation cannot be escaped
    // by inventing a new alias.
    const publicKeyId = deriveDeviceKeyId(keyObject);

    const existing = await prisma.deviceSigningKey.findUnique({
      where: { publicKeyId },
    });
    if (existing) {
      if (existing.revokedAt) {
        return apiError(request, {
          code: "FORBIDDEN",
          message:
            "This signing key has been revoked and cannot be re-registered",
          status: 403,
        });
      }
      if (existing.userId === userId) {
        // Same user re-registering the same live key — idempotent.
        return NextResponse.json(
          {
            deviceSigningKey: {
              publicKeyId: existing.publicKeyId,
              createdAt: existing.createdAt,
            },
          },
          { status: 200 },
        );
      }
      // Same key material under another account.
      return apiError(request, {
        code: "CONFLICT",
        message: "This signing key is already registered to another account",
        status: 409,
      });
    }

    // Fold-in: cap live keys per user so registration cannot be used to
    // stuff the trust store.
    const liveKeyCount = await prisma.deviceSigningKey.count({
      where: { userId, revokedAt: null },
    });
    if (liveKeyCount >= MAX_LIVE_KEYS_PER_USER) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Too many registered signing keys — revoke an existing device key first",
        status: 400,
      });
    }

    let created;
    try {
      created = await prisma.deviceSigningKey.create({
        data: {
          userId,
          publicKeyId,
          publicKeyPem: pem,
          deviceUuid:
            typeof deviceUuid === "string" && deviceUuid ? deviceUuid : null,
          devicePlatform:
            typeof devicePlatform === "string" && devicePlatform
              ? devicePlatform
              : null,
        },
      });
    } catch (createErr) {
      // Round 4: the concurrent-registration race. Two in-flight requests for
      // the SAME key both pass the findUnique check, then one loses on the
      // publicKeyId unique constraint. A double-tap is not a conflict — it is
      // the same device registering the same key — so re-read the winner's
      // row and return the idempotent 200 rather than a generic 409.
      const code =
        typeof createErr === "object" && createErr !== null && "code" in createErr
          ? (createErr as { code?: unknown }).code
          : undefined;
      if (code !== "P2002") throw createErr;

      const winner = await prisma.deviceSigningKey.findUnique({
        where: { publicKeyId },
      });
      if (winner && winner.userId === userId && !winner.revokedAt) {
        return NextResponse.json(
          {
            deviceSigningKey: {
              publicKeyId: winner.publicKeyId,
              createdAt: winner.createdAt,
            },
          },
          { status: 200 },
        );
      }
      // Lost the race to a DIFFERENT owner, or to a revoked row — the
      // ordinary conflict/revocation answers still apply.
      if (winner?.revokedAt) {
        return apiError(request, {
          code: "FORBIDDEN",
          message:
            "This signing key has been revoked and cannot be re-registered",
          status: 403,
        });
      }
      return apiError(request, {
        code: "CONFLICT",
        message: "This signing key is already registered to another account",
        status: 409,
      });
    }

    return NextResponse.json(
      {
        deviceSigningKey: {
          publicKeyId: created.publicKeyId,
          createdAt: created.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return fromException(request, error, { stage: "device-signing-key-post" });
  }
}
