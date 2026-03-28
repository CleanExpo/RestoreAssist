import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Validate search parameters
    const validation = validateSearchParams({
      q: q || "",
      limit,
      offset,
      status: status || undefined,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors?.join(", ") },
        { status: 400 }
      );
    }

    const query = validation.query!;
    const tsquery = toPostgresTsquery(query);

    // Build WHERE clause using Prisma.sql to ensure all values are parameterized
    const conditions: Prisma.Sql[] = [];
    conditions.push(Prisma.sql`"userId" = ${session.user.id}`);
    conditions.push(Prisma.sql`search_vector @@ to_tsquery('english', ${tsquery})`);

    if (status && status !== "all") {
      conditions.push(Prisma.sql`"status" = ${status}`);
    }

    const whereClause =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.sql``;

    // Execute search query
    const clients = await prisma.$queryRaw<any[]>`
      SELECT
        id,
        name,
        email,
        phone,
        company,
        address,
        status,
        "createdAt",
        "updatedAt",
        ts_rank(search_vector, to_tsquery('english', ${tsquery})) as rank
      FROM "Client"
      ${whereClause}
      ORDER BY rank DESC, "updatedAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count
    const totalResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM "Client"
      ${whereClause}
    `;

    const totalCount = Number(totalResult[0].count);

    return NextResponse.json({
      query,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
        address: c.address,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        rank: parseFloat(c.rank),
      })),
      totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    });
  } catch (error) {
    console.error("Clients search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
