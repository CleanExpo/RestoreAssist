import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { parseSearchQuery, toPostgresTsquery } from "@/lib/search-utils";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 60 searches per 15 minutes per user
    const rateLimited = applyRateLimit(request, { maxRequests: 60, prefix: "search", key: session.user.id });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    // Parse and validate query
    const query = parseSearchQuery(q || "");
    if (!query) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const tsquery = toPostgresTsquery(query);

    // Search reports
    const reportLimit = Math.ceil(limit / 3);
    const reports = await prisma.$queryRaw<any[]>`
      SELECT
        id,
        reportNumber,
        clientName,
        propertyAddress,
        hazardType,
        status,
        createdAt,
        ts_rank(search_vector, to_tsquery('english', ${tsquery})) as rank
      FROM "Report"
      WHERE
        "userId" = ${session.user.id}
        AND search_vector @@ to_tsquery('english', ${tsquery})
      ORDER BY rank DESC, "updatedAt" DESC
      LIMIT ${reportLimit}
    `;

    // Search clients
    const clientLimit = Math.ceil(limit / 3);
    const clients = await prisma.$queryRaw<any[]>`
      SELECT
        id,
        name,
        email,
        phone,
        company,
        createdAt,
        ts_rank(search_vector, to_tsquery('english', ${tsquery})) as rank
      FROM "Client"
      WHERE
        "userId" = ${session.user.id}
        AND search_vector @@ to_tsquery('english', ${tsquery})
      ORDER BY rank DESC
      LIMIT ${clientLimit}
    `;

    // Search inspections
    const inspectionLimit = Math.ceil(limit / 3);
    const inspections = await prisma.$queryRaw<any[]>`
      SELECT
        id,
        inspectionNumber,
        propertyAddress,
        technicianName,
        status,
        createdAt,
        ts_rank(search_vector, to_tsquery('english', ${tsquery})) as rank
      FROM "Inspection"
      WHERE
        "userId" = ${session.user.id}
        AND search_vector @@ to_tsquery('english', ${tsquery})
      ORDER BY rank DESC
      LIMIT ${inspectionLimit}
    `;

    const results = {
      query,
      results: {
        reports: reports.map((r) => ({
          id: r.id,
          type: "report" as const,
          title: r.reportNumber || r.clientName,
          description: `${r.propertyAddress} - ${r.hazardType}`,
          url: `/dashboard/reports/${r.id}`,
          rank: r.rank,
          metadata: {
            status: r.status,
            propertyAddress: r.propertyAddress,
            hazardType: r.hazardType,
          },
        })),
        clients: clients.map((c) => ({
          id: c.id,
          type: "client" as const,
          title: c.name,
          description: `${c.email}${c.phone ? ` - ${c.phone}` : ""}${c.company ? ` - ${c.company}` : ""}`,
          url: `/dashboard/clients/${c.id}`,
          rank: c.rank,
          metadata: {
            email: c.email,
            phone: c.phone,
            company: c.company,
          },
        })),
        inspections: inspections.map((i) => ({
          id: i.id,
          type: "inspection" as const,
          title: i.inspectionNumber,
          description: `${i.propertyAddress}${i.technicianName ? ` - ${i.technicianName}` : ""}`,
          url: `/dashboard/inspections/${i.id}`,
          rank: i.rank,
          metadata: {
            status: i.status,
            propertyAddress: i.propertyAddress,
            technicianName: i.technicianName,
          },
        })),
      },
      totalCount:
        reports.length + clients.length + inspections.length,
    };

    return NextResponse.json(results);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
