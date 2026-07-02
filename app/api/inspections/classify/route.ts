import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { ruleBasedClassify } from "@/lib/ai/auto-classify";
import { apiError, fromException } from "@/lib/api-errors";

// POST /api/inspections/classify
// Body: { description, notes?, averageMoistureReading?, location?, tenantId? }
// Returns: ClassificationResult
//
// Security: per CLAUDE.md Rule 1, every API route requires getServerSession.
// Rate limited per Rule 10 — keyed on session.user.id, not IP.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const rateLimited = await applyRateLimit(req, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 10,
    prefix: "classify",
    key: session.user.id,
  });
  if (rateLimited) return rateLimited;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid JSON body",
      status: 400,
    });
  }

  try {
    const result = ruleBasedClassify({
      description: body?.description ?? "",
      notes: body?.notes,
      averageMoistureReading: body?.averageMoistureReading,
      location: body?.location,
    });
    return NextResponse.json(result);
  } catch (error) {
    return fromException(req, error, { stage: "inspections-classify" });
  }
}
