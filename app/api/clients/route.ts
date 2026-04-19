import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { withIdempotency } from "@/lib/idempotency";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        include: {
          reports: {
            select: {
              id: true,
              title: true,
              status: true,
              totalCost: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: { reports: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.client.count({ where }),
    ]);

    // RA-1204 — Open jobs are reports not yet in a terminal state. The
    // ReportStatus enum has no CANCELLED value, so terminal = COMPLETED
    // or ARCHIVED. openJobCount feeds the "N open" badge on the clients
    // table so the Client Name cell previews workload at a glance;
    // lastReportAt feeds the "Last report: 3 days ago" secondary line.
    // Both are derived from the already-fetched reports relation — no
    // extra query, no N+1 (CLAUDE.md rule 4).
    const TERMINAL_REPORT_STATUSES = new Set<string>(["COMPLETED", "ARCHIVED"]);

    // Calculate client statistics
    const clientsWithStats = clients.map((client: (typeof clients)[number]) => {
      const totalRevenue = client.reports.reduce(
        (sum: number, report: { totalCost: number | null }) =>
          sum + (report.totalCost || 0),
        0,
      );
      const lastReportAt =
        client.reports.length > 0 ? client.reports[0].createdAt : null;
      const openJobCount = client.reports.reduce(
        (n: number, r: { status: string }) =>
          TERMINAL_REPORT_STATUSES.has(r.status) ? n : n + 1,
        0,
      );

      return {
        ...client,
        totalRevenue,
        lastJob: lastReportAt
          ? new Date(lastReportAt).toLocaleDateString()
          : "Never",
        lastReportAt: lastReportAt ? lastReportAt.toISOString() : null,
        openJobCount,
        reportsCount: client._count.reports,
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
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
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
        return NextResponse.json(
          { error: "Name and email are required" },
          { status: 400 },
        );
      }

      const existingClient = await prisma.client.findFirst({
        where: { email, userId },
      });

      if (existingClient) {
        return NextResponse.json(
          { error: "Client with this email already exists" },
          { status: 400 },
        );
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
      console.error("Error creating client:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
