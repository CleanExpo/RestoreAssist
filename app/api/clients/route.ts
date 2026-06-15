import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

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
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    // RA-1307 — bound pagination so ?page=-1 or ?limit=1e9 can't force
    // negative skip (Prisma throws) or unbounded result sets (OOM risk).
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "10") || 10),
    );
    const skip = (page - 1) * limit;

    const where: any = {
      userId: session.user.id,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.client.count({ where }),
    ]);

    // RA-6686 — Per-client report stats via aggregation over ONLY this page's
    // client IDs, instead of fetching the full reports[] relation per client
    // (which was unbounded and grew with client tenure). Indexed by
    // @@index([clientId, createdAt]).
    //
    // RA-1204 — Open jobs are reports not in a terminal state. ReportStatus has
    // no CANCELLED value, so terminal = COMPLETED or ARCHIVED.
    const TERMINAL_REPORT_STATUSES = ["COMPLETED", "ARCHIVED"] as const;
    const clientIds = clients.map((c) => c.id);

    const [statsByClient, openByClient] = await Promise.all([
      clientIds.length
        ? prisma.report.groupBy({
            by: ["clientId"],
            where: { clientId: { in: clientIds } },
            _sum: { totalCost: true },
            _max: { createdAt: true },
            _count: { _all: true },
          })
        : [],
      clientIds.length
        ? prisma.report.groupBy({
            by: ["clientId"],
            where: {
              clientId: { in: clientIds },
              status: { notIn: [...TERMINAL_REPORT_STATUSES] },
            },
            _count: { _all: true },
          })
        : [],
    ]);

    const statsMap = new Map(statsByClient.map((s) => [s.clientId, s]));
    const openMap = new Map(
      openByClient.map((s) => [s.clientId, s._count._all]),
    );

    const clientsWithStats = clients.map((client) => {
      const s = statsMap.get(client.id);
      const lastReportAt = s?._max.createdAt ?? null;
      return {
        ...client,
        totalRevenue: s?._sum.totalCost ?? 0,
        lastJob: lastReportAt
          ? new Date(lastReportAt).toLocaleDateString()
          : "Never",
        lastReportAt: lastReportAt ? lastReportAt.toISOString() : null,
        openJobCount: openMap.get(client.id) ?? 0,
        reportsCount: s?._count._all ?? 0,
      };
    });

    return NextResponse.json({
      clients: clientsWithStats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}

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

  // RA-1266: layered with the existing email-uniqueness check — catches
  // retries that haven't finished the first create yet (where the unique
  // index wouldn't have fired).
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
      const {
        name,
        email,
        phone,
        address,
        company,
        contactPerson,
        notes,
        status,
      } = body;

      if (!name || !email) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Name and email are required",
          status: 400,
        });
      }

      const existingClient = await prisma.client.findFirst({
        where: { email, userId },
      });

      if (existingClient) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Client with this email already exists",
          status: 400,
        });
      }

      const client = await prisma.client.create({
        data: {
          name,
          email,
          phone,
          address,
          company,
          contactPerson,
          notes,
          status: status || "ACTIVE",
          userId,
        },
        include: {
          _count: {
            select: { reports: true },
          },
        },
      });

      return NextResponse.json({
        ...client,
        totalRevenue: 0,
        lastJob: "Never",
        reportsCount: 0,
      });
    } catch (error) {
      return fromException(request, error, { stage: "create" });
    }
  });
}
