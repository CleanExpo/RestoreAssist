/**
 * RA-1195 — AI Auto-classify IICRC Category & Class
 *
 * POST /api/inspections/[id]/classify
 *
 * Reads the inspection's moisture readings and affected-area data, sends them
 * to Claude Haiku with an S500:2021-aware prompt, and returns a *suggestion*:
 *
 *   { waterCategory: "CATEGORY_1"|"CATEGORY_2"|"CATEGORY_3",
 *     waterClass:    "CLASS_1"|"CLASS_2"|"CLASS_3"|"CLASS_4",
 *     confidence:    0-100,
 *     reasoning:     string (cites S500:2021 sections) }
 *
 * The endpoint does NOT persist anything. The user reviews the preview and
 * applies via the existing inspection update flow.
 *
 * Gates:
 *   - getServerSession (CLAUDE.md rule 1)
 *   - Subscription allowlist TRIAL/ACTIVE/LIFETIME (rule 8)
 *   - Rate-limit 20/min keyed on session.user.id (rule 10)
 *   - Anthropic key via getAnthropicApiKey(userId) with env fallback
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { classifyInspection } from "@/lib/services/ai/classify-inspection";
import { apiError, fromException } from "@/lib/api-errors";

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    prefix: "ai-classify",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true },
    });
    if (!user) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
    ) {
      return apiError(req, {
        code: "PAYMENT_REQUIRED",
        message: "Active subscription required",
        status: 402,
      });
    }

    // RA-1711 batch 3 — adopt shared tenancy helper (workspace-member + admin paths).
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: {
        id: true,
        inspectionNumber: true,
        propertyAddress: true,
        propertyPostcode: true,
        moistureReadings: {
          take: 200,
          select: {
            location: true,
            surfaceType: true,
            moistureLevel: true,
            depth: true,
            unit: true,
            notes: true,
          },
        },
        affectedAreas: {
          take: 100,
          select: {
            roomZoneId: true,
            affectedSquareFootage: true,
            waterSource: true,
            timeSinceLoss: true,
            description: true,
          },
        },
      },
    });

    if (!inspection) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    if (
      inspection.moistureReadings.length === 0 &&
      inspection.affectedAreas.length === 0
    ) {
      return apiError(req, {
        code: "VALIDATION",
        message:
          "No moisture readings or affected areas recorded — add data before requesting a classification.",
        status: 400,
      });
    }

    const result = await classifyInspection({
      userId,
      payload: {
        inspectionNumber: inspection.inspectionNumber,
        propertyPostcode: inspection.propertyPostcode,
        moistureReadings: inspection.moistureReadings,
        affectedAreas: inspection.affectedAreas,
      },
    });

    if (!result.ok) {
      console.error("[InspectionsClassify]", {
        inspectionId: inspection.id,
        userId,
        reason: result.reason,
        detail: result.detail,
      });
      const status =
        result.reason === "KEY_MISSING"
          ? 402
          : result.reason === "RATE_LIMITED"
            ? 429
            : result.reason === "MODEL_OVERLOADED"
              ? 503
              : result.reason === "PARSE_FAILED"
                ? 502
                : 500;
      const headers: Record<string, string> =
        result.retryAfterMs != null
          ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
          : {};
      return NextResponse.json({ error: result.reason }, { status, headers });
    }

    const parsed = result.data;

    const validCats = ["CATEGORY_1", "CATEGORY_2", "CATEGORY_3"];
    const validClasses = ["CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4"];
    if (
      !validCats.includes(parsed.waterCategory) ||
      !validClasses.includes(parsed.waterClass) ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.reasoning !== "string"
    ) {
      return apiError(req, {
        code: "UPSTREAM_FAILED",
        message: "Invalid classification shape from model",
        status: 502,
      });
    }

    return NextResponse.json({
      waterCategory: parsed.waterCategory,
      waterClass: parsed.waterClass,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
      reasoning: parsed.reasoning,
      inputSummary: {
        moistureReadings: inspection.moistureReadings.length,
        affectedAreas: inspection.affectedAreas.length,
      },
    });
  } catch (err) {
    // RA-786: never leak error.message
    return fromException(req, err, { stage: "classify" });
  }
}
