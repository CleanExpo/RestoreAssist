/**
 * RA-414: Provider Connections API
 *
 * Workspace-scoped REST endpoints for managing BYOK AI provider keys.
 *
 * GET  /api/workspace/provider-connections
 *   Returns existing provider configuration metadata without reading keys or provisioning.
 *
 * POST /api/workspace/provider-connections
 *   Upsert a provider connection (save/update an API key).
 *   Body: { provider: AiProvider; apiKey: string }
 *
 * DELETE /api/workspace/provider-connections
 *   Disable a provider connection (does not delete the row — preserves audit trail).
 *   Body: { provider: AiProvider }
 *
 * POST /api/workspace/provider-connections/validate
 *   Trigger key validation for a specific provider (test-calls the provider API).
 *   Body: { provider: AiProvider }
 *   NOTE: Validation is handled by a separate route file at validate/route.ts.
 *
 * SECURITY:
 *   - Requires authenticated session
 *   - Only workspace owners and managers may modify connections
 *   - GET never reads credentials; writes return only the existing safe summary
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  upsertProviderConnection,
  disableProviderConnection,
  type AiProvider,
} from "@/lib/workspace/provider-connections";
import { getEffectiveUserIdForIntegrations } from "@/lib/ai-provider";
import { listConfiguredAiConnections } from "@/lib/services/integrations/ai-connections";
import { authorizeProviderWorkspace } from "@/lib/workspace/provider-connection-access";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

const VALID_PROVIDERS: AiProvider[] = [
  "ANTHROPIC",
  "OPENAI",
  "GOOGLE",
  "GEMMA",
  "OPENROUTER",
];

function isValidProvider(value: unknown): value is AiProvider {
  return (
    typeof value === "string" && VALID_PROVIDERS.includes(value as AiProvider)
  );
}

/**
 * Server-authoritative bounds on the credential payload. The onboarding card
 * offers a free-text model slug whenever the OpenRouter catalogue is
 * unavailable, so an arbitrarily large string can reach this route through an
 * ordinary UI path — and `model` is persisted alongside an encrypted
 * credential. The client mirrors these, but the client is not the authority.
 *
 * A routing slug is `namespace/model` with optional `:tag`; real OpenRouter
 * slugs measure well under 60 characters.
 */
const MAX_MODEL_SLUG_LENGTH = 128;
const MAX_API_KEY_LENGTH = 512;
const MODEL_SLUG_PATTERN = /^[A-Za-z0-9._~-]+\/[A-Za-z0-9._~-]+(:[A-Za-z0-9._-]+)?$/;

// ─── GET — List provider connections ─────────────────────────────────────────

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

    const ownerId = await getEffectiveUserIdForIntegrations(session.user.id);
    const { workspaceId, connections } = await listConfiguredAiConnections(ownerId);
    // Keep the settings response shape without reading or decrypting secrets.
    return NextResponse.json({
      workspaceId,
      connections: connections.map(connection => ({
        ...connection, workspaceId, maskedKey: "", lastError: null,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return fromException(_req, error, { stage: "list" });
  }
}

// ─── POST — Upsert a provider connection ─────────────────────────────────────

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

  // RA-1266: provider credentials are sensitive — prevent duplicate
  // write of the same key on retry.
  return withIdempotency(req, userId, async (rawBody) => {
    try {
      const gate = await authorizeProviderWorkspace(req, userId);
      if (!gate.allowed) return gate.response;
      const { workspace } = gate;

      let body: any = null;
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

      const { provider, apiKey, model } = body as Record<string, unknown>;

      if (!isValidProvider(provider)) {
        return apiError(req, {
          code: "VALIDATION",
          message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
          status: 400,
        });
      }

      if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
        return apiError(req, {
          code: "VALIDATION",
          message: "apiKey must be a non-empty string",
          status: 400,
        });
      }

      // Basic key format sanity checks (not full validation — use /validate for that)
      const trimmedKey = apiKey.trim();
      if (trimmedKey.length < 20) {
        return apiError(req, {
          code: "VALIDATION",
          message: "API key appears too short — please check and try again",
          status: 400,
        });
      }
      if (trimmedKey.length > MAX_API_KEY_LENGTH) {
        return apiError(req, {
          code: "VALIDATION",
          message: "API key appears too long — please check and try again",
          status: 400,
        });
      }

      // Reject an oversized or malformed routing slug BEFORE it is encrypted
      // and persisted. Validating after encryption would mean the allocation
      // and the write have already happened.
      if (
        provider === "OPENROUTER" &&
        typeof model === "string" &&
        model.trim()
      ) {
        const candidate = model.trim();
        if (candidate.length > MAX_MODEL_SLUG_LENGTH) {
          return apiError(req, {
            code: "VALIDATION",
            message: `Model slug must be ${MAX_MODEL_SLUG_LENGTH} characters or fewer`,
            status: 400,
          });
        }
        if (!MODEL_SLUG_PATTERN.test(candidate)) {
          return apiError(req, {
            code: "VALIDATION",
            message:
              "Model must look like namespace/model, for example deepseek/deepseek-chat",
            status: 400,
          });
        }
      }

      const member = await prisma.workspaceMember.findFirst({
        where: { userId: userId, workspaceId: workspace.id },
        select: { id: true },
      });

      // OpenRouter needs a model routing slug (namespace/model). It's optional
      // here — a blank value falls back to the server default at dispatch time.
      const modelSlug =
        provider === "OPENROUTER" &&
        typeof model === "string" &&
        model.trim()
          ? model.trim()
          : undefined;

      const connection = await upsertProviderConnection({
        workspaceId: workspace.id,
        provider,
        plaintextApiKey: trimmedKey,
        model: modelSlug,
        memberId: member?.id,
      });

      return NextResponse.json({ connection }, { status: 200 });
    } catch (error) {
      return fromException(req, error, { stage: "upsert" });
    }
  });
}

// ─── DELETE — Disable a provider connection ───────────────────────────────────

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

    const gate = await authorizeProviderWorkspace(req, session.user.id);
    if (!gate.allowed) return gate.response;
    const { workspace } = gate;

    const body = await req.json().catch(() => null);
    const { provider } = (body ?? {}) as Record<string, unknown>;

    if (!isValidProvider(provider)) {
      return apiError(req, {
        code: "VALIDATION",
        message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
        status: 400,
      });
    }

    await disableProviderConnection(workspace.id, provider);

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(req, error, { stage: "disable" });
  }
}
