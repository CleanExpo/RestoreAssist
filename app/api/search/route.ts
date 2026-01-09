import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSearchQuery, toPostgresTsquery } from "@/lib/search-utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const reports = await prisma.$queryRaw`
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
      LIMIT ${Math.ceil(limit / 3)}::integer
    ` as any[];

    // Search clients
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
      LIMIT ${Math.ceil(limit / 3)}::integer
    `;

    // Search inspections
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
      LIMIT ${Math.ceil(limit / 3)}::integer
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
