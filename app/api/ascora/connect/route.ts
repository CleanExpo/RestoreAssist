/**
 * POST /api/ascora/connect
 * Save Ascora API key and verify connectivity.
 *
 * DELETE /api/ascora/connect
 * Remove the Ascora integration for the authenticated user.
 *
 * GET /api/ascora/connect
 * Return integration status (no apiKey in response).
 *
 * TLS NOTE: if Ascora connectivity fails on certificate validation, fix the
 * upstream certificate chain or configure scoped trusted CA material. Do not
 * disable process-wide Node TLS verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { encrypt } from "@/lib/credential-vault";

const ASCORA_BASE_URL = "https://api.ascora.com.au";

/** Verify the key is valid by hitting the Ascora health/jobs endpoint */
async function verifyAscoraKey(
  apiKey: string,
  baseUrl: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/jobs?page=1&pageSize=1`, {
      headers: { Auth: apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const parsed = await request.json().catch(() => null);
    const body = (
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {}
    ) as { apiKey?: unknown; baseUrl?: unknown };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : undefined;

    if (!apiKey?.trim()) {
      return apiError(request, {
        code: "VALIDATION",
        message: "apiKey is required",
        status: 400,
      });
    }

    const resolvedBase = (baseUrl?.trim() || ASCORA_BASE_URL).replace(
      /\/$/,
      "",
    );

    // Verify key before saving
    const valid = await verifyAscoraKey(apiKey.trim(), resolvedBase);
    if (!valid) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Could not connect to Ascora with the provided API key. Check Administration → API Settings in Ascora.",
        status: 422,
      });
    }

    // Encrypt the API key at rest (AES-256-GCM credential vault) — never
    // persist the raw third-party key. Read paths decrypt on use.
    const encryptedApiKey = encrypt(apiKey.trim());

    // Upsert the integration record
    const integration = await (prisma as any).ascoraIntegration.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        apiKey: encryptedApiKey,
        baseUrl: resolvedBase,
        isActive: true,
      },
      update: {
        apiKey: encryptedApiKey,
        baseUrl: resolvedBase,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      integrationId: integration.id,
      message:
        "Ascora connected. Run /api/ascora/sync to import historical data.",
    });
  } catch (error) {
    return fromException(request, error, { stage: "connect" });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    await (prisma as any).ascoraIntegration.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      success: true,
      message: "Ascora integration removed.",
    });
  } catch (error) {
    return fromException(request, error, { stage: "disconnect" });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const integration = await (prisma as any).ascoraIntegration.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        isActive: true,
        lastSyncAt: true,
        totalJobsImported: true,
        baseUrl: true,
        createdAt: true,
        // Never return apiKey
      },
    });

    return NextResponse.json({ integration });
  } catch (error) {
    return fromException(request, error, { stage: "status" });
  }
}
