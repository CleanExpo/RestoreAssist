/**
 * POST /api/dr-nrpg/connect
 * Save DR-NRPG API credentials and generate a webhook secret.
 *
 * GET /api/dr-nrpg/connect
 * Return integration status (never returns apiKey or webhookSecret).
 *
 * DELETE /api/dr-nrpg/connect
 * Remove the DR-NRPG integration.
 *
 * Body (POST):
 * {
 *   drNrpgApiKey: string
 *   drNrpgBaseUrl?: string  // default: https://api.dr-nrpg.com.au
 *   webhookSecret?: string  // if omitted, a secure 32-byte secret is auto-generated
 * }
 *
 * After connecting, give DR-NRPG the following webhook URL:
 *   POST {NEXTAUTH_URL}/api/webhooks/dr-nrpg
 *   Header: X-DRNRPG-Signature: sha256=<hmac-sha256 of body using webhookSecret>
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

const DR_NRPG_BASE_URL = "https://api.dr-nrpg.com.au";

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

  // RA-1266: prevents double-regenerating the webhook secret on retry
  // (which would invalidate any link DR-NRPG already has).
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let parsed: unknown;
      try {
        parsed = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Request body must be a JSON object",
          status: 400,
        });
      }
      // Validate field types at runtime — a JSON cast does not enforce them,
      // so {drNrpgApiKey:123} would otherwise reach .trim() and 500.
      const bodyObj = parsed as Record<string, unknown>;
      const drNrpgApiKey =
        typeof bodyObj.drNrpgApiKey === "string"
          ? bodyObj.drNrpgApiKey
          : undefined;
      const drNrpgBaseUrl =
        typeof bodyObj.drNrpgBaseUrl === "string"
          ? bodyObj.drNrpgBaseUrl
          : undefined;
      const webhookSecret =
        typeof bodyObj.webhookSecret === "string"
          ? bodyObj.webhookSecret
          : undefined;

      if (!drNrpgApiKey?.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "drNrpgApiKey is required",
          status: 400,
        });
      }

      const resolvedBase = (drNrpgBaseUrl?.trim() || DR_NRPG_BASE_URL).replace(
        /\/$/,
        "",
      );

      // SSRF guard: this base URL is persisted and later used by the DR-NRPG
      // liveness cron for outbound requests. Constrain it to an https origin
      // under the DR-NRPG domain so a user cannot store an arbitrary target.
      let baseHost: string;
      try {
        const parsedUrl = new URL(resolvedBase);
        baseHost = parsedUrl.hostname;
        if (parsedUrl.protocol !== "https:") throw new Error("not https");
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "drNrpgBaseUrl must be a valid https URL",
          status: 400,
        });
      }
      if (
        baseHost !== "api.dr-nrpg.com.au" &&
        !baseHost.endsWith(".dr-nrpg.com.au")
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "drNrpgBaseUrl must be a host under dr-nrpg.com.au",
          status: 400,
        });
      }

      // Auto-generate a secure webhook secret if not provided
      // This is used to verify inbound webhooks from DR-NRPG
      const resolvedSecret =
        webhookSecret?.trim() || randomBytes(32).toString("hex");

      const integration = await (prisma as any).drNrpgIntegration.upsert({
        where: { userId: userId },
        create: {
          userId: userId,
          drNrpgApiKey: drNrpgApiKey.trim(),
          drNrpgBaseUrl: resolvedBase,
          webhookSecret: resolvedSecret,
          isActive: true,
        },
        update: {
          drNrpgApiKey: drNrpgApiKey.trim(),
          drNrpgBaseUrl: resolvedBase,
          webhookSecret: resolvedSecret,
          isActive: true,
          updatedAt: new Date(),
        },
      });

      const appUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";

      return NextResponse.json({
        success: true,
        integrationId: integration.id,
        webhookUrl: `${appUrl}/api/webhooks/dr-nrpg`,
        webhookSecret: resolvedSecret, // Return once at creation — store securely in DR-NRPG
        signatureHeader: "X-DRNRPG-Signature",
        signatureFormat: "sha256=<hmac-sha256-hex>",
        message:
          "DR-NRPG integration saved. Configure the webhookUrl and webhookSecret in DR-NRPG's outbound webhook settings.",
      });
    } catch (error) {
      return fromException(request, error, { stage: "connect" });
    }
  });
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

    const integration = await (prisma as any).drNrpgIntegration.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        isActive: true,
        drNrpgBaseUrl: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        // Never return drNrpgApiKey or webhookSecret
      },
    });

    if (!integration) {
      return NextResponse.json({ integration: null });
    }

    const appUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";

    return NextResponse.json({
      integration: {
        ...integration,
        webhookUrl: `${appUrl}/api/webhooks/dr-nrpg`,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "status" });
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

    await (prisma as any).drNrpgIntegration.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      success: true,
      message: "DR-NRPG integration removed.",
    });
  } catch (error) {
    return fromException(request, error, { stage: "disconnect" });
  }
}
