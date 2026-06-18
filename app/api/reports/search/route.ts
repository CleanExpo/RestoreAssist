import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    // RA-892 / RA-1167 / RA-6800: Build WHERE with positional parameters so all
    // user-supplied values are bound via $queryRawUnsafe — never interpolated.
    // Column names and SQL operators are hardcoded, not user-supplied.
    // Prisma.sql was removed in Prisma 6; $queryRawUnsafe is the correct API
    // for composable parameterized queries with dynamic WHERE clauses.
    const whereParams: unknown[] = [userId, tsquery];
    let pIdx = 2; // $1=userId, $2=tsquery already reserved

    let where = `"userId" = $1 AND search_vector @@ to_tsquery('english', $2)`;

    if (status && status !== "all") {
      where += ` AND "status" = $${++pIdx}`;
      whereParams.push(status);
    }

    if (hazardType && hazardType !== "all") {
      where += ` AND "hazardType" = $${++pIdx}`;
      whereParams.push(hazardType);
    }

    if (dateFrom) {
      where += ` AND "createdAt" >= $${++pIdx}::timestamp`;
      whereParams.push(dateFrom);
    }

    if (dateTo) {
      where += ` AND "createdAt" <= $${++pIdx}::timestamp`;
      whereParams.push(dateTo);
    }

    const limitIdx = ++pIdx;
    const offsetIdx = ++pIdx;

    const reports = (await prisma.$queryRawUnsafe(
      `SELECT
        id,
        "reportNumber",
        title,
        "clientName",
        "propertyAddress",
        "hazardType",
        "waterCategory",
        description,
        status,
        "createdAt",
        "updatedAt",
        ts_rank(search_vector, to_tsquery('english', $2)) as rank
      FROM "Report"
      WHERE ${where}
      ORDER BY rank DESC, "updatedAt" DESC
      LIMIT $${limitIdx}
      OFFSET $${offsetIdx}`,
      ...whereParams,
      limit,
      offset,
    )) as any[];

    const totalResult = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM "Report" WHERE ${where}`,
      ...whereParams,
    )) as [{ count: bigint }];

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
