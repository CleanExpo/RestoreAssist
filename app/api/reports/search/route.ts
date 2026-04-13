import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { toPostgresTsquery, validateSearchParams } from "@/lib/search-utils";

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
        { status: 400 },
      );
    }

    const query = validation.query!;
    const tsquery = toPostgresTsquery(query);
    const userId = session.user.id;

    // Build WHERE fragment using Prisma.sql for safe parameterization —
    // avoids the SQL-injection risk of string-interpolated whereClause.
    let whereFragment = Prisma.sql`"userId" = ${userId}
      AND search_vector @@ to_tsquery('english', ${tsquery})`;

    if (status && status !== "all") {
      whereFragment = Prisma.sql`${whereFragment} AND "status" = ${status}`;
    }

    if (hazardType && hazardType !== "all") {
      whereFragment = Prisma.sql`${whereFragment} AND "hazardType" = ${hazardType}`;
    }

    if (dateFrom) {
      whereFragment = Prisma.sql`${whereFragment} AND "createdAt" >= ${new Date(dateFrom)}`;
    }

    if (dateTo) {
      whereFragment = Prisma.sql`${whereFragment} AND "createdAt" <= ${new Date(dateTo)}`;
    }

    // Execute search query — all values are parameterized by Prisma.sql
    const reports = await prisma.$queryRaw<any[]>(Prisma.sql`
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
      WHERE ${whereFragment}
      ORDER BY rank DESC, "updatedAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    // Get total count
    const totalResult = await prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
      SELECT COUNT(*) as count
      FROM "Report"
      WHERE ${whereFragment}
    `);

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
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
