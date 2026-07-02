/**
 * POST /api/admin/evaluation
 *
 * Runs the scope generation evaluation suite against golden test cases
 * and returns a scored report.
 *
 * Body: {
 *   claimTypes?: string[]   // Filter test cases (e.g. ["water_damage", "mould"])
 *   sampleSize?: number     // Max test cases per claim type
 *   promptOverride?: string // Custom system prompt to evaluate
 * }
 *
 * Returns: EvaluationReport JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-errors";
import {
  runEvaluationSuite,
  type EvaluationOptions,
} from "@/lib/ai/evaluation-harness";

const EVALUATION_CONFIGURATION_ERROR = "Evaluation service is not configured";
const EVALUATION_FAILURE_ERROR = "Evaluation failed";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      claimTypes?: string[];
      sampleSize?: number;
      promptOverride?: string;
    };

    const options: EvaluationOptions = {};

    if (Array.isArray(body.claimTypes) && body.claimTypes.length > 0) {
      options.claimTypes = body.claimTypes;
    }

    if (typeof body.sampleSize === "number" && body.sampleSize > 0) {
      options.sampleSize = body.sampleSize;
    }

    if (typeof body.promptOverride === "string" && body.promptOverride.trim()) {
      options.promptOverride = body.promptOverride.trim();
    }

    const report = await runEvaluationSuite(options);

    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failed";

    if (
      message.includes("ANTHROPIC_API_KEY") ||
      message.includes("Anthropic SDK")
    ) {
      // Genuine dependency-unavailable — auto-reports even at 503. The raw
      // message (which names the missing key) is logged server-side only;
      // the client body carries just code/message/eventId, never the detail.
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        message: EVALUATION_CONFIGURATION_ERROR,
        status: 503,
        err,
        stage: "evaluate",
      });
    }

    return apiError(request, {
      code: "INTERNAL",
      message: EVALUATION_FAILURE_ERROR,
      status: 500,
      err,
      stage: "evaluate",
    });
  }
}
