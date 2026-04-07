/**
 * RA-414: Provider Key Validation Endpoint
 *
 * POST /api/workspace/provider-connections/validate
 *   Test-calls the provider API with the stored key to confirm it is valid.
 *   Updates ProviderConnection.lastValidatedAt and status in the DB.
 *   Body: { provider: AiProvider }
 *   Returns: { provider, valid, errorMessage?, latencyMs }
 *
 * Safe to call from the settings UI — returns only validation result, never key material.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  validateProviderKey,
  type AiProvider,
} from "@/lib/workspace/provider-connections";
import { checkPaymentGate } from "@/lib/workspace/payment-gate";

const VALID_PROVIDERS: AiProvider[] = [
  "ANTHROPIC",
  "OPENAI",
  "GOOGLE",
  "GEMMA",
];

function isValidProvider(value: unknown): value is AiProvider {
  return (
    typeof value === "string" && VALID_PROVIDERS.includes(value as AiProvider)
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gate = await checkPaymentGate(session.user.id);
    if (!gate.allowed) return gate.response;
    const { workspace } = gate;

    const body = await req.json().catch(() => null);
    const { provider } = (body ?? {}) as Record<string, unknown>;

    if (!isValidProvider(provider)) {
      return NextResponse.json(
        {
          error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const result = await validateProviderKey(workspace.id, provider);

    return NextResponse.json(result, { status: result.valid ? 200 : 422 });
  } catch (error) {
    console.error("[POST /api/workspace/provider-connections/validate]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
