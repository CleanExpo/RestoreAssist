/**
 * API Route: Feedback
 * POST - Submit feedback (authenticated)
 * GET  - List feedback: own for everyone. ?inbox=1 widens it: an ADMIN sees their
 *        own business's feedback; only allowlisted platform staff see every business.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { isPlatformSupportOperator } from "@/lib/auth/assert-tenancy";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "feedback-submit",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: stop duplicate feedback rows when the client retries.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { rating, whatDoing, whatHappened, page } = body;

      const feedback = await prisma.feedback.create({
        data: {
          userId,
          rating:
            typeof rating === "number" && rating >= 1 && rating <= 5
              ? rating
              : null,
          whatDoing:
            typeof whatDoing === "string" ? whatDoing.slice(0, 2000) : null,
          whatHappened:
            typeof whatHappened === "string"
              ? whatHappened.slice(0, 5000)
              : null,
          page: typeof page === "string" ? page.slice(0, 500) : null,
        },
      });

      return NextResponse.json({ id: feedback.id, success: true });
    } catch (err) {
      // RA-786: do not leak error.message to clients
      return fromException(request, err, { stage: "create" });
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const inbox = searchParams.get("inbox") === "1";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );
    const skip = (page - 1) * limit;

    // CLAUDE.md rule 3: re-validate role from DB for org-wide data access.
    // Every self-signup is ADMIN, so ADMIN means "owner of this business" and
    // never "RestoreAssist staff" (walkthrough finding 1, WP-01). Reach:
    //   platform staff (ADMIN + PLATFORM_SUPPORT_USER_IDS) -> every business
    //   ADMIN in an organisation                          -> that organisation
    //   anyone else                                       -> their own rows
    let inboxWhere: Prisma.FeedbackWhereInput | null = null;
    if (inbox) {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, organizationId: true },
      });
      if (dbUser?.role === "ADMIN") {
        const orgId = dbUser.organizationId;
        if (isPlatformSupportOperator(session.user.id)) {
          inboxWhere = {};
        } else if (typeof orgId === "string" && orgId.length > 0) {
          // A non-empty string only: an undefined that reached Prisma would be
          // dropped from the filter and match every business.
          inboxWhere = { user: { organizationId: orgId } };
        }
      }
    }

    if (inboxWhere) {
      const [items, total] = await Promise.all([
        prisma.feedback.findMany({
          where: inboxWhere,
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.feedback.count({ where: inboxWhere }),
      ]);
      return NextResponse.json({
        feedback: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.feedback.count({ where: { userId: session.user.id } }),
    ]);
    return NextResponse.json({
      feedback: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    // RA-786: do not leak error.message to clients
    return fromException(request, err, { stage: "load" });
  }
}
