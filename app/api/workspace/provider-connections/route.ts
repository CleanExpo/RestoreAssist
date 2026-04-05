/**
 * RA-414: Provider Connections API
 *
 * Workspace-scoped REST endpoints for managing BYOK AI provider keys.
 *
 * GET  /api/workspace/provider-connections
 *   Returns the list of all provider connections for the user's workspace (masked keys).
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
 *   - Plaintext API keys are NEVER returned — only masked representations
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getWorkspaceForUser,
  listProviderConnections,
  upsertProviderConnection,
  disableProviderConnection,
  type AiProvider,
} from "@/lib/workspace/provider-connections";
import { hasPermission } from "@/lib/workspace/permissions";

const VALID_PROVIDERS: AiProvider[] = ["ANTHROPIC", "OPENAI", "GOOGLE", "GEMMA"];

function isValidProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && VALID_PROVIDERS.includes(value as AiProvider);
}

// ─── GET — List provider connections ─────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await getWorkspaceForUser(session.user.id);
    if (!workspace) {
      return NextResponse.json(
        { error: "No active workspace found. Complete onboarding to set up your workspace." },
        { status: 404 },
      );
    }

    const connections = await listProviderConnections(workspace.id);

    return NextResponse.json({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      connections,
    });
  } catch (error) {
    console.error("[GET /api/workspace/provider-connections]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST — Upsert a provider connection ─────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await getWorkspaceForUser(session.user.id);
    if (!workspace) {
      return NextResponse.json(
        { error: "No active workspace found" },
        { status: 404 },
      );
    }

    // Only members with workspace.settings permission may save provider keys
    const canManage = await hasPermission(
      session.user.id,
      workspace.id,
      "workspace.settings",
    );
    if (!canManage) {
      return NextResponse.json(
        { error: "Forbidden — only workspace owners and managers may configure AI providers" },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { provider, apiKey } = body as Record<string, unknown>;

    if (!isValidProvider(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 },
      );
    }

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "apiKey must be a non-empty string" }, { status: 400 });
    }

    // Basic key format sanity checks (not full validation — use /validate for that)
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length < 20) {
      return NextResponse.json(
        { error: "API key appears too short — please check and try again" },
        { status: 400 },
      );
    }

    const connection = await upsertProviderConnection({
      workspaceId: workspace.id,
      provider,
      plaintextApiKey: trimmedKey,
      memberId: undefined, // TODO: resolve WorkspaceMember.id from session when needed
    });

    return NextResponse.json({ connection }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/workspace/provider-connections]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE — Disable a provider connection ───────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await getWorkspaceForUser(session.user.id);
    if (!workspace) {
      return NextResponse.json({ error: "No active workspace found" }, { status: 404 });
    }

    const canManage = await hasPermission(
      session.user.id,
      workspace.id,
      "workspace.settings",
    );
    if (!canManage) {
      return NextResponse.json(
        { error: "Forbidden — only workspace owners and managers may configure AI providers" },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => null);
    const { provider } = (body ?? {}) as Record<string, unknown>;

    if (!isValidProvider(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 },
      );
    }

    await disableProviderConnection(workspace.id, provider);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/workspace/provider-connections]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
