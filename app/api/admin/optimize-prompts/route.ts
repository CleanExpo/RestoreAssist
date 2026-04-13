/**
 * POST /api/admin/optimize-prompts
 *
 * Runs the prompt optimization loop for a given claim type.
 * Returns OptimizationResult JSON with full audit trail.
 *
 * Body: {
 *   claimType: string            // required: "water_damage" | "fire_smoke" | "storm" | "mould" | "contents"
 *   budget?: number              // max Claude API calls (default 30, hard cap 50)
 *   threshold?: number           // min score improvement to promote a variant (default 2)
 *   testCasesPerEval?: number    // test cases per candidate evaluation (default 3)
 *   candidatesPerIteration?: number // candidate edits per iteration (default 3)
 * }
 *
 * Response: OptimizationResult JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import {
  optimizePrompt,
  type OptimizationOptions,
} from "@/lib/ai/prompt-optimizer";

const VALID_CLAIM_TYPES = [
  "water_damage",
  "fire_smoke",
  "storm",
  "mould",
  "contents",
] as const;

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    // ── Parse body ──
    const body = (await request.json()) as Record<string, unknown>;
    const {
      claimType,
      budget,
      threshold,
      testCasesPerEval,
      candidatesPerIteration,
    } = body;

    // ── Validate claimType ──
    if (!claimType || typeof claimType !== "string") {
      return NextResponse.json(
        { error: "claimType is required (string)" },
        { status: 400 },
      );
    }

    if (
      !VALID_CLAIM_TYPES.includes(
        claimType as (typeof VALID_CLAIM_TYPES)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `Invalid claimType "${claimType}". Valid types: ${VALID_CLAIM_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // ── Validate optional numeric params ──
    if (
      budget !== undefined &&
      (typeof budget !== "number" || budget < 1 || budget > 50)
    ) {
      return NextResponse.json(
        { error: "budget must be a number between 1 and 50" },
        { status: 400 },
      );
    }

    if (
      threshold !== undefined &&
      (typeof threshold !== "number" || threshold < 0)
    ) {
      return NextResponse.json(
        { error: "threshold must be a non-negative number" },
        { status: 400 },
      );
    }

    if (
      testCasesPerEval !== undefined &&
      (typeof testCasesPerEval !== "number" || testCasesPerEval < 1)
    ) {
      return NextResponse.json(
        { error: "testCasesPerEval must be a positive number" },
        { status: 400 },
      );
    }

    if (
      candidatesPerIteration !== undefined &&
      (typeof candidatesPerIteration !== "number" || candidatesPerIteration < 1)
    ) {
      return NextResponse.json(
        { error: "candidatesPerIteration must be a positive number" },
        { status: 400 },
      );
    }

    // ── Run optimizer ──
    const options: OptimizationOptions = {
      claimType,
      ...(typeof budget === "number" && { budget }),
      ...(typeof threshold === "number" && { threshold }),
      ...(typeof testCasesPerEval === "number" && { testCasesPerEval }),
      ...(typeof candidatesPerIteration === "number" && {
        candidatesPerIteration,
      }),
    };

    const result = await optimizePrompt(options);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error during optimization";

    // Distinguish missing API key from other errors
    if (message.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    console.error("[optimize-prompts] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
