import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPostgresTsquery, validateSearchParams } from "@/lib/search-utils";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const status = searchParams.get("status");
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20") || 20),
    );
    const offset = Math.max(
      0,
      parseInt(searchParams.get("offset") || "0") || 0,
    );

    const validation = validateSearchParams({
      q: q || "",
      limit,
      offset,
      status: status || undefined,
    });

    if (!validation.valid) {
      return apiError(request, {
        code: "VALIDATION",
        message: validation.errors?.join(", ") ?? "Invalid search parameters",
        status: 400,
      });
    }

    const query = validation.query!;
    const tsquery = toPostgresTsquery(query);
    const userId = session.user.id;

    // RA-6800: Prisma.sql removed in Prisma 6; use $queryRawUnsafe with
    // positional parameters. Column names are hardcoded; user values are bound.
    const whereParams: unknown[] = [userId, tsquery];
    let pIdx = 2;

    let where = `"userId" = $1 AND search_vector @@ to_tsquery('english', $2)`;

    if (status && status !== "all") {
      where += ` AND "status" = $${++pIdx}`;
      whereParams.push(status);
    }

    const limitIdx = ++pIdx;
    const offsetIdx = ++pIdx;

    const clients = (await prisma.$queryRawUnsafe(
      `SELECT
        id,
        name,
        email,
        phone,
        company,
        address,
        status,
        "createdAt",
        "updatedAt",
        ts_rank(search_vector, to_tsquery('english', $2)) as rank
      FROM "Client"
      WHERE ${where}
      ORDER BY rank DESC, "updatedAt" DESC
      LIMIT $${limitIdx}
      OFFSET $${offsetIdx}`,
      ...whereParams,
      limit,
      offset,
    )) as any[];

    const totalResult = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM "Client" WHERE ${where}`,
      ...whereParams,
    )) as [{ count: bigint }];

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
    return fromException(request, error, { stage: "clients-search" });
  }
}
