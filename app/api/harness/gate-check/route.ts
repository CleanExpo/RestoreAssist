/**
 * POST /api/harness/gate-check
 *
 * Runs a confidence-weighted gate check on AI task output.
 * Returns qualityScore, confidence, decision (AUTO_SHIP | FLAG | RETRY),
 * and per-dimension breakdown.
 *
 * Auth: requires active session with TRIAL/ACTIVE/LIFETIME subscription.
 *
 * Body:
 *   projectKey      string  — e.g. "scope-quality", "report-builder"
 *   taskId          string? — Linear issue ID for traceability
 *   taskDescription string  — what the AI was asked to do
 *   taskOutput      string  — the AI's output to evaluate
 *   retryCount      number? — previous retry attempts (default 0)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runGateCheck } from "@/lib/harness/gate-check";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Subscription gate
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true },
  });
  const allowed = ["TRIAL", "ACTIVE", "LIFETIME"];
  if (!user || !allowed.includes(user.subscriptionStatus ?? "")) {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 402 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectKey, taskId, taskDescription, taskOutput, retryCount } =
    body as Record<string, unknown>;

  if (
    typeof projectKey !== "string" ||
    typeof taskDescription !== "string" ||
    typeof taskOutput !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "projectKey, taskDescription, and taskOutput are required strings",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runGateCheck({
      projectKey,
      taskId: typeof taskId === "string" ? taskId : undefined,
      taskDescription,
      taskOutput,
      retryCount: typeof retryCount === "number" ? retryCount : 0,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[gate-check] evaluation error:", err);
    return NextResponse.json(
      { error: "Gate check evaluation failed" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/harness/gate-check?projectKey=scope-quality&limit=20
 *
 * Returns recent gate check records for observability dashboards.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectKey = searchParams.get("projectKey") ?? undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  const records = await prisma.gateCheck.findMany({
    where: projectKey ? { projectKey } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      projectKey: true,
      taskId: true,
      qualityScore: true,
      confidence: true,
      decision: true,
      retryCount: true,
      telegramSent: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: records });
}
