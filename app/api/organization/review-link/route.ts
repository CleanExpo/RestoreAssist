/**
 * RA-6952 (epic RA-6948, Restoration Pulse P0) — Organization Google review
 * link settings.
 *
 * GET   /api/organization/review-link — read the firm's configured link
 * PATCH /api/organization/review-link — update it (owner only)
 *
 * Minimal, single-field settings surface following the org-settings idiom of
 * app/api/setup/state/route.ts (session-owner lookup via
 * `prisma.organization.findFirst({ where: { ownerId } })`, whitelisted patch
 * body). Kept separate from that route because googleReviewUrl is an ongoing
 * operational setting, not a setup-wizard field — it must stay editable after
 * setupCompletedAt, unlike the fields that route locks post-setup.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const org = await prisma.organization.findFirst({
      where: { ownerId: session.user.id },
      select: { googleReviewUrl: true },
    });
    if (!org) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "No organization for this user",
        status: 404,
      });
    }

    return NextResponse.json({
      data: { googleReviewUrl: org.googleReviewUrl },
    });
  } catch (error) {
    return fromException(req, error, { stage: "review-link-get" });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const body = (await req.json().catch(() => null)) as {
      googleReviewUrl?: unknown;
    } | null;
    if (!body || typeof body !== "object" || !("googleReviewUrl" in body)) {
      return apiError(req, {
        code: "VALIDATION",
        message: "googleReviewUrl is required",
        status: 400,
      });
    }

    const raw = body.googleReviewUrl;
    let googleReviewUrl: string | null;
    if (raw === null || raw === "") {
      googleReviewUrl = null;
    } else if (typeof raw !== "string") {
      return apiError(req, {
        code: "VALIDATION",
        message: "googleReviewUrl must be a string",
        status: 400,
      });
    } else {
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return apiError(req, {
          code: "VALIDATION",
          message: "googleReviewUrl must be a valid URL",
          status: 400,
        });
      }
      if (parsed.protocol !== "https:") {
        return apiError(req, {
          code: "VALIDATION",
          message: "googleReviewUrl must be an https:// link",
          status: 400,
        });
      }
      googleReviewUrl = raw;
    }

    const org = await prisma.organization.findFirst({
      where: { ownerId: session.user.id },
      select: { id: true },
    });
    if (!org) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "No organization for this user",
        status: 404,
      });
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: { googleReviewUrl },
    });

    return NextResponse.json({ data: { googleReviewUrl } });
  } catch (error) {
    return fromException(req, error, { stage: "review-link-patch" });
  }
}
