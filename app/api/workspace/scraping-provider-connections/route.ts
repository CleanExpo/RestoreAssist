/**
 * RA-2966: Scraping Provider Connections API
 *
 * Workspace-scoped REST endpoints for managing BYOK scraping provider keys
 * (Apify, Bright Data, Zyte, Firecrawl, or SHARED). Mirror of the AI provider
 * BYOK API at /api/workspace/provider-connections (RA-414).
 *
 * GET    /api/workspace/scraping-provider-connections
 *   Returns the list of all scraping provider connections for the user's
 *   workspace (masked keys).
 *
 * POST   /api/workspace/scraping-provider-connections
 *   Upsert a scraping provider connection.
 *   Body: { provider: ScrapingProvider; apiKey: string; config?: object }
 *
 * DELETE /api/workspace/scraping-provider-connections
 *   Disable a scraping provider connection (preserves audit trail).
 *   Body: { provider: ScrapingProvider }
 *
 * SECURITY:
 *   - Requires authenticated session
 *   - Only workspace owners and managers may modify connections
 *   - Plaintext API keys are NEVER returned — only masked representations
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  listScrapingProviderConnections,
  upsertScrapingProviderConnection,
  disableScrapingProviderConnection,
  type ScrapingProvider,
} from "@/lib/workspace/scraping-provider-connections";
import { checkPaymentGate } from "@/lib/workspace/payment-gate";
import { hasPermission } from "@/lib/workspace/permissions";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

const VALID_PROVIDERS: ScrapingProvider[] = [
  "APIFY",
  "BRIGHTDATA",
  "ZYTE",
  "FIRECRAWL",
  "SHARED",
];

function isValidProvider(value: unknown): value is ScrapingProvider {
  return (
    typeof value === "string" &&
    VALID_PROVIDERS.includes(value as ScrapingProvider)
  );
}

// ─── GET — List scraping provider connections ───────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const gate = await checkPaymentGate(session.user.id);
    if (!gate.allowed) return gate.response;
    const { workspace } = gate;

    const connections = await listScrapingProviderConnections(workspace.id);

    return NextResponse.json({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      connections,
    });
  } catch (error) {
    return fromException(_req, error, { stage: "list" });
  }
}

// ─── POST — Upsert a scraping provider connection ───────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  return withIdempotency(req, userId, async (rawBody) => {
    try {
      const gate = await checkPaymentGate(userId);
      if (!gate.allowed) return gate.response;
      const { workspace } = gate;

      const allowed = await hasPermission(
        userId,
        workspace.id,
        "workspace.settings",
      );
      if (!allowed) {
        return apiError(req, {
          code: "FORBIDDEN",
          message:
            "Forbidden — only workspace owners and managers may configure scraping providers",
          status: 403,
        });
      }

      let body: {
        provider?: unknown;
        apiKey?: unknown;
        config?: unknown;
      } | null = null;
      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        body = null;
      }
      if (!body || typeof body !== "object") {
        return apiError(req, {
          code: "VALIDATION",
          message: "Invalid request body",
          status: 400,
        });
      }

      // RA-1548 — left raw: this 400 carries a `validProviders` array sibling
      // that the settings UI reads; the envelope has no field for it.
      if (!isValidProvider(body.provider)) {
        return NextResponse.json(
          { error: "Invalid provider", validProviders: VALID_PROVIDERS },
          { status: 400 },
        );
      }

      const provider = body.provider;
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";

      // SHARED is the only provider that may have an empty key
      if (provider !== "SHARED" && !apiKey.trim()) {
        return apiError(req, {
          code: "VALIDATION",
          message: "apiKey is required for non-SHARED providers",
          status: 400,
        });
      }

      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: workspace.id, userId },
        select: { id: true },
      });

      const config =
        body.config && typeof body.config === "object"
          ? (body.config as Record<string, unknown>)
          : undefined;

      const connection = await upsertScrapingProviderConnection({
        workspaceId: workspace.id,
        provider,
        plaintextApiKey: apiKey,
        config: config as never,
        memberId: member?.id,
      });

      return NextResponse.json({ connection });
    } catch (error) {
      return fromException(req, error, { stage: "upsert" });
    }
  });
}

// ─── DELETE — Disable a scraping provider connection ────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const gate = await checkPaymentGate(session.user.id);
    if (!gate.allowed) return gate.response;
    const { workspace } = gate;

    const allowed = await hasPermission(
      session.user.id,
      workspace.id,
      "workspace.settings",
    );
    if (!allowed) {
      return apiError(req, {
        code: "FORBIDDEN",
        message:
          "Forbidden — only workspace owners and managers may configure scraping providers",
        status: 403,
      });
    }

    const body = (await req.json()) as { provider?: unknown };
    // RA-1548 — left raw: `validProviders` array sibling (see POST above).
    if (!isValidProvider(body.provider)) {
      return NextResponse.json(
        { error: "Invalid provider", validProviders: VALID_PROVIDERS },
        { status: 400 },
      );
    }

    await disableScrapingProviderConnection(workspace.id, body.provider);

    return NextResponse.json({ ok: true, provider: body.provider });
  } catch (error) {
    return fromException(req, error, { stage: "disable" });
  }
}
