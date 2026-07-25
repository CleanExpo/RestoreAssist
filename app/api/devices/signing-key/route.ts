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

// Client derives the id as hex-SHA-256(SPKI) truncated to 16 chars; accept a
// small superset so a future id scheme doesn't need a route change.
const PUBLIC_KEY_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_PEM_LENGTH = 4096;

function normalisePem(pem: string): string {
  return pem.replace(/\r\n/g, "\n").trim();
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
    const { publicKeyId, publicKeyPem, deviceUuid, devicePlatform } =
      (body ?? {}) as Record<string, unknown>;

    if (
      typeof publicKeyId !== "string" ||
      !PUBLIC_KEY_ID_PATTERN.test(publicKeyId)
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message: "publicKeyId must be 8-64 chars of [A-Za-z0-9_-]",
        status: 400,
      });
    }
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

    const existing = await prisma.deviceSigningKey.findUnique({
      where: { publicKeyId },
    });
    if (existing) {
      if (
        existing.userId === userId &&
        normalisePem(existing.publicKeyPem) === pem &&
        !existing.revokedAt
      ) {
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
      return apiError(request, {
        code: "CONFLICT",
        message: "publicKeyId is already registered",
        status: 409,
      });
    }

    const created = await prisma.deviceSigningKey.create({
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
