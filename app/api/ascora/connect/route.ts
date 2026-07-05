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
import { requireAddon } from "@/lib/entitlements";
import { SERVICE_CRM_SKU } from "@/lib/billing/service-crm-addon";

const ASCORA_BASE_URL = "https://api.ascora.com.au";
const ASCORA_ALLOWED_HOST = "api.ascora.com.au";
const ASCORA_ALLOWED_HOST_SUFFIX = ".ascora.com.au";

/**
 * SSRF guard for the user-supplied baseUrl (RA-6968): this value is
 * persisted and later used by /api/ascora/sync for outbound requests, so an
 * arbitrary user-supplied target (private IP, link-local, cloud metadata
 * endpoint, etc.) must never be accepted. Enforces https + a host allowlist
 * under ascora.com.au — mirrors the DR-NRPG connector's baseUrl guard
 * (app/api/dr-nrpg/connect/route.ts).
 */
function validateAscoraBaseUrl(
  value: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "baseUrl must be a valid https URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "baseUrl must be a valid https URL" };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host !== ASCORA_ALLOWED_HOST &&
    !host.endsWith(ASCORA_ALLOWED_HOST_SUFFIX)
  ) {
    return { ok: false, reason: "baseUrl must be a host under ascora.com.au" };
  }

  return { ok: true, url: value.replace(/\/$/, "") };
}

/** Verify the key is valid by hitting the Ascora health/jobs endpoint */
async function verifyAscoraKey(
  apiKey: string,
  baseUrl: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/jobs?page=1&pageSize=1`, {
      headers: { Auth: apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      // SSRF guard: never auto-follow a redirect. The baseUrl is already
      // host-allowlisted above, but a compromised/misconfigured upstream
      // could still try to bounce the request off-allowlist.
      redirect: "manual",
    });
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      return false;
    }
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

    // RA-6920 B1: connecting a service CRM (Ascora) is gated by the recurring
    // SERVICE_CRM add-on. Existing users who connected before this gate
    // shipped are grandfathered (scripts/backfill-grandfather-service-crm-addon.ts).
    const addonGate = await requireAddon(session.user.id, SERVICE_CRM_SKU);
    if (!addonGate.allowed) return addonGate.response;

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

    const rawBase = baseUrl?.trim() || ASCORA_BASE_URL;
    const baseValidation = validateAscoraBaseUrl(rawBase);
    if (!baseValidation.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: baseValidation.reason,
        status: 400,
      });
    }
    const resolvedBase = baseValidation.url;

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
