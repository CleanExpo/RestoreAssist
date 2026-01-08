import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSearchQuery, toPostgresTsquery, validateSearchParams } from "@/lib/search-utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const status = searchParams.get("status");
    const hazardType = searchParams.get("hazardType");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Validate search parameters
    const validation = validateSearchParams({
      q: q || "",
      limit,
      offset,
      status: status || undefined,
      hazardType: hazardType || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors?.join(", ") },
        { status: 400 }
      );
    }

    const query = validation.query!;
    const tsquery = toPostgresTsquery(query);

    // Build WHERE clause
    let whereConditions = [`"userId" = '${session.user.id}'`];
    whereConditions.push(`search_vector @@ to_tsquery('english', '${tsquery}')`);

    if (status && status !== "all") {
      whereConditions.push(`"status" = '${status}'`);
    }

    if (hazardType && hazardType !== "all") {
      whereConditions.push(`"hazardType" = '${hazardType}'`);
    }

    if (dateFrom) {
      whereConditions.push(`"createdAt" >= '${dateFrom}'::timestamp`);
    }

    if (dateTo) {
      whereConditions.push(`"createdAt" <= '${dateTo}'::timestamp`);
    }

    const whereClause = whereConditions.join(" AND ");

    // Execute search query
    const reports = await prisma.$queryRaw<any[]>`
      SELECT
        id,
        reportNumber,
        title,
        clientName,
        propertyAddress,
        hazardType,
        waterCategory,
        description,
        status,
        createdAt,
        updatedAt,
        ts_rank(search_vector, to_tsquery('english', ${tsquery})) as rank
      FROM "Report"
      WHERE ${whereClause}
      ORDER BY rank DESC, "updatedAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count
    const totalResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM "Report"
      WHERE ${whereClause}
    `;

    const totalCount = Number(totalResult[0].count);

    return NextResponse.json({
      query,
      reports: reports.map((r) => ({
        id: r.id,
        reportNumber: r.reportNumber,
        title: r.title,
        clientName: r.clientName,
        propertyAddress: r.propertyAddress,
        hazardType: r.hazardType,
        waterCategory: r.waterCategory,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        rank: parseFloat(r.rank),
      })),
      totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    });
  } catch (error) {
    console.error("Reports search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
